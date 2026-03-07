import { Prisma } from '@prisma/client';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const { id } = params;
        const body = await req.json();

        // items should be an array of: { batchId, actualQuantity, systemQuantity, costPrice, reason }
        const { items, notes, status } = body;

        const stocktake = await prisma.stocktake.findUnique({
            where: { id },
            include: { items: true }
        });

        if (!stocktake) {
            return NextResponse.json({ error: "Stocktake not found" }, { status: 404 });
        }

        if (stocktake.status !== "PENDING") {
            return NextResponse.json({ error: "Can only update PENDING stocktakes" }, { status: 400 });
        }

        let updatedStocktake;

        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // 1. Delete all existing items for this stocktake (since we send the full current state of the count)
            await tx.stocktakeItem.deleteMany({
                where: { stocktakeId: id }
            });

            // 2. Insert new items and compute financial difference
            let totalDiscrepancyAmount = 0;

            const stocktakeItemsData = items.map((item: any) => {
                const difference = item.actualQuantity - item.systemQuantity;
                // Financial impact: negative difference means we lost money (missing/expired)
                const itemDiscrepancyValue = difference * item.costPrice;
                totalDiscrepancyAmount += itemDiscrepancyValue;

                return {
                    stocktakeId: id,
                    batchId: item.batchId,
                    systemQuantity: item.systemQuantity,
                    actualQuantity: item.actualQuantity,
                    difference: difference,
                    costPrice: item.costPrice,
                    reason: item.reason || null
                };
            });

            if (stocktakeItemsData.length > 0) {
                await tx.stocktakeItem.createMany({
                    data: stocktakeItemsData
                });
            }

            // 3. Update the stocktake header
            updatedStocktake = await tx.stocktake.update({
                where: { id },
                data: {
                    notes: notes !== undefined ? notes : stocktake.notes,
                    status: status || stocktake.status,
                    totalDiscrepancyAmount: totalDiscrepancyAmount
                },
                include: { items: true }
            });

            // 4. If status is changing to COMPLETED, apply the changes to actual Inventory
            if (status === "COMPLETED") {
                for (const item of stocktakeItemsData) {
                    if (item.difference !== 0) {
                        // Update Batch
                        const batch = await tx.batch.update({
                            where: { id: item.batchId },
                            data: { quantity: item.actualQuantity }
                        });

                        // Update Inventory (remove quantity, only stock is calc from batches)
                        // Inventory does not have quantity field directly if it aggregates batches
                        // But if it does, it's minStock/maxStock. Actually we shouldn't update inventory quantity if it's computed.
                        // Let's just update the batch.
                    }
                }

                // 5. If we have a negative discrepancy (Lost stock), record as an Expense
                if (totalDiscrepancyAmount < 0) {
                    // Negative amount is a loss, we record expense as a positive number
                    const lossValue = Math.abs(totalDiscrepancyAmount);
                    await tx.expense.create({
                        data: {
                            amount: lossValue,
                            category: "نواقص وتوالف الجرد",
                            description: `تسوية جرد رقم: ${id.slice(0, 8)}`,
                            branchId: stocktake.branchId,
                            date: new Date()
                        }
                    });
                }
            }
        });

        return NextResponse.json({ success: true, stocktake: updatedStocktake });
    } catch (error: any) {
        console.error("PUT Stocktake error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const { id } = params;

        const stocktake = await prisma.stocktake.findUnique({
            where: { id },
            include: {
                items: {
                    include: {
                        batch: {
                            include: {
                                inventory: {
                                    include: {
                                        drug: true
                                    }
                                }
                            }
                        }
                    }
                },
                user: { select: { name: true, email: true } },
            }
        });

        if (!stocktake) {
            return NextResponse.json({ error: "Stocktake not found" }, { status: 404 });
        }

        return NextResponse.json({ stocktake });
    } catch (error: any) {
        console.error("GET Stocktake error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
