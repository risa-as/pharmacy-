export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { validateSyncUser, operatorPermissions } from '@/app/lib/sync-auth';
import { z } from "zod";

/** How long a movement waits for its sale before review, counted from the
 * server's first sight of it (never the device clock). As for sale cash. */
const SALE_WAIT_MS = 24 * 60 * 60 * 1000;
const CONFLICTS = {
    foreign: 'حركة النقاط تخص مريضاً من مؤسسة أخرى.',
    unlinked: 'حركة نقاط بلا فاتورة؛ تتطلب مراجعة.',
    unmatched: 'حركة النقاط لفاتورة لم تصل إلى السحابة خلال يوم (قد تكون رُفضت للمراجعة)؛ تتطلب مراجعة.',
    mismatch: 'فاتورة حركة النقاط تخص فرعاً أو مريضاً آخر؛ تتطلب مراجعة.',
    excess: 'عدد النقاط يتجاوز ما يسمح به المدفوع أو خصم الفاتورة؛ تتطلب مراجعة.',
    insufficient: 'رصيد النقاط لا يكفي للاستبدال بعد يوم من الانتظار؛ تتطلب مراجعة.',
} as const;


const SyncLoyaltyTransactionSchema = z.object({
    id: z.string(),
    patientId: z.string(),
    type: z.string(),
    points: z.number(),
    description: z.string().nullable().optional(),
    saleId: z.string().nullable().optional(),
    createdAt: z.string().or(z.date()),
});

const SyncPayloadSchema = z.object({
    branchId: z.string(),
    transactions: z.array(SyncLoyaltyTransactionSchema)
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

        const { branchId, transactions } = result.data;

        // ── Check if loyalty is enabled for this branch's organization ──────────
        const branch = await prisma.branch.findUnique({
            where: { id: branchId },
            select: { organizationId: true, organization: { select: { loyaltyEnabled: true, loyaltyPointsPerDinar: true, loyaltyRedemptionValue: true } } }
        });

        // Validate branchId ownership
        const userRole = syncUser.role;
        const userBranchId = syncUser.branchId;
        const userOrgId = syncUser.organizationId;
        if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
        if (userRole !== 'SUPER_ADMIN') {
            if (userRole === 'ADMIN') {
                if (branch.organizationId !== userOrgId) {
                    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
                }
            } else {
                if (branchId !== userBranchId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }

        const loyaltyEnabled = branch?.organization?.loyaltyEnabled ?? false;

        if (!loyaltyEnabled) {
            // Loyalty is disabled — acknowledge all transactions so the desktop
            // marks them as synced and stops retrying. Points are NOT applied.
            return NextResponse.json({
                success: true,
                syncedIds: transactions.map(t => t.id),
                accountBalances: [],
                message: 'Loyalty program is disabled — transactions acknowledged but not applied',
            });
        }
        // ────────────────────────────────────────────────────────────────────────

        const processedIds: string[] = [];
        // Invalid records, or records naming another organisation's patient or
        // points: refused for review, never written and never silently dropped.
        const conflicts: { id: string; message: string }[] = [];
        // Track which accounts were updated so we can return their new balances
        const updatedAccountIds = new Set<string>();
        const orgId = branch.organizationId;
        // N02-R: points move only with a sale or a debt payment, so the signed-in
        // session needs one of those permissions. The desktop sends no operator.
        const perms = await operatorPermissions(prisma, null, branchId, syncUser);
        const permitted = perms === 'unattributed' || (!!perms && (perms.canSell || perms.canPayDebt));

        for (const txData of transactions) {
            if ((txData.type !== 'EARN' && txData.type !== 'REDEEM') || !Number.isFinite(txData.points) || txData.points < 0) {
                conflicts.push({ id: txData.id, message: 'حركة نقاط غير صالحة (النوع أو العدد).' });
                continue;
            }
            if (!permitted) {
                conflicts.push({ id: txData.id, message: 'صلاحية البيع أو تحصيل الديون غير متاحة للجلسة؛ تتطلب العملية مراجعة.' });
                continue;
            }
            try {
                const outcome = await prisma.$transaction(async (prismaTx: any): Promise<'done' | 'skip' | 'pending' | keyof typeof CONFLICTS> => {
                    // 0. Unknown legacy ownership is not shared ownership. Refuse
                    // unassigned patients without modifying their points or assigning
                    // them by guesswork. Missing cloud patients remain retryable.
                    const patient = await prismaTx.patient.findUnique({
                        where: { id: txData.patientId },
                        select: { branchId: true, branch: { select: { organizationId: true } } },
                    });
                    if (!patient) return 'skip';
                    if (!patient.branchId || patient.branch?.organizationId !== orgId) return 'foreign';

                    // A re-sent entry already applied: acknowledge, never apply twice.
                    const applied = await prismaTx.loyaltyTransaction.findUnique({
                        where: { id: txData.id }, select: { account: { select: { id: true, patientId: true } } },
                    });
                    if (applied) {
                        if (applied.account.patientId !== txData.patientId) return 'foreign';
                        updatedAccountIds.add(applied.account.id);
                        return 'done';
                    }

                    // N02-R: points move only against a sale of this branch, for this
                    // patient. A sale not in the cloud yet waits (sales may sync later),
                    // and becomes a review item after a day.
                    if (!txData.saleId) return 'unlinked';
                    const sale = await prismaTx.sale.findUnique({ where: { id: txData.saleId }, select: { branchId: true, patientId: true, discount: true } });
                    const waitKey = 'loyalty:' + txData.id;
                    // Waits (first sight on the server clock), then goes to review after a day.
                    const wait = async (late: 'unmatched' | 'insufficient') => {
                        const row = await prismaTx.syncMovementWait.upsert({
                            where: { transactionId: waitKey }, create: { transactionId: waitKey, branchId }, update: {},
                        });
                        return Date.now() - row.firstSeenAt.getTime() < SALE_WAIT_MS ? 'pending' as const : late;
                    };
                    if (!sale) return wait('unmatched');
                    if (sale.branchId !== branchId || sale.patientId !== txData.patientId) return 'mismatch';
                    // One patient's movements apply one at a time, so the limits
                    // below read a balance no concurrent sync is changing.
                    await prismaTx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'loyalty-patient:' + txData.patientId}::text, 0))`;

                    // 1. Ensure Loyalty Account exists for Patient
                    let account = await prismaTx.loyaltyAccount.findUnique({
                        where: { patientId: txData.patientId }
                    });

                    if (!account) {
                        try {
                            account = await prismaTx.loyaltyAccount.create({
                                data: {
                                    patientId: txData.patientId,
                                    totalPoints: 0,
                                    lifetimePoints: 0,
                                    tier: "BRONZE"
                                }
                            });
                        } catch (e) {
                            // Race condition — another request created it first
                            account = await prismaTx.loyaltyAccount.findUnique({
                                where: { patientId: txData.patientId }
                            });
                            if (!account) throw e;
                        }
                    }

                    // Limits recomputed on the server; the device's point count is a claim.
                    //  - EARN: all sale-linked points ever earned by the patient stay within
                    //    the organisation's rate times what the patient actually paid (non-
                    //    credit sales plus debt payments). Per patient, not per sale: the
                    //    desktop attaches debt-payment points to the patient's last sale.
                    //  - REDEEM: within the current balance (else wait: an earlier earn may
                    //    still be syncing), and worth no more than the sale's discount.
                    if (txData.type === 'EARN') {
                        const rate = branch.organization?.loyaltyPointsPerDinar ?? 0;
                        const [{ paid }] = await prismaTx.$queryRaw`
                            SELECT (
                                COALESCE((SELECT SUM(s.total) FROM "Sale" s LEFT JOIN "Payment" p ON p."saleId" = s.id
                                          WHERE s."patientId" = ${txData.patientId} AND (p.method IS NULL OR p.method::text <> 'CREDIT')), 0)
                              + COALESCE((SELECT SUM(dp.amount) FROM "DebtPayment" dp JOIN "Sale" s ON s.id = dp."saleId"
                                          WHERE s."patientId" = ${txData.patientId}), 0)
                            )::float8 AS paid`;
                        const earned = await prismaTx.loyaltyTransaction.aggregate({
                            where: { accountId: account!.id, type: 'EARN', saleId: { not: null } }, _sum: { points: true },
                        });
                        // +1 absorbs floating-point rounding of the device's floor().
                        if ((earned._sum.points ?? 0) + txData.points > Math.floor(Number(paid) * rate) + 1) return 'excess';
                    } else {
                        const value = branch.organization?.loyaltyRedemptionValue ?? 0;
                        if (Math.floor(txData.points * value) > (sale.discount ?? 0) + 0.01) return 'excess';
                        if (txData.points > account!.totalPoints) return wait('insufficient');
                    }
                    await prismaTx.syncMovementWait.deleteMany({ where: { transactionId: waitKey } });

                    // 2. Create Transaction
                    await prismaTx.loyaltyTransaction.create({
                        data: {
                            id: txData.id,
                            accountId: account!.id,
                            type: txData.type,
                            points: txData.points,
                            description: txData.description,
                            saleId: txData.saleId,
                            createdAt: new Date(txData.createdAt)
                        }
                    });

                    // 3. Update Account Points (replay the event)
                    if (txData.type === 'EARN') {
                        await prismaTx.loyaltyAccount.update({
                            where: { id: account!.id },
                            data: {
                                totalPoints: { increment: txData.points },
                                lifetimePoints: { increment: txData.points }
                            }
                        });
                    } else if (txData.type === 'REDEEM') {
                        await prismaTx.loyaltyAccount.update({
                            where: { id: account!.id },
                            data: {
                                totalPoints: { decrement: txData.points }
                            }
                        });
                    }

                    // 4. Recalculate tier from lifetime points
                    const updatedAccount = await prismaTx.loyaltyAccount.findUnique({
                        where: { id: account!.id }
                    });
                    if (updatedAccount) {
                        let newTier = "BRONZE";
                        if (updatedAccount.lifetimePoints >= 20000) newTier = "GOLD";
                        else if (updatedAccount.lifetimePoints >= 5000) newTier = "SILVER";

                        if (newTier !== updatedAccount.tier) {
                            await prismaTx.loyaltyAccount.update({
                                where: { id: account!.id },
                                data: { tier: newTier }
                            });
                        }
                    }

                    updatedAccountIds.add(account!.id);
                    return 'done';
                });
                if (outcome === 'done') processedIds.push(txData.id);
                else if (outcome !== 'skip' && outcome !== 'pending') conflicts.push({ id: txData.id, message: CONFLICTS[outcome] });
            } catch (err) {
                console.error(`Failed to sync loyalty tx ${txData.id}:`, err);
            }
        }

        // ── Return authoritative balances so the desktop can reconcile ──────────
        const accountBalances = updatedAccountIds.size > 0
            ? await prisma.loyaltyAccount.findMany({
                where: { id: { in: Array.from(updatedAccountIds) } },
                select: {
                    id: true,
                    patientId: true,
                    totalPoints: true,
                    lifetimePoints: true,
                    tier: true,
                }
            })
            : [];
        // ────────────────────────────────────────────────────────────────────────

        return NextResponse.json({
            success: true,
            syncedIds: processedIds,
            conflicts,
            accountBalances,
        });

    } catch (error) {
        console.error("Loyalty Sync Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
