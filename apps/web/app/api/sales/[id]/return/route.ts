import { Prisma } from '@prisma/client';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

class DuplicateReturnError extends Error {}
class ReturnValidationError extends Error {}

async function isProcessedReturn(idempotencyKey: string): Promise<boolean> {
    return !!(await prisma.syncActionLog.findUnique({ where: { idempotencyKey } }));
}

function duplicateResponse(idempotencyKey: string) {
    return NextResponse.json({
        success: true,
        duplicate: true,
        message: 'تم تسجيل هذا الإرجاع مسبقاً.',
        ack: { status: 'duplicate', idempotencyKey: idempotencyKey || null },
    });
}

/**
 * Returnable quantity per drug = sold − already returned. Prices always come
 * from the original sale lines, never from the client.
 */
function validateReturnItems(
    saleItems: { drugId: string; quantity: number; price: number }[],
    priorReturns: { items: { drugId: string; quantity: number }[] }[],
    requested: { drugId: string; quantity: number }[],
) {
    const returnable: Record<string, number> = {};
    const prices: Record<string, number> = {};
    for (const item of saleItems) {
        returnable[item.drugId] = (returnable[item.drugId] ?? 0) + item.quantity;
        prices[item.drugId] = item.price;
    }
    for (const r of priorReturns) {
        for (const item of r.items) {
            if (returnable[item.drugId] !== undefined) returnable[item.drugId] -= item.quantity;
        }
    }

    let totalReturnAmount = 0;
    const returnItemsData: { drugId: string; quantity: number; price: number }[] = [];
    const seen = new Set<string>();
    for (const { drugId, quantity } of requested) {
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new ReturnValidationError('كمية الإرجاع غير صالحة.');
        }
        if (returnable[drugId] === undefined) {
            throw new ReturnValidationError('أحد الأصناف ليس ضمن هذه الفاتورة.');
        }
        if (seen.has(drugId)) {
            throw new ReturnValidationError('الصنف مكرر في طلب الإرجاع.');
        }
        seen.add(drugId);
        if (quantity > returnable[drugId]) {
            throw new ReturnValidationError(
                returnable[drugId] <= 0
                    ? 'هذا الصنف أُرجع بالكامل مسبقاً.'
                    : `لا يمكن إرجاع ${quantity}؛ المتاح للإرجاع ${returnable[drugId]} فقط.`,
            );
        }
        totalReturnAmount += prices[drugId] * quantity;
        returnItemsData.push({ drugId, quantity, price: prices[drugId] });
    }
    return { totalReturnAmount, returnItemsData };
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    let idempotencyKey = '';
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { user } = tenantCtx;

        if (!tenantCtx.userPermissions.canProcessReturn) {
            return NextResponse.json({ message: 'ليس لديك صلاحية لمعالجة المرتجعات.' }, { status: 403 });
        }

        if (!user.branchId && user.role !== 'SUPER_ADMIN') {
            return NextResponse.json({ message: 'No Branch Assigned' }, { status: 403 });
        }

        const saleId = params.id;
        const body = await request.json();
        const { items, notes, safeId } = body;

        if (!items || !items.length) {
            return NextResponse.json({ message: 'No items provided for return' }, { status: 400 });
        }

        // A retried request (e.g. the response was lost after the server
        // committed) carries the same key and must not create a second return.
        idempotencyKey = String(request.headers.get('x-idempotency-key') || body.clientActionId || '').trim();
        if (idempotencyKey && await isProcessedReturn(idempotencyKey)) {
            return duplicateResponse(idempotencyKey);
        }

        // Fetch the original sale
        const sale = await prisma.sale.findUnique({
            where: { id: saleId },
            include: {
                items: true,
                returns: { include: { items: true } },
                patient: true,
                payment: true,
            }
        });

        if (!sale) {
            return NextResponse.json({ message: 'Sale not found' }, { status: 404 });
        }

        if (sale.branchId !== user.branchId) {
            return NextResponse.json({ message: 'Sale does not belong to your branch' }, { status: 403 });
        }

        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // 0. Serialize returns on this sale: lock the sale row, then re-check
            //    the key and re-read previous returns inside the lock so two
            //    concurrent requests can never both pass validation.
            await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
            if (idempotencyKey && await tx.syncActionLog.findUnique({ where: { idempotencyKey } })) {
                throw new DuplicateReturnError();
            }
            const priorReturns = await tx.saleReturn.findMany({
                where: { saleId },
                select: { items: { select: { drugId: true, quantity: true } } },
            });
            const { totalReturnAmount, returnItemsData } = validateReturnItems(sale.items, priorReturns, items);

            // 1. Create SaleReturn record
            const saleReturn = await tx.saleReturn.create({
                data: {
                    saleId: sale.id,
                    branchId: user.branchId!,
                    safeId: safeId || sale.safeId, // Use provided safe or original sale's safe
                    total: totalReturnAmount,
                    notes: notes || null,
                    items: {
                        create: returnItemsData
                    }
                }
            });

            // 2. Adjust Financials
            if (sale.patientId && sale.payment?.method === 'CREDIT') {
                // If it was a credit sale, reduce the patient's debt balance
                await tx.patient.update({
                    where: { id: sale.patientId },
                    data: {
                        balance: { decrement: totalReturnAmount }
                    }
                });
            } else if (saleReturn.safeId) {
                // Return cash from the safe
                await tx.safe.update({
                    where: { id: saleReturn.safeId },
                    data: {
                        balance: { decrement: totalReturnAmount }
                    }
                });

                // Record the transaction
                await tx.transaction.create({
                    data: {
                        safeId: saleReturn.safeId,
                        type: 'OUT',
                        amount: totalReturnAmount,
                        referenceType: 'SALE_RETURN',
                        referenceId: saleReturn.id,
                        description: `Return for sale ${sale.id}`,
                        userId: user.id
                    }
                });
            }

            // 3. Increment Stock (FIFO reverse / put back to the longest-expiry batch)
            for (const item of returnItemsData) {
                const inventory = await tx.inventory.findFirst({
                    where: { branchId: user.branchId!, drugId: item.drugId },
                    include: { batches: { orderBy: { expiryDate: 'desc' }, take: 1 } }
                });

                if (inventory) {
                    if (inventory.batches.length > 0) {
                        const batch = inventory.batches[0];
                        await tx.batch.update({
                            where: { id: batch.id },
                            data: { quantity: batch.quantity + item.quantity }
                        });
                    } else {
                        // If no batch exists somehow (rare), we could create a dummy batch, 
                        // but let's assume one exists or we just create a new one with a default distant expiry.
                        const distantExpiry = new Date();
                        distantExpiry.setFullYear(distantExpiry.getFullYear() + 2);

                        await tx.batch.create({
                            data: {
                                inventoryId: inventory.id,
                                quantity: item.quantity,
                                initialQuantity: item.quantity,
                                expiryDate: distantExpiry,
                                batchNumber: `RET-${Date.now()}`,
                            }
                        });
                    }
                }
            }

            // 4. Record the key in the same transaction as the return itself
            if (idempotencyKey) {
                await tx.syncActionLog.create({
                    data: { idempotencyKey, actionType: 'SALE_RETURN', branchId: user.branchId!, status: 'PROCESSED' },
                });
            }

            return saleReturn;
        }, {
            // A concurrent return on the same invoice waits on the row lock.
            maxWait: 5000,
            timeout: 20000,
        });

        return NextResponse.json({
            success: true,
            saleReturn: result,
            message: 'Return processed successfully',
            ack: { status: 'processed', idempotencyKey: idempotencyKey || null },
        });

    } catch (error: any) {
        if (error instanceof DuplicateReturnError) {
            return duplicateResponse(idempotencyKey);
        }
        if (error instanceof ReturnValidationError) {
            return NextResponse.json({ message: error.message }, { status: 400 });
        }
        // The same key reused for a different sale loses the race on the log's primary key.
        if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return duplicateResponse(idempotencyKey);
        }
        console.error('API Sale Return Error:', error);
        return NextResponse.json(
            { message: error.message || 'Error processing return' },
            { status: 500 }
        );
    }
}
