export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { getTenantContext } from '@/app/lib/tenant-utils';

export async function GET(request: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const sales = await prisma.sale.findMany({
            where: tenantBranchWhere,
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        return NextResponse.json(sales);
    } catch (error) {
        console.error('GET /api/sales error:', error);
        return NextResponse.json({ error: 'Failed to fetch sales' }, { status: 500 }); // Fix #7: proper error response
    }
}

export async function POST(request: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { user } = tenantCtx;

        if (!tenantCtx.userPermissions.canSell) {
            return NextResponse.json({ message: 'ليس لديك صلاحية لإتمام عمليات البيع.' }, { status: 403 });
        }

        if (!user || (!user.branchId && user.role !== 'SUPER_ADMIN')) {
            return NextResponse.json({ message: 'Unauthorized or No Branch Assigned' }, { status: 401 });
        }

        const body = await request.json();
        const { items, totalAmount, patientId, discount, paymentMethod } = body;

        if (discount && discount > 0 && !tenantCtx.userPermissions.canApplyDiscount) {
            return NextResponse.json({ message: 'ليس لديك صلاحية لتطبيق الخصم.' }, { status: 403 });
        }

        // 1. Extract Idempotency Key
        const idempotencyKey = String(request.headers.get('x-idempotency-key') || body.clientActionId || '').trim();

        // 2. Check if already processed
        if (idempotencyKey) {
            const existingLog = await prisma.syncActionLog.findUnique({
                where: { idempotencyKey }
            });
            if (existingLog) {
                console.log(`[Sales API] Duplicate request detected. Key: ${idempotencyKey}`);
                return NextResponse.json({
                    success: true,
                    message: 'Duplicate sale ignored safely',
                    ack: { status: 'duplicate', idempotencyKey }
                });
            }
        }

        // Resolve organizationId for the per-org invoice counter
        const orgId = tenantCtx.organizationId ?? (
            user.branchId
                ? (await prisma.branch.findUnique({ where: { id: user.branchId }, select: { organizationId: true } }))?.organizationId
                : undefined
        );

        const sale = await prisma.$transaction(async (tx) => {
            // Assign per-org sequential invoice number atomically
            let invoiceNumber: number | undefined;
            if (orgId) {
                const [counter] = await tx.$queryRaw<[{ nextNumber: bigint }]>`
                    INSERT INTO "InvoiceCounter" ("organizationId", "nextNumber")
                    VALUES (${orgId}::text, 2)
                    ON CONFLICT ("organizationId")
                    DO UPDATE SET "nextNumber" = "InvoiceCounter"."nextNumber" + 1
                    RETURNING "nextNumber"
                `;
                invoiceNumber = Number(counter.nextNumber) - 1;
            }

            // Fix #3: Batch-fetch all inventory + batches BEFORE the loop (eliminates N+1)
            const drugIds = items.map((i: any) => i.drugId);
            const allInventories = await tx.inventory.findMany({
                where: { branchId: user.branchId!, drugId: { in: drugIds } },
                include: {
                    batches: {
                        orderBy: { expiryDate: 'asc' },
                        where: { quantity: { gt: 0 } }
                    }
                }
            });
            const inventoryMap = new Map(allInventories.map(inv => [inv.drugId, inv]));

            const saleItemsData = [];

            // 3. Decrement Stock (FEFO) and Calculate Cost
            for (const item of items) {
                let itemTotalCost = 0;
                let remainingToDeduct = item.quantity;

                const inventory = inventoryMap.get(item.drugId);

                if (inventory && inventory.batches.length > 0) {
                    for (const batch of inventory.batches) {
                        if (remainingToDeduct <= 0) break;
                        const deduction = Math.min(batch.quantity, remainingToDeduct);
                        itemTotalCost += deduction * batch.costPrice;
                        await tx.batch.update({
                            where: { id: batch.id },
                            data: { quantity: { decrement: deduction } }
                        });
                        remainingToDeduct -= deduction;
                    }
                }

                if (remainingToDeduct > 0 && inventory) {
                    // Fallback: log warning for over-sell scenarios
                    console.warn(`[Sales] Over-sell detected for drugId=${item.drugId}, remaining=${remainingToDeduct}. Using inventory.cost as fallback.`);
                    itemTotalCost += remainingToDeduct * inventory.cost;
                }

                const unitCost = item.quantity > 0 ? (itemTotalCost / item.quantity) : 0;
                saleItemsData.push({
                    drugId: item.drugId,
                    quantity: item.quantity,
                    price: item.price,
                    cost: unitCost
                });
            }

            // 4. Find the branch's default CASH_DRAWER safe (for CASH payments)
            const cashSafe = paymentMethod !== 'CREDIT'
                ? await tx.safe.findFirst({
                    where: { branchId: user.branchId!, type: 'CASH_DRAWER' },
                    select: { id: true }
                })
                : null;

            // 5. Create Sale (link to safe if CASH)
            const newSale = await tx.sale.create({
                data: {
                    branchId: user.branchId!,
                    userId: user.id,
                    total: totalAmount,
                    discount: discount ?? 0,
                    patientId: patientId || null,
                    safeId: cashSafe?.id ?? null,
                    ...(invoiceNumber !== undefined ? { invoiceNumber } : {}),
                    items: { create: saleItemsData }
                }
            });

            // 6. Create Payment record
            await tx.payment.create({
                data: {
                    saleId: newSale.id,
                    amount: totalAmount,
                    method: (paymentMethod ?? 'CASH') as any,
                    status: 'COMPLETED' as any,
                }
            });

            // 7. CASH: update safe balance + create Transaction record
            if (paymentMethod !== 'CREDIT' && cashSafe) {
                await tx.safe.update({
                    where: { id: cashSafe.id },
                    data: { balance: { increment: totalAmount } }
                });
                await tx.transaction.create({
                    data: {
                        safeId: cashSafe.id,
                        type: 'IN',
                        amount: totalAmount,
                        referenceType: 'SALE',
                        referenceId: newSale.id,
                        description: `بيع #${newSale.id.slice(0, 8)}`,
                        userId: user.id,
                    }
                });
            }

            // 8. CREDIT: add debt to patient balance
            if (paymentMethod === 'CREDIT' && patientId) {
                await tx.patient.update({
                    where: { id: patientId },
                    data: { balance: { increment: totalAmount } },
                });
            }

            // 9. Record Idempotency Key
            if (idempotencyKey) {
                await tx.syncActionLog.create({
                    data: {
                        idempotencyKey,
                        actionType: 'SALE',
                        branchId: user.branchId!,
                        status: 'PROCESSED'
                    }
                });
            }

            return newSale;
        });

        return NextResponse.json({
            success: true,
            sale,
            ack: { status: 'processed', idempotencyKey }
        });

    } catch (error) {
        console.error('API Sales Error:', error);
        return NextResponse.json(
            { message: 'Error creating sale' },
            { status: 500 }
        );
    }
}
