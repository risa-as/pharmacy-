import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

const SyncReturnSchema = z.object({
    id: z.string(),
    saleId: z.string(),
    safeId: z.string().nullable().optional(),
    total: z.number(),
    createdAt: z.string().or(z.date()),
    notes: z.string().nullable().optional(),
    items: z.array(z.object({
        drugId: z.string(),
        quantity: z.number(),
        price: z.number()
    }))
});

const SyncPayloadSchema = z.object({
    branchId: z.string(),
    returns: z.array(SyncReturnSchema)
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const result = SyncPayloadSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: "Invalid Payload", details: result.error }, { status: 400 });
        }

        const { branchId, returns } = result.data;
        const processedIds: string[] = [];

        for (const ret of returns) {
            try {
                await prisma.$transaction(async (tx) => {
                    const existing = await tx.saleReturn.findUnique({ where: { id: ret.id } });
                    if (existing) return; // Already synced — idempotent

                    await tx.saleReturn.create({
                        data: {
                            id: ret.id,
                            saleId: ret.saleId,
                            branchId: branchId,
                            safeId: ret.safeId || null,
                            total: ret.total,
                            createdAt: new Date(ret.createdAt),
                            notes: ret.notes || null,
                            items: {
                                create: ret.items.map(item => ({
                                    drugId: item.drugId,
                                    quantity: item.quantity,
                                    price: item.price
                                }))
                            }
                        }
                    });

                    // Restore inventory: add returned quantities back to the most recent batch
                    for (const item of ret.items) {
                        const inv = await tx.inventory.findFirst({
                            where: { branchId, drugId: item.drugId },
                            include: {
                                batches: {
                                    orderBy: { expiryDate: 'desc' },
                                    take: 1,
                                    where: { quantity: { gte: 0 } }
                                }
                            }
                        });

                        if (inv?.batches.length) {
                            await tx.batch.update({
                                where: { id: inv.batches[0].id },
                                data: { quantity: { increment: item.quantity } }
                            });
                        }
                    }

                    // If the original sale was a credit sale, restore the patient's balance
                    const sale = await tx.sale.findUnique({
                        where: { id: ret.saleId },
                        include: { payment: true }
                    });
                    if (sale?.payment?.method === 'CREDIT' && sale.patientId) {
                        await tx.patient.updateMany({
                            where: { id: sale.patientId },
                            data: { balance: { decrement: ret.total } }
                        });
                    }
                }, {
                    maxWait: 5000,
                    timeout: 20000
                });

                processedIds.push(ret.id);
            } catch (err) {
                console.error(`Failed to sync sale return ${ret.id}:`, err);
            }
        }

        return NextResponse.json({ success: true, syncedIds: processedIds });

    } catch (error) {
        console.error("Sync Returns Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
