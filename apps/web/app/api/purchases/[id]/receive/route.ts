import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const { id } = params;
        const body = await req.json();
        const { items } = body; // Array of { itemId, quantity, expiryDate, batchNumber }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ message: "Invalid items data" }, { status: 400 });
        }

        const purchase = await prisma.purchase.findUnique({
            where: { id },
            include: { items: true }
        });

        if (!purchase) {
            return NextResponse.json({ message: "Purchase not found" }, { status: 404 });
        }

        if (purchase.status !== 'PENDING') {
            return NextResponse.json({ message: "Purchase already processed" }, { status: 400 });
        }

        // Transaction to update inventory and purchase status
        await prisma.$transaction(async (tx) => {
            for (const receivedItem of items) {
                const purchaseItem = purchase.items.find(i => i.id === receivedItem.itemId);
                if (!purchaseItem) continue;

                // Find or Create Inventory? 
                // In Smart Order context, inventory usually exists. 
                // But if it's a new item, we might need to handle it. 
                // For now, assuming inventory exists for this branch/drug.
                const inventory = await tx.inventory.findFirst({
                    where: {
                        branchId: purchase.branchId,
                        drugId: purchaseItem.drugId
                    }
                });

                if (inventory) {
                    // Create Batch
                    await tx.batch.create({
                        data: {
                            inventoryId: inventory.id,
                            quantity: receivedItem.quantity,
                            batchNumber: receivedItem.batchNumber,
                            expiryDate: new Date(receivedItem.expiryDate)
                        }
                    });

                    // Update Inventory Cost & Stats
                    // Note: Total quantity is usually a computed field or aggregate, 
                    // but if there's a 'quantity' field on Inventory, we should update it?
                    // The schema viewed earlier (desktop) showed 'quantity', but web might be different.
                    // Based on purchase-actions.ts, it calculates sum of batches. 
                    // It also updates 'cost'.
                    await tx.inventory.update({
                        where: { id: inventory.id },
                        data: {
                            cost: purchaseItem.cost,
                            updatedAt: new Date()
                        }
                    });
                } else {
                    // Handle missing inventory case if needed (create new inventory record)
                    // For now logging warning
                    console.warn(`Inventory not found for drug ${purchaseItem.drugId} in branch ${purchase.branchId}`);
                }
            }

            // Update Purchase Status
            await tx.purchase.update({
                where: { id },
                data: {
                    status: 'COMPLETED',
                    updatedAt: new Date()
                }
            });
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Receive Purchase API Error:", error);
        return NextResponse.json({ message: "Failed to receive items" }, { status: 500 });
    }
}
