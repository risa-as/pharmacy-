import { readAllocations, restoreSaleReturnStock } from '@/app/lib/sale-return-stock';
import { Prisma } from '@prisma/client';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

/**
 * GET /api/sales/[id]
 * تفاصيل فاتورة بيع — الأصناف والمريض والدفع والمرتجعات السابقة.
 * متاح لأي مستخدم موثّق ضمن نطاق مؤسسته/فرعه.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        // Tenant isolation via the where clause: out-of-scope sales read as 404
        const sale = await prisma.sale.findFirst({
            where: { id: params.id, ...tenantBranchWhere },
            include: {
                items: { include: { drug: { select: { tradeName: true } } } },
                patient: { select: { id: true, name: true } },
                payment: true,
                returns: {
                    include: { items: true },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!sale) {
            return NextResponse.json({ message: 'الفاتورة غير موجودة.' }, { status: 404 });
        }

        return NextResponse.json(sale);
    } catch (error) {
        console.error('GET /api/sales/[id] error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PUT /api/sales/[id]
 * تعديل فاتورة بيع (الكميات، الأسعار، الخصم) — للمدير فقط.
 * يعالج فروقات المخزون والصندوق/الدين بشكل ذرّي للحفاظ على السلامة المالية.
 */
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { user } = tenantCtx;

        const isSuperAdmin = user.role === 'SUPER_ADMIN';
        const isAdmin = user.role === 'ADMIN';
        if (!isSuperAdmin && !isAdmin) {
            return NextResponse.json({ message: 'تعديل الفواتير متاح للمدير فقط.' }, { status: 403 });
        }

        const saleId = params.id;
        const body = await request.json();
        const { items, discount } = body as {
            items: { drugId: string; quantity: number; price: number }[];
            discount?: number;
        };

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ message: 'يجب تحديد أصناف الفاتورة.' }, { status: 400 });
        }

        // Fetch the original sale with everything we need to reconcile
        const sale = await prisma.sale.findUnique({
            where: { id: saleId },
            include: {
                items: true,
                returns: true,
                branch: { select: { organizationId: true } },
                payment: true,
            },
        });

        if (!sale) {
            return NextResponse.json({ message: 'الفاتورة غير موجودة.' }, { status: 404 });
        }

        // Tenant isolation: admins may only edit sales within their organization
        if (!isSuperAdmin && sale.branch.organizationId !== user.organizationId) {
            return NextResponse.json({ message: 'هذه الفاتورة لا تتبع مؤسستك.' }, { status: 403 });
        }

        // Editing a sale that already has returns is too complex to reconcile safely
        if (sale.returns.length > 0) {
            return NextResponse.json(
                { message: 'لا يمكن تعديل فاتورة تحتوي على مرتجعات. يرجى التعامل مع المرتجعات أولاً.' },
                { status: 400 }
            );
        }

        // Map original items by drugId for diffing
        const originalByDrug = new Map(sale.items.map((it) => [it.drugId, it]));

        // Validate: every submitted item must belong to the original sale
        const newDiscount = Math.max(0, Number(discount) || 0);
        let subtotal = 0;
        for (const item of items) {
            if (!originalByDrug.has(item.drugId)) {
                return NextResponse.json(
                    { message: `الصنف ${item.drugId} ليس ضمن الفاتورة الأصلية.` },
                    { status: 400 }
                );
            }
            const qty = Number(item.quantity);
            const price = Number(item.price);
            if (!Number.isFinite(qty) || qty < 0) {
                return NextResponse.json({ message: 'كمية غير صالحة.' }, { status: 400 });
            }
            if (!Number.isFinite(price) || price < 0) {
                return NextResponse.json({ message: 'سعر غير صالح.' }, { status: 400 });
            }
            subtotal += qty * price;
        }

        const newTotal = Math.max(0, subtotal - newDiscount);
        const oldTotal = sale.total;
        const totalDelta = newTotal - oldTotal; // >0 means customer owes/paid more

        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${sale.id} FOR UPDATE`;
            const current = await tx.sale.findUnique({ where: { id: sale.id }, include: { returns: true } });
            if (!current || current.updatedAt.getTime() !== sale.updatedAt.getTime() || current.returns.length) throw new Error('تغيرت الفاتورة؛ حدّث البيانات قبل تعديلها.');
            let hasPriceOverride = false;

            // 1. Reconcile each item: stock + cost + the SaleItem row itself
            for (const submitted of items) {
                const original = originalByDrug.get(submitted.drugId)!;
                const newQty = Number(submitted.quantity);
                const newPrice = Number(submitted.price);
                const qtyDelta = newQty - original.quantity; // >0 = sold more (take stock)

                if (original.originalPrice != null && newPrice !== original.originalPrice) {
                    hasPriceOverride = true;
                }

                const inventory = await tx.inventory.findFirst({
                    where: { branchId: sale.branchId, drugId: submitted.drugId },
                    include: { batches: { orderBy: { expiryDate: 'asc' }, where: { quantity: { gt: 0 }, expiryDate: { gt: new Date() } } } },
                });

                let allocations = readAllocations(original.batchAllocations);
                let newCost = original.cost; // unit cost; unchanged when qty drops

                if (qtyDelta > 0 && inventory) {
                    // Took more stock — deduct FEFO and recompute weighted unit cost
                    let remaining = qtyDelta;
                    let addedCost = 0;
                    for (const batch of inventory.batches) {
                        if (remaining <= 0) break;
                        const take = Math.min(batch.quantity, remaining);
                        addedCost += take * batch.costPrice;
                        const changed = await tx.batch.updateMany({ where: { id: batch.id, quantity: { gte: take }, expiryDate: { gt: new Date() } }, data: { quantity: { decrement: take } } });
                        if (changed.count !== 1) throw new Error('تغير المخزون؛ أعد المحاولة.');
                        allocations.push({ batchId: batch.id, quantity: take });
                        remaining -= take;
                    }
                    if (remaining > 0) throw new Error('المخزون الصالح لا يكفي للزيادة.');
                    const totalCost = original.cost * original.quantity + addedCost;
                    newCost = newQty > 0 ? totalCost / newQty : 0;
                } else if (qtyDelta < 0 && inventory) {
                    const restored = await restoreSaleReturnStock(tx, sale.branchId, [original], [{ items: [{ drugId: original.drugId, quantity: newQty }] }], [{ drugId: original.drugId, quantity: -qtyDelta, price: original.price }]);
                    if (restored[0].stockStatus !== 'RESTOCKED') throw new Error('الدفعة الأصلية غير موثقة أو منتهية. استخدم مراجعة الإرجاع بدل إنقاص الفاتورة.');
                    let keep = newQty;
                    allocations = allocations.flatMap(a => { const quantity = Math.min(keep, a.quantity); keep -= quantity; return quantity > 0 ? [{ ...a, quantity }] : []; });
                } else if (qtyDelta !== 0) throw new Error('مخزون الصنف غير موجود.');

                if (newQty <= 0) {
                    // Item removed from the invoice entirely
                    await tx.saleItem.delete({ where: { id: original.id } });
                } else {
                    await tx.saleItem.update({
                        where: { id: original.id },
                        data: { quantity: newQty, price: newPrice, cost: newCost, batchAllocations: original.batchAllocations || qtyDelta !== 0 ? JSON.stringify(allocations) : null },
                    });
                }
            }

            // 2. Update the sale header
            const updatedSale = await tx.sale.update({
                where: { id: sale.id },
                data: {
                    total: newTotal,
                    discount: newDiscount,
                    hasPriceOverride,
                },
            });

            // 3. Keep the Payment amount in sync
            if (sale.payment) {
                await tx.payment.update({
                    where: { saleId: sale.id },
                    data: { amount: newTotal },
                });
            }

            // 4. Reconcile money: patient debt (CREDIT) or safe cash (else)
            if (Math.abs(totalDelta) > 0.001) {
                if (sale.patientId && sale.payment?.method === 'CREDIT') {
                    await tx.patient.update({
                        where: { id: sale.patientId },
                        data: { balance: { increment: totalDelta } },
                    });
                } else if (sale.safeId) {
                    await tx.safe.update({
                        where: { id: sale.safeId },
                        data: { balance: { increment: totalDelta } },
                    });
                    await tx.transaction.create({
                        data: {
                            safeId: sale.safeId,
                            type: totalDelta > 0 ? 'IN' : 'OUT',
                            amount: Math.abs(totalDelta),
                            referenceType: 'SALE_EDIT',
                            referenceId: sale.id,
                            description: `تعديل فاتورة #${sale.invoiceNumber ?? sale.documentNumber}`,
                            userId: user.id,
                        },
                    });
                }
            }

            return updatedSale;
        });

        return NextResponse.json({ success: true, sale: result, message: 'تم تعديل الفاتورة بنجاح' });
    } catch (error: any) {
        console.error('API Sale Edit Error:', error);
        return NextResponse.json(
            { message: error.message || 'خطأ أثناء تعديل الفاتورة' },
            { status: 500 }
        );
    }
}
