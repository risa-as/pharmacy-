import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

const SyncSaleSchema = z.object({
    id: z.string(),
    total: z.number(),
    createdAt: z.string().or(z.date()),
    items: z.array(z.object({
        drugId: z.string(),
        quantity: z.number(),
        price: z.number()
    }))
});

const SyncPayloadSchema = z.object({
    branchId: z.string(),
    sales: z.array(SyncSaleSchema)
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const result = SyncPayloadSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: "Invalid Payload", details: result.error }, { status: 400 });
        }

        const { branchId, sales } = result.data;

        // Process Sales Transactionally
        // We iterate effectively, or use createMany if possible (but we have relations)
        // For simplicity and data integrity, we process one by one or in a loop inside transaction.

        // Note: We might want to check if sale already exists to avoid duplicates (idempotency)

        const results = await prisma.$transaction(async (tx) => {
            const processedIds = [];
            for (const sale of sales) {
                const existing = await tx.sale.findUnique({ where: { id: sale.id } });
                if (existing) {
                    processedIds.push(sale.id);
                    continue; // Already synced
                }

                await tx.sale.create({
                    data: {
                        id: sale.id, // Use the ID generated on Desktop
                        branchId: branchId,
                        total: sale.total,
                        createdAt: new Date(sale.createdAt),
                        items: {
                            create: sale.items.map(item => ({
                                drugId: item.drugId, // This assumes GlobalDrug IDs match!
                                quantity: item.quantity,
                                price: item.price
                            }))
                        }
                    }
                });
                processedIds.push(sale.id);

                // Also decrement Cloud Inventory?
                // "Inventory Rules": Cloud mimics stock? Or just tracks sales?
                // Usually Cloud Inventory = Sum of Branch Inventories.
                // If we have a 'Inventory' record for this branch/drug, we should update it.

                for (const item of sale.items) {
                    // Find cloud inventory for this branch and drug
                    // We don't have a direct "upsert" for inventory based on drug+branch easily without unique constraint
                    // But let's assume it exists or we create it.
                    // For now, let's just log the sale. Inventory sync might be a separate "Pull" process or explicit "Stock Take".
                    // But to be cool, let's try to update if exists.
                    const inv = await tx.inventory.findFirst({
                        where: { branchId: branchId, drugId: item.drugId }
                    });

                    if (inv) {
                        await tx.inventory.update({
                            where: { id: inv.id },
                            data: {
                                batches: {
                                    // This is hard because we don't know WHICH batch was sold locally unless we track batch IDs.
                                    // Simplified: Just update main quantity if we had a flat quantity field?
                                    // Models: Cloud Inventory has batches. It doesn't have a flat 'quantity' field to decrement?
                                    // Wait, cloud schema:
                                    // model Inventory { ... batches Batch[] ... }
                                    // It does NOT have a quantity field. It relies on Batches.
                                    // This makes syncing sales harder without batch details.
                                    // DECISION: For now, we only record the Sale. Inventory adjustment in Cloud requires Batch Tracking in POS, 
                                    // which we implemented in DB but maybe not fully in UI/Sync.
                                    // Let's stick to recording Sales for Reporting.
                                }
                            }
                        });
                    }
                }
            }
            return processedIds;
        });

        return NextResponse.json({ success: true, syncedIds: results });

    } catch (error) {
        console.error("Sync Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
