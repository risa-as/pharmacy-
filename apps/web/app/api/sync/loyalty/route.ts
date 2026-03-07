import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { z } from "zod";


const SyncLoyaltyTransactionSchema = z.object({
    id: z.string(),
    patientId: z.string(), // We need patientId to link/create account
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
        const body = await req.json();
        const result = SyncPayloadSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: "Invalid Payload", details: result.error }, { status: 400 });
        }

        const { transactions } = result.data;
        const processedIds: string[] = [];

        for (const txData of transactions) {
            try {
                await prisma.$transaction(async (prismaTx) => {
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
                            // Race condition check
                            account = await prismaTx.loyaltyAccount.findUnique({
                                where: { patientId: txData.patientId }
                            });
                            if (!account) throw e;
                        }
                    }

                    // 2. Check if transaction already exists
                    const existingTx = await prismaTx.loyaltyTransaction.findUnique({
                        where: { id: txData.id }
                    });

                    if (existingTx) {
                        return; // Already synced
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

                    // 4. Update Account Points
                    // We assume the desktop calc is correct, but since we are syncing *events*, 
                    // we should replay the effect on the server balance.
                    // EARN adds, REDEEM subtracts.

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

                    // Update Tier Logic (Simple version)
                    const updatedAccount = await prismaTx.loyaltyAccount.findUnique({ where: { id: account!.id } });
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

                });
                processedIds.push(txData.id);
            } catch (err) {
                console.error(`Failed to sync loyalty tx ${txData.id}:`, err);
            }
        }

        return NextResponse.json({ success: true, syncedIds: processedIds });

    } catch (error) {
        console.error("Loyalty Sync Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
