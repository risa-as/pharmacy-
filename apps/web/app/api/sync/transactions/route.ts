import { resolveSyncSafe, SyncSafeConflict } from '@/app/lib/sync-safe';
export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { validateSyncUser, operatorPermissions, operatorRequired, UNIDENTIFIED_OPERATOR_MESSAGE } from '@/app/lib/sync-auth';
import { z } from "zod";


const SyncTransactionSchema = z.object({
    id: z.string(),
    safeId: z.string(),
    type: z.string(),
    amount: z.number(),
    referenceType: z.string(),
    referenceId: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    userId: z.string().nullable().optional(),
    createdAt: z.string().or(z.date()),
    updatedAt: z.string().or(z.date()),
});

/** How long a sale/return cash movement waits for its document before review,
 * counted from the server's first sight of it (never the device clock). */
const REFERENCE_WAIT_MS = 24 * 60 * 60 * 1000;

/** Cash movement kinds the desktop creates; anything else is refused for review. */
const DOCUMENT_TYPES = { SALE: 'IN', SALE_RETURN: 'OUT' } as const;
const KNOWN_REFERENCE_TYPES = new Set(['SALE', 'SALE_RETURN', 'SHIFT_CASH_DROP']);

type Outcome = 'done' | 'duplicate' | 'foreign' | 'pending' | 'unmatched' | 'mismatch' | 'unreferenced' | 'forbidden' | 'unidentified';
const CONFLICT_MESSAGES: Partial<Record<Outcome, string>> = {
    unidentified: UNIDENTIFIED_OPERATOR_MESSAGE,
    forbidden: 'صلاحية البيع غير متاحة لمنفذ الإيداع أو السحب النقدي أو للجلسة؛ تتطلب العملية مراجعة.',
    foreign: 'الحركة تشير إلى حركة أو مستخدم أو مستند من فرع أو مؤسسة أخرى.',
    unmatched: 'حركة الصندوق لفاتورة أو مرتجع لم يصل إلى السحابة خلال يوم (قد يكون رُفض للمراجعة)؛ تتطلب مراجعة.',
    mismatch: 'مبلغ حركة الصندوق أو اتجاهها لا يطابق الفاتورة أو المرتجع؛ تتطلب مراجعة.',
    unreferenced: 'حركة بيع أو مرتجع بلا رقم مستند؛ تتطلب مراجعة.',
};

const SyncPayloadSchema = z.object({
    branchId: z.string(),
    transactions: z.array(SyncTransactionSchema)
});

export async function POST(req: NextRequest) {
    try {
        const syncUser = await validateSyncUser(req);
        if (syncUser instanceof NextResponse) return syncUser;

        const idempotencyKey = req.headers.get('x-idempotency-key');
        if (!idempotencyKey) {
            return NextResponse.json({ error: "Missing x-idempotency-key header" }, { status: 400 });
        }

        const body = await req.json();
        const result = SyncPayloadSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: "Invalid Payload", details: result.error }, { status: 400 });
        }

        const { branchId, transactions } = result.data;

        // Validate branchId belongs to the authenticated user
        const userRole = syncUser.role;
        const userBranchId = syncUser.branchId;
        const userOrgId = syncUser.organizationId;
        const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { organizationId: true } });
        if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
        const orgId = branch.organizationId;
        if (userRole !== 'SUPER_ADMIN') {
            if (userRole === 'ADMIN') {
                if (branch.organizationId !== userOrgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            } else {
                if (branchId !== userBranchId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }

        // Check Idempotency
        const existingLog = await prisma.syncActionLog.findUnique({
            where: { idempotencyKey }
        });

        if (existingLog) {
            if (existingLog.status === "PROCESSED") {
                return NextResponse.json({ success: true, message: "Already processed", ack: { status: 'processed', idempotencyKey } });
            }
        }

        const processedIds: string[] = [];
        // Records that are invalid or name another organisation's data: refused
        // for review, never written and never silently dropped.
        const conflicts: { id: string; message: string }[] = [];

        // One transaction per record, so a refused or failing record neither rolls
        // back nor blocks the others.
        for (const txn of transactions) {
            if ((txn.type !== 'IN' && txn.type !== 'OUT') || !Number.isFinite(txn.amount) || txn.amount < 0 || !KNOWN_REFERENCE_TYPES.has(txn.referenceType)) {
                conflicts.push({ id: txn.id, message: 'حركة صندوق غير صالحة (النوع أو المبلغ).' });
                continue;
            }
            try {
                const outcome = await prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<Outcome> => {
                    const existing = await tx.transaction.findUnique({ where: { id: txn.id }, select: { safe: { select: { branchId: true } } } });
                    if (existing) return existing.safe.branchId === branchId ? 'done' : 'foreign';

                    if (txn.userId) {
                        const user = await tx.user.findUnique({ where: { id: txn.userId }, select: { branch: { select: { organizationId: true } } } });
                        if (user && user.branch?.organizationId !== orgId) return 'foreign';
                    }

                    // N02-R2: cash for a sale or a return moves the safe only against that
                    // document, in this branch, once, with its amount and direction:
                    //  - the document row is locked, so two movements for it serialise;
                    //  - a document not in the cloud yet waits (first sight recorded by the
                    //    server), and becomes a review item after a day;
                    //  - a second movement for the same document (another id, or the one
                    //    sync/returns already posted) is acknowledged without a second effect.
                    const expectedDirection = DOCUMENT_TYPES[txn.referenceType as keyof typeof DOCUMENT_TYPES];
                    if (expectedDirection) {
                        if (!txn.referenceId) {
                            // Preserve legacy operations for review, never post unverified
                            // cash. Upgrade desktop clients before deploying this policy.
                            return 'unreferenced';
                        } else {
                            const doc = txn.referenceType === 'SALE'
                                ? (await tx.$queryRaw<{ branchId: string; total: number; method: string | null }[]>`
                                    SELECT s."branchId", s.total, p.method::text AS method FROM "Sale" s
                                    LEFT JOIN "Payment" p ON p."saleId" = s.id WHERE s.id = ${txn.referenceId} FOR UPDATE OF s`)[0]
                                : (await tx.$queryRaw<{ branchId: string; total: number; method: string | null }[]>`
                                    SELECT r."branchId", r.total, p.method::text AS method FROM "SaleReturn" r
                                    JOIN "Sale" s ON s.id = r."saleId"
                                    LEFT JOIN "Payment" p ON p."saleId" = s.id
                                    WHERE r.id = ${txn.referenceId} FOR UPDATE OF r`)[0];
                            if (!doc) {
                                const wait = await tx.syncMovementWait.upsert({
                                    where: { transactionId: txn.id },
                                    create: { transactionId: txn.id, branchId },
                                    update: {},
                                });
                                return Date.now() - wait.firstSeenAt.getTime() < REFERENCE_WAIT_MS ? 'pending' : 'unmatched';
                            }
                            await tx.syncMovementWait.deleteMany({ where: { transactionId: txn.id } });
                            if (doc.branchId !== branchId) return 'foreign';
                            if (txn.type !== expectedDirection || Math.abs(txn.amount - doc.total) > 0.01
                                || doc.method !== 'CASH') return 'mismatch';
                            const already = await tx.transaction.findFirst({
                                where: { referenceType: txn.referenceType, referenceId: txn.referenceId },
                                select: { id: true, type: true, amount: true, safe: { select: { branchId: true } } },
                            });
                            if (already) return already.safe.branchId === branchId && already.type === expectedDirection
                                && Math.abs(already.amount - doc.total) <= 0.01 ? 'duplicate' : 'mismatch';
                            // Refund posting belongs to the return endpoint. A desktop
                            // movement can acknowledge that settlement, never invent one
                            // from a return total (e.g. a debt reduction or card refund).
                            if (txn.referenceType === 'SALE_RETURN') return 'mismatch';
                        }
                    } else {
                        // N02-R: a shift cash drop has no document behind it, so the
                        // person is checked instead. canSell, like opening and closing
                        // the shift: the desktop offers the drop to any cashier on shift.
                        // Sale cash needs no check here; its sale was checked on sync.
                        const perms = await operatorPermissions(tx, txn.userId, branchId, syncUser);
                        if (perms === 'unattributed' && operatorRequired()) return 'unidentified';
                        if (perms === null || (perms !== 'unattributed' && !perms.canSell)) return 'forbidden';
                    }

                    // Map the desktop's safe id onto the branch's canonical safe.
                    const resolvedSafeId = await resolveSyncSafe(tx, branchId, txn.safeId);

                    await tx.transaction.create({
                        data: {
                            id: txn.id,
                            safeId: resolvedSafeId,
                            type: txn.type,
                            amount: txn.amount,
                            referenceType: txn.referenceType,
                            referenceId: txn.referenceId,
                            description: txn.description,
                            userId: txn.referenceType === 'SALE' && txn.referenceId
                                ? (await tx.sale.findUnique({ where: { id: txn.referenceId }, select: { userId: true } }))?.userId
                                : txn.userId,
                            createdAt: new Date(txn.createdAt),
                            updatedAt: new Date(txn.updatedAt)
                        }
                    });

                    // Update Safe Balance in Cloud DB
                    await tx.safe.update({
                        where: { id: resolvedSafeId },
                        data: { balance: txn.type === 'IN' ? { increment: txn.amount } : { decrement: txn.amount } }
                    });
                    return 'done';
                });
                const conflictMessage = CONFLICT_MESSAGES[outcome];
                if (conflictMessage) conflicts.push({ id: txn.id, message: conflictMessage });
                else if (outcome === 'done' || outcome === 'duplicate') processedIds.push(txn.id);
            } catch (txnErr: any) {
                if (txnErr instanceof SyncSafeConflict) conflicts.push({ id: txn.id, message: txnErr.message });
                console.error(`[Transaction Sync] Failed to sync transaction ${txn.id}:`, txnErr.message);
            }
        }

        await prisma.syncActionLog.upsert({
            where: { idempotencyKey },
            update: { status: "PROCESSED" },
            create: {
                idempotencyKey,
                actionType: "SYNC_TRANSACTIONS",
                branchId,
                status: "PROCESSED"
            }
        });

        return NextResponse.json({ success: true, syncedIds: processedIds, conflicts, ack: { status: 'processed', idempotencyKey } });

    } catch (error: any) {
        console.error("Transaction sync error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
