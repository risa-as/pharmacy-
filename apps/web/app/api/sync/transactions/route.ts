export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { validateSyncUser } from '@/app/lib/sync-auth';
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
        if (userRole !== 'SUPER_ADMIN') {
            const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { organizationId: true } });
            if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
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

        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // Resolve a desktop-local safe id to the cloud's canonical CASH_DRAWER
            // safe for this branch. Prevents duplicate "الصندوق الرئيسي" safes when
            // the desktop's local safe id differs from the one already in cloud.
            const safeIdMap = new Map<string, string>();
            async function resolveSafeId(incomingSafeId: string): Promise<string> {
                const cached = safeIdMap.get(incomingSafeId);
                if (cached) return cached;

                // 1. The exact safe already exists in cloud → use it as-is.
                const exact = await tx.safe.findUnique({ where: { id: incomingSafeId }, select: { id: true } });
                if (exact) {
                    safeIdMap.set(incomingSafeId, exact.id);
                    return exact.id;
                }

                // 2. A CASH_DRAWER safe already exists for this branch → reuse it
                //    instead of creating a duplicate under the incoming id.
                const existing = await tx.safe.findFirst({
                    where: { branchId, type: 'CASH_DRAWER' },
                    orderBy: { createdAt: 'asc' },
                    select: { id: true },
                });
                if (existing) {
                    safeIdMap.set(incomingSafeId, existing.id);
                    return existing.id;
                }

                // 3. No safe exists yet → create the canonical one (keep the incoming id).
                try {
                    const created = await tx.safe.create({
                        data: { id: incomingSafeId, name: 'الصندوق الرئيسي', type: 'CASH_DRAWER', balance: 0, branchId },
                        select: { id: true },
                    });
                    safeIdMap.set(incomingSafeId, created.id);
                    return created.id;
                } catch {
                    // Created concurrently — re-fetch the branch's safe.
                    const fallback = await tx.safe.findFirst({
                        where: { branchId, type: 'CASH_DRAWER' },
                        orderBy: { createdAt: 'asc' },
                        select: { id: true },
                    });
                    const resolved = fallback?.id ?? incomingSafeId;
                    safeIdMap.set(incomingSafeId, resolved);
                    return resolved;
                }
            }

            for (const txn of transactions) {
                const existing = await tx.transaction.findUnique({ where: { id: txn.id } });

                if (existing) {
                    continue; // Log already exists, skip
                }

                // Map the desktop's safe id onto the branch's canonical safe.
                const resolvedSafeId = await resolveSafeId(txn.safeId);

                // Create Transaction
                await tx.transaction.create({
                    data: {
                        id: txn.id,
                        safeId: resolvedSafeId,
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
                const safe = await tx.safe.findUnique({ where: { id: resolvedSafeId } });
                if (safe) {
                    const newBalance = txn.type === "IN" ? safe.balance + txn.amount : safe.balance - txn.amount;
                    await tx.safe.update({
                        where: { id: resolvedSafeId },
                        data: { balance: newBalance }
                    });
                }
            }

            // Log the action
            await tx.syncActionLog.upsert({
                where: { idempotencyKey },
                update: { status: "PROCESSED" },
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
