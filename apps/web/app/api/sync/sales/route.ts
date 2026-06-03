export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { validateSyncUser } from '@/app/lib/sync-auth';
import { z } from "zod";
import { logAudit } from '@/app/lib/audit';


const SyncSaleSchema = z.object({
    id: z.string(),
    total: z.number(),
    discount: z.number().optional().default(0),
    hasPriceOverride: z.boolean().optional().default(false),
    createdAt: z.string().or(z.date()),
    userId: z.string().nullable().optional(),
    patientId: z.string().nullable().optional(),
    paymentMethod: z.string().optional().default("CASH"),
    items: z.array(z.object({
        drugId: z.string(),
        quantity: z.number(),
        price: z.number(),
        originalPrice: z.number().nullable().optional(),
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
        const syncUser = await validateSyncUser(req);
        if (syncUser instanceof NextResponse) return syncUser;

        const body = await req.json();
        const result = SyncPayloadSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: "Invalid Payload", details: result.error }, { status: 400 });
        }

        const { branchId, sales } = result.data;

        // Validate branchId belongs to the authenticated user
        const userRole = syncUser.role;
        const userBranchId = syncUser.branchId;
        const userOrgId = syncUser.organizationId;
        let resolvedOrgId: string | undefined = userOrgId ?? undefined;
        if (userRole !== 'SUPER_ADMIN') {
            const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { organizationId: true } });
            if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
            if (userRole === 'ADMIN') {
                if (branch.organizationId !== userOrgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            } else {
                if (branchId !== userBranchId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            resolvedOrgId = branch.organizationId;
        } else if (!resolvedOrgId) {
            const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { organizationId: true } });
            resolvedOrgId = branch?.organizationId;
        }

        // Process Sales Transactionally
        // We iterate effectively, or use createMany if possible (but we have relations)
        // For simplicity and data integrity, we process one by one or in a loop inside transaction.

        // Note: We might want to check if sale already exists to avoid duplicates (idempotency)

        const processedIds: string[] = [];

        // Process each sale in a separate transaction to avoid timeouts
        for (const sale of sales) {
            try {
                await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                    const existing = await tx.sale.findUnique({ where: { id: sale.id } });
                    if (existing) {
                        return; // Already synced
                    }

                    // Assign per-org sequential invoice number atomically
                    let invoiceNumber: number | undefined;
                    if (resolvedOrgId) {
                        const [counter] = await tx.$queryRaw<[{ nextNumber: bigint }]>`
                            INSERT INTO "InvoiceCounter" ("organizationId", "nextNumber")
                            VALUES (${resolvedOrgId}::text, 2)
                            ON CONFLICT ("organizationId")
                            DO UPDATE SET "nextNumber" = "InvoiceCounter"."nextNumber" + 1
                            RETURNING "nextNumber"
                        `;
                        invoiceNumber = Number(counter.nextNumber) - 1;
                    }

                    const isCredit = sale.paymentMethod === "CREDIT";

                    const saleItemsData = [];

                    console.log(`[SyncSales DEBUG] sale ${sale.id} items:`, JSON.stringify(sale.items.map((i: any) => ({ drugId: i.drugId, price: i.price, originalPrice: i.originalPrice }))));

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

                            if (remainingToDeduct > 0) {
                                console.warn(`[SyncSales] Over-sell or empty batches for drugId=${item.drugId} branchId=${branchId}. Remaining after deduction: ${remainingToDeduct}`);
                            }
                        } else {
                            console.error(`[SyncSales] INVENTORY NOT FOUND — drugId=${item.drugId} branchId=${branchId} saleId=${sale.id}. Stock was NOT deducted!`);
                        }

                        const unitCost = item.quantity > 0 ? (itemTotalCost / item.quantity) : 0;

                        saleItemsData.push({
                            drugId: item.drugId,
                            quantity: item.quantity,
                            price: item.price,
                            originalPrice: item.originalPrice ?? null,
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
                            hasPriceOverride: sale.hasPriceOverride === true,
                            createdAt: new Date(sale.createdAt),
                            userId: sale.userId,
                            patientId: resolvedPatientId,
                            ...(invoiceNumber !== undefined ? { invoiceNumber } : {}),
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
                await logAudit({
                    userId: syncUser.id,
                    userName: syncUser.name ?? syncUser.email ?? 'Desktop Sync',
                    action: 'CREATE',
                    entity: 'SALE',
                    entityId: sale.id,
                    details: JSON.stringify({ total: sale.total, source: 'desktop-sync' }),
                    branchId: body.branchId,
                });
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
