import { readAllocations } from '@/app/lib/sale-return-stock';
export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { validateSyncUser, operatorPermissions } from '@/app/lib/sync-auth';
import { z } from "zod";
import { logAudit } from '@/app/lib/audit';


const SyncSaleSchema = z.object({
    id: z.string(),
    total: z.number().finite().nonnegative(),
    discount: z.number().finite().nonnegative().optional().default(0),
    hasPriceOverride: z.boolean().optional().default(false),
    createdAt: z.string().or(z.date()),
    userId: z.string().nullable().optional(),
    patientId: z.string().nullable().optional(),
    paymentMethod: z.string().optional().default("CASH"),
    // Sequential number the desktop already allocated at sale time (online).
    // When present we reuse it; when absent (offline sale) we allocate one here.
    invoiceNumber: z.union([z.number(), z.string()]).nullable().optional(),
    items: z.array(z.object({
        drugId: z.string(),
        quantity: z.number().int().positive(),
        price: z.number().finite().nonnegative(),
        originalPrice: z.number().nullable().optional(),
        batchAllocations: z.string().max(100000).nullable().optional(),
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

class SyncSaleConflictError extends Error {}

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

        // Resolve cashier names up front so each desktop-synced sale is attributed
        // in the audit log to the actual cashier who rang it (sale.userId) — not the
        // headless sync connection, which has no name and showed as "Desktop Sync".
        const saleUserIds = Array.from(
            new Set(sales.map((s) => s.userId).filter((id): id is string => !!id))
        );
        const cashierUsers = saleUserIds.length
            ? await prisma.user.findMany({
                where: { id: { in: saleUserIds } },
                select: { id: true, name: true, email: true },
            })
            : [];
        const cashierMap = new Map(cashierUsers.map((u) => [u.id, u]));

        // Process Sales Transactionally
        // We iterate effectively, or use createMany if possible (but we have relations)
        // For simplicity and data integrity, we process one by one or in a loop inside transaction.

        // Note: We might want to check if sale already exists to avoid duplicates (idempotency)

        const processedIds: string[] = [];
        const conflicts: { id: string; message: string }[] = [];
        // Maps sale id -> invoiceNumber so the desktop can reconcile offline sales
        // (whose number was allocated here) back into its local DB.
        const invoiceNumbers: Record<string, number> = {};

        // Process each sale in a separate transaction to avoid timeouts
        for (const sale of sales) {
            try {
                await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                    const existing = await tx.sale.findUnique({ where: { id: sale.id } });
                    if (existing) {
                        if (existing.branchId !== branchId) throw new SyncSaleConflictError('معرف الفاتورة خارج الفرع.');
                        return; // Already synced
                    }

                    // Reuse the number the desktop allocated at sale time (online sales).
                    // Only allocate a fresh one here for sales created while offline.
                    let invoiceNumber: number | undefined;
                    const providedNumber = sale.invoiceNumber != null ? Number(sale.invoiceNumber) : NaN;
                    if (Number.isInteger(providedNumber) && providedNumber > 0) {
                        invoiceNumber = providedNumber;
                    } else if (resolvedOrgId) {
                        const [counter] = await tx.$queryRaw<[{ nextNumber: bigint }]>`
                            INSERT INTO "InvoiceCounter" ("organizationId", "nextNumber")
                            VALUES (${resolvedOrgId}::text, 2)
                            ON CONFLICT ("organizationId")
                            DO UPDATE SET "nextNumber" = "InvoiceCounter"."nextNumber" + 1
                            RETURNING "nextNumber"
                        `;
                        invoiceNumber = Number(counter.nextNumber) - 1;
                    }
                    if (invoiceNumber !== undefined) {
                        invoiceNumbers[sale.id] = invoiceNumber;
                    }

                    const subtotal = sale.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
                    if (new Set(sale.items.map(i => i.drugId)).size !== sale.items.length || Math.abs(subtotal - sale.discount - sale.total) > .01) throw new SyncSaleConflictError('إجمالي البيع أو الأصناف غير صالح.');
                    // Same permissions as a web sale (pos-actions / api/sales), evaluated
                    // for the cashier who rang it, as of now. A refusal is a review
                    // conflict: the desktop keeps the sale in its sync-failures list.
                    const perms = await operatorPermissions(tx, sale.userId, branchId, syncUser);
                    if (perms === null) throw new SyncSaleConflictError('منفذ البيع خارج الفرع أو حسابه معطل؛ تتطلب العملية مراجعة.');
                    if (perms !== 'unattributed') {
                        if (!perms.canSell) throw new SyncSaleConflictError('صلاحية البيع غير متاحة لمنفذ البيع؛ تتطلب العملية مراجعة.');
                        if (sale.discount > 0 && !perms.canApplyDiscount) throw new SyncSaleConflictError('صلاحية الخصم غير متاحة لمنفذ البيع؛ تتطلب العملية مراجعة.');
                        // The reference price is the branch's stored inventory price, as on
                        // the web, not the originalPrice the desktop reports (a client claim,
                        // and absent unless the cashier overrode the price). A sale rung at a
                        // price that has since changed is refused for review, not dropped.
                        // Only an item whose inventory has not reached the cloud yet falls
                        // back to the reported originalPrice.
                        const stored = new Map((await tx.inventory.findMany({
                            where: { branchId, drugId: { in: sale.items.map(i => i.drugId) } },
                            select: { drugId: true, price: true },
                        })).map(inv => [inv.drugId, inv.price]));
                        const priceChanged = sale.items.some(i => {
                            const reference = stored.get(i.drugId) ?? i.originalPrice;
                            return reference != null && Math.abs(i.price - reference) > .01
                                && !perms.canEditPrice && !(i.price < reference && perms.canApplyDiscount);
                        });
                        if (priceChanged) throw new SyncSaleConflictError('تغيير السعر يحتاج صلاحية؛ تتطلب العملية مراجعة.');
                    }
                    const isCredit = sale.paymentMethod === "CREDIT";

                    const saleItemsData = [];

                    console.log(`[SyncSales DEBUG] sale ${sale.id} items:`, JSON.stringify(sale.items.map((i: any) => ({ drugId: i.drugId, price: i.price, originalPrice: i.originalPrice }))));

                    // Update Inventory (FIFO Deduction from Batches) and Calculate Cost
                    for (const item of sale.items) {
                        const allocations: { batchId: string; quantity: number }[] = [];
                let itemTotalCost = 0;
                        let remainingToDeduct = item.quantity;

                        const suppliedAllocations = readAllocations(item.batchAllocations);
                        if (item.batchAllocations && suppliedAllocations.reduce((s, a) => s + a.quantity, 0) !== item.quantity) throw new SyncSaleConflictError('تخصيص دفعات البيع غير صالح.');
                        const inv = await tx.inventory.findFirst({
                            where: { branchId: branchId, drugId: item.drugId },
                            include: { batches: { orderBy: { expiryDate: 'asc' }, where: { quantity: { gt: 0 }, ...(item.batchAllocations ? { id: { in: suppliedAllocations.map(a => a.batchId) } } : {}) } } }
                        });

                        if (inv) {
                            if (inv.batches.length > 0) {
                                for (const batch of inv.batches) {
                                    if (remainingToDeduct <= 0) break;

                                    const deduction = item.batchAllocations ? suppliedAllocations.filter(a => a.batchId === batch.id).reduce((n, a) => n + a.quantity, 0) : Math.min(batch.quantity, remainingToDeduct);

                                    if (deduction > 0) {
                                        itemTotalCost += deduction * batch.costPrice;
                                        const deducted = await tx.batch.updateMany({
                                            where: { id: batch.id, quantity: { gte: deduction } },
                                            data: { quantity: { decrement: deduction } }
                                        });
                                        if (deducted.count !== 1) throw new SyncSaleConflictError('رصيد الدفعة لا يكفي لمزامنة البيع؛ تتطلب العملية مراجعة.');
                                        allocations.push({ batchId: batch.id, quantity: deduction });
                        remainingToDeduct -= deduction;
                                    }
                                }
                            }

                        } else {
                            // No inventory row for this drug at this branch — sale is still
                            // recorded (it occurred), but nothing to deduct. Needs reconciliation.
                            console.error(`[SyncSales] INVENTORY NOT FOUND — drugId=${item.drugId} branchId=${branchId} saleId=${sale.id}. Stock was NOT deducted!`);
                        }

                        if (remainingToDeduct > 0) throw new SyncSaleConflictError('دفعات البيع الأصلية غير متاحة بالكامل؛ تتطلب المزامنة مراجعة.');
                        const unitCost = item.quantity > 0 ? (itemTotalCost / item.quantity) : 0;

                        saleItemsData.push({
                            drugId: item.drugId,
                            quantity: item.quantity,
                            price: item.price,
                            originalPrice: item.originalPrice ?? null,
                            batchAllocations: item.batchAllocations ? JSON.stringify(allocations) : null,
                    cost: unitCost
                        });
                    }

                    // For credit sales: ensure patient exists in cloud before FK constraint fires
                    let resolvedPatientId = sale.patientId || null;
                    if (resolvedPatientId) {
                        const existingPatient = await tx.patient.findUnique({
                            where: { id: resolvedPatientId },
                            select: { id: true, branchId: true },
                        });
                        if (existingPatient && existingPatient.branchId !== branchId) throw new SyncSaleConflictError("العميل خارج الفرع.");
                        if (!existingPatient) {
                            if (!sale.patient) throw new SyncSaleConflictError('العميل غير موجود؛ أرسل بيانات العميل قبل مزامنة البيع.');
                            try {
                                await tx.patient.create({
                                    data: {
                                        id: resolvedPatientId,
                                        name: sale.patient.name,
                                        phone: sale.patient.phone ?? '',
                                        branchId: branchId,
                                    },
                                });
                            } catch (patientErr: any) {
                                if (patientErr.code === 'P2002') {
                                    // phone+branchId already taken — find existing patient and remap
                                    const byPhone = await tx.patient.findFirst({
                                        where: {
                                            phone: sale.patient.phone ?? '',
                                            branchId: branchId,
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
                            data: { balance: { increment: sale.total } }
                        });
                    }
                }, {
                    maxWait: 5000, // default: 2000
                    timeout: 20000 // default: 5000
                });
                processedIds.push(sale.id);
                const cashier = sale.userId ? cashierMap.get(sale.userId) : undefined;
                await logAudit({
                    // Attribute to the cashier who made the sale; fall back to the
                    // sync connection only if the user can't be resolved.
                    userId: sale.userId ?? syncUser.id,
                    userName: cashier?.name ?? cashier?.email ?? syncUser.name ?? 'Desktop Sync',
                    action: 'CREATE',
                    entity: 'SALE',
                    entityId: sale.id,
                    details: JSON.stringify({ total: sale.total, source: 'desktop-sync' }),
                    branchId: body.branchId,
                });
            } catch (err) {
                if (err instanceof SyncSaleConflictError) conflicts.push({ id: sale.id, message: err.message });
                console.error(`Failed to sync sale ${sale.id}:`, err);
                // Continue with other sales
            }
        }

        return NextResponse.json({ success: true, syncedIds: processedIds, invoiceNumbers, conflicts });

    } catch (error) {
        console.error("Sync Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
