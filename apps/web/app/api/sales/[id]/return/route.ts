import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { user } = tenantCtx;

        if (!user.branchId && user.role !== 'SUPER_ADMIN') {
            return NextResponse.json({ message: 'No Branch Assigned' }, { status: 403 });
        }

        const saleId = params.id;
        const body = await request.json();
        const { items, notes, safeId } = body;

        if (!items || !items.length) {
            return NextResponse.json({ message: 'No items provided for return' }, { status: 400 });
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

        // Calculate maximum returnable quantities
        const returnableQuantities: Record<string, number> = {};
        const orgPrices: Record<string, number> = {};

        for (const item of sale.items) {
            returnableQuantities[item.drugId] = item.quantity;
            orgPrices[item.drugId] = item.price;
        }

        for (const returnRecord of sale.returns) {
            for (const item of returnRecord.items) {
                if (returnableQuantities[item.drugId] !== undefined) {
                    returnableQuantities[item.drugId] -= item.quantity;
                }
            }
        }

        let totalReturnAmount = 0;
        const returnItemsData: any[] = [];

        // Validate items and calculate total amount
        for (const item of items) {
            const { drugId, quantity } = item;
            if (!quantity || quantity <= 0) {
                return NextResponse.json({ message: `Invalid quantity for drug ${drugId}` }, { status: 400 });
            }
            if (returnableQuantities[drugId] === undefined) {
                return NextResponse.json({ message: `Drug ${drugId} was not part of this sale` }, { status: 400 });
            }
            if (quantity > returnableQuantities[drugId]) {
                return NextResponse.json({ message: `Cannot return ${quantity} of drug ${drugId}. Only ${returnableQuantities[drugId]} available to return.` }, { status: 400 });
            }

            const price = orgPrices[drugId];
            totalReturnAmount += price * quantity;

            returnItemsData.push({
                drugId,
                quantity,
                price
            });
        }

        const result = await prisma.$transaction(async (tx) => {
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
                                expiryDate: distantExpiry,
                                batchNumber: `RET-${Date.now()}`,
                            }
                        });
                    }
                }
            }

            return saleReturn;
        });

        return NextResponse.json({
            success: true,
            saleReturn: result,
            message: 'Return processed successfully'
        });

    } catch (error: any) {
        console.error('API Sale Return Error:', error);
        return NextResponse.json(
            { message: error.message || 'Error processing return' },
            { status: 500 }
        );
    }
}
