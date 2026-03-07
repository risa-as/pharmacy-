import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { z } from "zod";


const SyncSaleSchema = z.object({
    id: z.string(),
    total: z.number(),
    discount: z.number().optional().default(0),
    createdAt: z.string().or(z.date()),
    userId: z.string().nullable().optional(),
    patientId: z.string().nullable().optional(),
    paymentMethod: z.string().optional().default("CASH"),
    items: z.array(z.object({
        drugId: z.string(),
        quantity: z.number(),
        price: z.number()
    })),
    // Patient snapshot sent by desktop for credit sales so cloud can upsert before FK check
    patient: z.object({
        id: z.string(),
        name: z.string(),
        phone: z.string().nullable().optional(),
        branchId: z.string().nullable().optional(),
    }).nullable().optional(),
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

        const processedIds: string[] = [];

        // Process each sale in a separate transaction to avoid timeouts
        for (const sale of sales) {
            try {
                await prisma.$transaction(async (tx) => {
                    const existing = await tx.sale.findUnique({ where: { id: sale.id } });
                    if (existing) {
                        return; // Already synced
                    }

                    const isCredit = sale.paymentMethod === "CREDIT";

                    const saleItemsData = [];

                    // Update Inventory (FIFO Deduction from Batches) and Calculate Cost
                    for (const item of sale.items) {
                        let itemTotalCost = 0;
                        let remainingToDeduct = item.quantity;

                        const inv = await tx.inventory.findFirst({
                            where: { branchId: branchId, drugId: item.drugId },
                            include: { batches: { orderBy: { expiryDate: 'asc' }, where: { quantity: { gt: 0 } } } }
                        });

                        if (inv) {
                            if (inv.batches.length > 0) {
                                for (const batch of inv.batches) {
                                    if (remainingToDeduct <= 0) break;

                                    const deduction = Math.min(batch.quantity, remainingToDeduct);

                                    if (deduction > 0) {
                                        itemTotalCost += deduction * batch.costPrice;
                                        await tx.batch.update({
                                            where: { id: batch.id },
                                            data: { quantity: { decrement: deduction } }
                                        });
                                        remainingToDeduct -= deduction;
                                    }
                                }
                            }

                            // Fallback cost if batches insufficient
                            if (remainingToDeduct > 0 && inv.cost) {
                                itemTotalCost += remainingToDeduct * inv.cost;
                            }
                        }

                        const unitCost = item.quantity > 0 ? (itemTotalCost / item.quantity) : 0;

                        saleItemsData.push({
                            drugId: item.drugId,
                            quantity: item.quantity,
                            price: item.price,
                            cost: unitCost
                        });
                    }

                    // For credit sales: ensure patient exists in cloud before FK constraint fires
                    let resolvedPatientId = sale.patientId || null;
                    if (resolvedPatientId && sale.patient) {
                        const existingPatient = await tx.patient.findUnique({
                            where: { id: resolvedPatientId },
                            select: { id: true },
                        });
                        if (!existingPatient) {
                            try {
                                await tx.patient.create({
                                    data: {
                                        id: resolvedPatientId,
                                        name: sale.patient.name,
                                        phone: sale.patient.phone ?? '',
                                        branchId: sale.patient.branchId ?? branchId,
                                    },
                                });
                            } catch (patientErr: any) {
                                if (patientErr.code === 'P2002') {
                                    // phone+branchId already taken — find existing patient and remap
                                    const byPhone = await tx.patient.findFirst({
                                        where: {
                                            phone: sale.patient.phone ?? '',
                                            branchId: sale.patient.branchId ?? branchId,
                                        },
                                        select: { id: true },
                                    });
                                    resolvedPatientId = byPhone?.id ?? null;
                                } else {
                                    throw patientErr;
                                }
                            }
                        }
                    }

                    await tx.sale.create({
                        data: {
                            id: sale.id,
                            branchId: branchId,
                            total: sale.total,
                            discount: sale.discount || 0,
                            createdAt: new Date(sale.createdAt),
                            userId: sale.userId,
                            patientId: resolvedPatientId,
                            items: {
                                create: saleItemsData
                            }
                        }
                    });

                    // Create Payment record
                    await tx.payment.create({
                        data: {
                            saleId: sale.id,
                            amount: sale.total,
                            method: (sale.paymentMethod || "CASH") as any,
                            status: isCredit ? "PENDING" : "COMPLETED",
                        }
                    });

                    // For credit sales: update patient balance
                    if (isCredit && resolvedPatientId) {
                        await tx.patient.updateMany({
                            where: { id: resolvedPatientId },
                            data: { balance: { increment: sale.total - (sale.discount || 0) } }
                        });
                    }
                }, {
                    maxWait: 5000, // default: 2000
                    timeout: 20000 // default: 5000
                });
                processedIds.push(sale.id);
            } catch (err) {
                console.error(`Failed to sync sale ${sale.id}:`, err);
                // Continue with other sales
            }
        }

        return NextResponse.json({ success: true, syncedIds: processedIds });

    } catch (error) {
        console.error("Sync Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
