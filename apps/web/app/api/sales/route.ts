import { Prisma } from '@prisma/client';
export const dynamic = 'force-dynamic';


import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

import { getTenantContext } from '@/app/lib/tenant-utils';

// Helper to validate user from token (Mock implementation matching login)
// Deprecated: Using auth session via getTenantContext for security
async function getUserFromRequest(request: Request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.split(' ')[1];
    try {
        // Token format: base64(email:timestamp)
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const email = decoded.split(':')[0];

        const user = await prisma.user.findUnique({
            where: { email },
            include: { branch: true }
        });
        return user;
    } catch {
        return null;
    }
}

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
        return NextResponse.json([], { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { user } = tenantCtx;

        if (!user || (!user.branchId && user.role !== 'SUPER_ADMIN')) {
            return NextResponse.json({ message: 'Unauthorized or No Branch Assigned' }, { status: 401 });
        }

        const body = await request.json();
        const { items, totalAmount, patientId, discount, paymentMethod } = body;

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

        const sale = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const saleItemsData = [];

            // 3. Decrement Stock (FEFO) and Calculate Cost
            for (const item of items) {
                let itemTotalCost = 0;
                let remainingToDeduct = item.quantity;

                const inventory = await tx.inventory.findFirst({
                    where: { branchId: user.branchId!, drugId: item.drugId },
                    include: { batches: { orderBy: { expiryDate: 'asc' }, where: { quantity: { gt: 0 } } } }
                });

                if (inventory && inventory.batches.length > 0) {
                    for (const batch of inventory.batches) {
                        if (remainingToDeduct <= 0) break;
                        const deduction = Math.min(batch.quantity, remainingToDeduct);
                        itemTotalCost += deduction * batch.costPrice;
                        await tx.batch.update({
                            where: { id: batch.id },
                            data: { quantity: batch.quantity - deduction }
                        });
                        remainingToDeduct -= deduction;
                    }
                }
                if (remainingToDeduct > 0 && inventory) {
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
                        description: `بيع موبايل #${newSale.id.slice(0, 8)}`,
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
