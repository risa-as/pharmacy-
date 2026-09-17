export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { getTenantContext } from '@/app/lib/tenant-utils';

const SEARCH_LIMIT = 20;
const DRUG_SEARCH_DAYS = 30;
const MAX_INT32 = 2147483647;

/**
 * Finds sales to return, the same two ways the desktop POS does:
 *  - invoice: exact invoice number (Arabic-Indic digits and a leading "#"
 *    accepted), or the id prefix of a sale that has no invoice number;
 *  - drug: sales from the last 30 days containing a drug whose trade name or
 *    barcode matches. Items are included so the client can show the match.
 */
async function searchSalesForReturn(mode: 'invoice' | 'drug', rawQuery: string, tenantBranchWhere: Record<string, any>) {
    const include = {
        payment: { select: { method: true } },
        patient: { select: { name: true } },
        branch: { select: { name: true } },
    };

    if (mode === 'invoice') {
        const normalized = rawQuery
            .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
            .replace(/^#/, '')
            .trim();
        const or: any[] = [];
        if (/^\d+$/.test(normalized)) {
            const n = Number(normalized);
            if (n <= MAX_INT32) or.push({ invoiceNumber: n });
        }
        // Id prefix only for sales without a number: only those show their id to
        // users (formatInvoiceNumber), and a numbered sale's uuid can start with
        // another invoice's digits (e.g. #13743 has id "138880f1-…").
        if (normalized.length >= 4) or.push({ invoiceNumber: null, id: { startsWith: normalized.toLowerCase() } });
        if (or.length === 0) return NextResponse.json([]);

        const sales = await prisma.sale.findMany({
            where: { ...tenantBranchWhere, OR: or },
            orderBy: { createdAt: 'desc' },
            take: SEARCH_LIMIT,
            include,
        });
        return NextResponse.json(sales);
    }

    if (rawQuery.length < 2) return NextResponse.json([]);
    const since = new Date(Date.now() - DRUG_SEARCH_DAYS * 24 * 60 * 60 * 1000);
    const sales = await prisma.sale.findMany({
        where: {
            ...tenantBranchWhere,
            createdAt: { gte: since },
            items: {
                some: {
                    drug: {
                        OR: [
                            { tradeName: { contains: rawQuery, mode: 'insensitive' } },
                            { barcode: { contains: rawQuery } },
                        ],
                    },
                },
            },
        },
        orderBy: { createdAt: 'desc' },
        take: SEARCH_LIMIT,
        include: {
            ...include,
            items: { select: { drugId: true, drug: { select: { tradeName: true, barcode: true } } } },
        },
    });
    return NextResponse.json(sales);
}

export async function GET(request: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        // Optional pagination/date filters — defaults keep the legacy shape (latest 20)
        const { searchParams } = new URL(request.url);
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '', 10) || 20, 1), 100);
        const offset = Math.max(parseInt(searchParams.get('offset') ?? '', 10) || 0, 0);
        const fromDate = searchParams.get('from') ? new Date(searchParams.get('from')!) : null;
        const toDate = searchParams.get('to') ? new Date(searchParams.get('to')!) : null;

        // Return lookup (mirrors the desktop SaleReturnModal): ?mode=invoice|drug&q=…
        const searchMode = searchParams.get('mode');
        const rawQuery = (searchParams.get('q') ?? '').trim();
        if (rawQuery && (searchMode === 'invoice' || searchMode === 'drug')) {
            return searchSalesForReturn(searchMode, rawQuery, tenantBranchWhere);
        }

        const where: any = { ...tenantBranchWhere };

        // ?mine=1 — only the signed-in user's own sales (the pharmacist's shift
        // summary). The id comes from the session, never from the query, so no
        // one can read another user's sales.
        if (searchParams.get('mine') === '1') where.userId = tenantCtx.user.id;

        if ((fromDate && !isNaN(fromDate.getTime())) || (toDate && !isNaN(toDate.getTime()))) {
            where.createdAt = {};
            if (fromDate && !isNaN(fromDate.getTime())) where.createdAt.gte = fromDate;
            if (toDate && !isNaN(toDate.getTime())) where.createdAt.lte = toDate;
        }

        const sales = await prisma.sale.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
            // Additive: lets list views label cash / card / credit without a detail fetch.
            include: { payment: { select: { method: true } } },
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
        const { items, totalAmount, patientId, discount } = body;

        // Supported methods for this endpoint: cash, card, credit. Legacy clients
        // that omit the field are cash sales.
        const paymentMethod: 'CASH' | 'CARD' | 'CREDIT' = body.paymentMethod ?? 'CASH';
        if (!['CASH', 'CARD', 'CREDIT'].includes(paymentMethod)) {
            return NextResponse.json({ message: 'طريقة الدفع غير مدعومة.' }, { status: 400 });
        }
        if (paymentMethod === 'CREDIT' && !patientId) {
            return NextResponse.json({ message: 'البيع الآجل يتطلب اختيار عميل.' }, { status: 400 });
        }

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
                const originalPrice = Number.isFinite(Number(item.originalPrice)) ? Number(item.originalPrice) : null;
                saleItemsData.push({
                    drugId: item.drugId,
                    quantity: item.quantity,
                    price: item.price,
                    originalPrice,
                    cost: unitCost
                });
            }

            // Same rule as the sale-edit route: a line whose price differs from
            // the list price it was added at makes the invoice price-overridden,
            // which is what the dashboard flags in amber.
            const hasPriceOverride = saleItemsData.some(
                i => i.originalPrice != null && i.price !== i.originalPrice
            );

            // 4. Find the branch's default CASH_DRAWER safe — CASH only. Card
            //    sales are recorded as a CARD payment without touching the drawer,
            //    matching the desktop app and the web POS.
            const cashSafe = paymentMethod === 'CASH'
                ? await tx.safe.findFirst({
                    where: { branchId: user.branchId!, type: 'CASH_DRAWER' },
                    select: { id: true }
                })
                : null;

            // 5. Create Sale (linked to the safe only for CASH)
            const newSale = await tx.sale.create({
                data: {
                    branchId: user.branchId!,
                    userId: user.id,
                    total: totalAmount,
                    discount: discount ?? 0,
                    patientId: patientId || null,
                    safeId: cashSafe?.id ?? null,
                    hasPriceOverride,
                    ...(invoiceNumber !== undefined ? { invoiceNumber } : {}),
                    items: { create: saleItemsData }
                }
            });

            // 6. Create Payment record
            await tx.payment.create({
                data: {
                    saleId: newSale.id,
                    amount: totalAmount,
                    method: paymentMethod,
                    status: 'COMPLETED' as any,
                }
            });

            // 7. CASH: update safe balance + create Transaction record
            if (paymentMethod === 'CASH' && cashSafe) {
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
