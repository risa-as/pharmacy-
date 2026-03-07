import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
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

const SyncPayloadSchema = z.object({
    branchId: z.string(),
    transactions: z.array(SyncTransactionSchema)
});

export async function POST(req: NextRequest) {
    try {
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

        await prisma.$transaction(async (tx) => {
            for (const txn of transactions) {
                const existing = await tx.transaction.findUnique({ where: { id: txn.id } });

                if (existing) {
                    continue; // Log already exists, skip
                }

                // Create Transaction
                await tx.transaction.create({
                    data: {
                        id: txn.id,
                        safeId: txn.safeId,
                        type: txn.type,
                        amount: txn.amount,
                        referenceType: txn.referenceType,
                        referenceId: txn.referenceId,
                        description: txn.description,
                        userId: txn.userId,
                        createdAt: new Date(txn.createdAt),
                        updatedAt: new Date(txn.updatedAt)
                    }
                });
                processedIds.push(txn.id);

                // Update Safe Balance in Cloud DB
                const safe = await tx.safe.findUnique({ where: { id: txn.safeId } });
                if (safe) {
                    const newBalance = txn.type === "IN" ? safe.balance + txn.amount : safe.balance - txn.amount;
                    await tx.safe.update({
                        where: { id: txn.safeId },
                        data: { balance: newBalance }
                    });
                }
            }

            // Log the action
            await tx.syncActionLog.upsert({
                where: { idempotencyKey },
                update: { status: "PROCESSED", updatedAt: new Date() },
                create: {
                    idempotencyKey,
                    actionType: "SYNC_TRANSACTIONS",
                    branchId,
                    status: "PROCESSED"
                }
            });
        });

        return NextResponse.json({ success: true, syncedIds: processedIds, ack: { status: 'processed', idempotencyKey } });

    } catch (error: any) {
        console.error("Transaction sync error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
