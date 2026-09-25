import { calculateRefund } from '@faramace/shared';
import { restoreSaleReturnStock } from '@/app/lib/sale-return-stock';
export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { validateSyncUser } from '@/app/lib/sync-auth';
import { logAudit, resolveUserName } from '@/app/lib/audit';
import { z } from "zod";
import { getUserPermissions } from '@/app/lib/permissions';
import { settleSaleLoyalty } from '@/app/lib/loyalty-settlement';


const SyncReturnSchema = z.object({
    refundVersion: z.literal(2).optional(),
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
                    if (existing) { if (existing.branchId !== branchId || existing.saleId !== ret.saleId) throw new ReturnConflictError('معرف المرتجع مستخدم لعملية أخرى.'); return { status: 'duplicate' as const }; } // Already synced — idempotent

                    // Serialize all returns for this invoice. The second device
                    // must re-read prior returns after waiting for the first one.
                    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${ret.saleId} FOR UPDATE`;
                    const existingAfterLock = await tx.saleReturn.findUnique({ where: { id: ret.id } });
                    if (existingAfterLock) { if (existingAfterLock.branchId !== branchId || existingAfterLock.saleId !== ret.saleId) throw new ReturnConflictError('معرف المرتجع مستخدم لعملية أخرى.'); return { status: 'duplicate' as const }; }
                    if (ret.refundVersion !== 2) throw new ReturnConflictError('يتطلب هذا المرتجع تحديث تطبيق سطح المكتب لدعم الخصم ودفعات الإرجاع. إذا سبق دفعه فاحتفظ به للمراجعة ولا تكرر الدفع.');
                    const sale = await tx.sale.findUnique({
                        where: { id: ret.saleId },
                        include: { items: true, returns: { include: { items: true } }, payment: true },
                    });
                    if (!sale) throw new ReturnConflictError('الفاتورة غير موجودة على الخادم.');
                    if (sale.branchId !== branchId) throw new ReturnConflictError('الفاتورة لا تتبع هذا الفرع.');

                    let validated;
                    try { validated = calculateRefund(sale, ret.items); } catch (e) { throw new ReturnConflictError((e as Error).message); }
                    const stockItems = await restoreSaleReturnStock(tx, branchId, sale.items, sale.returns, validated.items);
                    const returnSafeId = ret.safeId || sale.safeId;
                    if (returnSafeId && !await tx.safe.findFirst({ where: { id: returnSafeId, branchId }, select: { id: true } }))
                        throw new ReturnConflictError('الصندوق لا يتبع فرع المرتجع.');
                    const actor = await tx.user.findFirst({ where: { id: ret.userId || syncUser.id, branchId, isActive: true }, select: { id: true, role: true, permissions: true } });
                    if (!actor || !getUserPermissions(actor).canProcessReturn)
                        throw new ReturnConflictError('منفذ المرتجع غير مخول في هذا الفرع؛ تتطلب العملية مراجعة المدير.');

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
                                create: stockItems
                            }
                        }
                    });

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

                    // Loyalty follows the refund: earned points taken back, redeemed points
                    // given back (idempotent, see settleSaleLoyalty).
                    await settleSaleLoyalty(tx, ret.saleId);
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

        const records = await prisma.saleReturn.findMany({ where: { id: { in: processedIds }, branchId }, include: { items: true } });
        // Authoritative balances of every patient whose sale was returned here,
        // including a resend after a lost response, so the desktop stops offering
        // points a return took back (same shape as sync/loyalty).
        const returnedFor = processedIds.length ? await prisma.sale.findMany({
            where: { returns: { some: { id: { in: processedIds } } }, patientId: { not: null } }, select: { patientId: true },
        }) : [];
        const accountBalances = returnedFor.length ? await prisma.loyaltyAccount.findMany({
            where: { patientId: { in: returnedFor.map(s => s.patientId!) } },
            select: { patientId: true, totalPoints: true, lifetimePoints: true, tier: true },
        }) : [];
        return NextResponse.json({ success: conflicts.length === 0, syncedIds: processedIds, conflicts, records, accountBalances });

    } catch (error) {
        console.error("Sync Returns Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
