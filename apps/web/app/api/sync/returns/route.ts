export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { validateSyncUser } from '@/app/lib/sync-auth';
import { logAudit, resolveUserName } from '@/app/lib/audit';
import { z } from "zod";


const SyncReturnSchema = z.object({
    id: z.string(),
    saleId: z.string(),
    safeId: z.string().nullable().optional(),
    userId: z.string().nullable().optional(),
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

class ReturnConflictError extends Error {}

function validateSyncedReturn(
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
    for (const prior of priorReturns) {
        for (const item of prior.items) {
            if (returnable[item.drugId] !== undefined) returnable[item.drugId] -= item.quantity;
        }
    }

    const seen = new Set<string>();
    const items: { drugId: string; quantity: number; price: number }[] = [];
    let total = 0;
    for (const item of requested) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
            throw new ReturnConflictError('كمية الإرجاع غير صالحة.');
        }
        if (seen.has(item.drugId)) throw new ReturnConflictError('الصنف مكرر في طلب الإرجاع.');
        if (returnable[item.drugId] === undefined) {
            throw new ReturnConflictError('أحد الأصناف ليس ضمن هذه الفاتورة.');
        }
        if (item.quantity > returnable[item.drugId]) {
            throw new ReturnConflictError(
                returnable[item.drugId] <= 0
                    ? 'هذا الصنف أُرجع بالكامل مسبقاً.'
                    : `لا يمكن إرجاع ${item.quantity}؛ المتاح للإرجاع ${returnable[item.drugId]} فقط.`,
            );
        }
        seen.add(item.drugId);
        const price = prices[item.drugId];
        items.push({ drugId: item.drugId, quantity: item.quantity, price });
        total += price * item.quantity;
    }
    return { items, total };
}

export async function POST(req: NextRequest) {
    try {
        const syncUser = await validateSyncUser(req);
        if (syncUser instanceof NextResponse) return syncUser;

        const body = await req.json();
        const result = SyncPayloadSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: "Invalid Payload", details: result.error }, { status: 400 });
        }

        const { branchId, returns } = result.data;

        // Validate branchId belongs to the authenticated user
        const userRole = syncUser.role;
        const userBranchId = syncUser.branchId;
        const userOrgId = syncUser.organizationId;
        if (userRole !== 'SUPER_ADMIN') {
            const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { organizationId: true } });
            if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
            if (userRole === 'ADMIN') {
                if (branch.organizationId !== userOrgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            } else {
                if (branchId !== userBranchId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }
        const processedIds: string[] = [];
        const conflicts: { id: string; message: string }[] = [];

        for (const ret of returns) {
            try {
                const outcome = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                    const existing = await tx.saleReturn.findUnique({ where: { id: ret.id } });
                    if (existing) return { status: 'duplicate' as const }; // Already synced — idempotent

                    // Serialize all returns for this invoice. The second device
                    // must re-read prior returns after waiting for the first one.
                    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${ret.saleId} FOR UPDATE`;
                    const existingAfterLock = await tx.saleReturn.findUnique({ where: { id: ret.id } });
                    if (existingAfterLock) return { status: 'duplicate' as const };
                    const sale = await tx.sale.findUnique({
                        where: { id: ret.saleId },
                        include: { items: true, returns: { include: { items: true } }, payment: true },
                    });
                    if (!sale) throw new ReturnConflictError('الفاتورة غير موجودة على الخادم.');
                    if (sale.branchId !== branchId) throw new ReturnConflictError('الفاتورة لا تتبع هذا الفرع.');

                    const validated = validateSyncedReturn(sale.items, sale.returns, ret.items);
                    const returnSafeId = ret.safeId || sale.safeId;

                    await tx.saleReturn.create({
                        data: {
                            id: ret.id,
                            saleId: ret.saleId,
                            branchId: branchId,
                            safeId: returnSafeId || null,
                            userId: ret.userId || syncUser.id,
                            total: validated.total,
                            createdAt: new Date(ret.createdAt),
                            notes: ret.notes || null,
                            items: {
                                create: validated.items.map((item) => ({
                                    drugId: item.drugId,
                                    quantity: item.quantity,
                                    price: item.price
                                }))
                            }
                        }
                    });

                    // Restore inventory: add returned quantities back to the most recent batch
                    for (const item of validated.items) {
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

                    if (sale?.payment?.method === 'CREDIT' && sale.patientId) {
                        await tx.patient.updateMany({
                            where: { id: sale.patientId },
                            data: { balance: { decrement: validated.total } }
                        });
                    } else if (returnSafeId) {
                        await tx.safe.update({
                            where: { id: returnSafeId },
                            data: { balance: { decrement: validated.total } },
                        });
                        await tx.transaction.create({
                            data: {
                                safeId: returnSafeId,
                                type: 'OUT',
                                amount: validated.total,
                                referenceType: 'SALE_RETURN',
                                referenceId: ret.id,
                                description: `Return for sale ${ret.saleId}`,
                                userId: ret.userId || syncUser.id,
                            },
                        });
                    }

                    return { status: 'processed' as const };
                }, {
                    maxWait: 5000,
                    timeout: 20000
                });

                processedIds.push(ret.id);
                if (outcome.status === 'processed') {
                    try {
                        await logAudit({
                            userId: ret.userId ?? syncUser.id,
                            userName: ret.userId ? await resolveUserName(ret.userId) : (syncUser.name ?? 'Desktop Sync'),
                            action: 'RETURN',
                            entity: 'SALE',
                            entityId: ret.saleId,
                            details: JSON.stringify({ returnId: ret.id, source: 'desktop-sync' }),
                            branchId,
                        });
                    } catch (auditError) {
                        console.error(`Sale return ${ret.id} committed but audit logging failed:`, auditError);
                    }
                }
            } catch (err) {
                console.error(`Failed to sync sale return ${ret.id}:`, err);
                if (err instanceof ReturnConflictError) {
                    conflicts.push({ id: ret.id, message: err.message });
                } else {
                    // Network, deadlock, and database errors remain retryable;
                    // do not turn transient failures into permanent conflicts.
                    throw err;
                }
            }
        }

        return NextResponse.json({ success: conflicts.length === 0, syncedIds: processedIds, conflicts });

    } catch (error) {
        console.error("Sync Returns Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
