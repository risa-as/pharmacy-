export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from '@/auth';
import { z } from "zod";


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
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const result = SyncPayloadSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: "Invalid Payload", details: result.error }, { status: 400 });
        }

        const { branchId, transactions } = result.data;

        // ── Check if loyalty is enabled for this branch's organization ──────────
        const branch = await prisma.branch.findUnique({
            where: { id: branchId },
            select: { organizationId: true, organization: { select: { loyaltyEnabled: true } } }
        });

        // Validate branchId ownership
        const userRole = (session.user as any).role;
        const userBranchId = (session.user as any).branchId;
        const userOrgId = (session.user as any).organizationId;
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
        // Track which accounts were updated so we can return their new balances
        const updatedAccountIds = new Set<string>();

        for (const txData of transactions) {
            try {
                await prisma.$transaction(async (prismaTx: any) => {
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

                    // 2. Skip duplicate transactions (idempotent)
                    const existingTx = await prismaTx.loyaltyTransaction.findUnique({
                        where: { id: txData.id }
                    });

                    if (existingTx) {
                        updatedAccountIds.add(account!.id);
                        return;
                    }

                    // 3. Create Transaction
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

                    // 4. Update Account Points (replay the event)
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

                    // 5. Recalculate tier from lifetime points
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
                });
                processedIds.push(txData.id);
            } catch (err) {
                console.error(`Failed to sync loyalty tx ${txData.id}:`, err);
            }
        }

        // ── Return authoritative balances so the desktop can reconcile ──────────
        const accountBalances = updatedAccountIds.size > 0
            ? await prisma.loyaltyAccount.findMany({
                where: { id: { in: [...updatedAccountIds] } },
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
            accountBalances,
        });

    } catch (error) {
        console.error("Loyalty Sync Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
