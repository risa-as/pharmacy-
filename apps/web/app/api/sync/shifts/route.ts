export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { validateSyncUser } from '@/app/lib/sync-auth';
import { z } from "zod";


const SyncShiftSchema = z.object({
    id: z.string(),
    userId: z.string(),
    branchId: z.string(),
    safeId: z.string().nullable().optional(),
    startTime: z.string().or(z.date()),
    endTime: z.string().or(z.date()).nullable().optional(),
    duration: z.number().default(0),
    startingCash: z.number().default(0),
    expectedCash: z.number().default(0),
    actualCash: z.number().nullable().optional(),
    status: z.string().default("OPEN"),
    createdAt: z.string().or(z.date()),
    updatedAt: z.string().or(z.date()),
});

const SyncPayloadSchema = z.object({
    branchId: z.string(),
    shifts: z.array(SyncShiftSchema)
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

        const { branchId, shifts } = result.data;

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
            for (const shift of shifts) {
                const existing = await tx.shift.findUnique({ where: { id: shift.id } });

                if (existing) {
                    // Update existing
                    await tx.shift.update({
                        where: { id: shift.id },
                        data: {
                            endTime: shift.endTime ? new Date(shift.endTime) : null,
                            duration: shift.duration,
                            expectedCash: shift.expectedCash,
                            actualCash: shift.actualCash,
                            status: shift.status,
                            updatedAt: shift.updatedAt ? new Date(shift.updatedAt) : new Date()
                        }
                    });
                } else {
                    // Guard: branch must exist in cloud before we can create a shift
                    const shiftBranch = await tx.branch.findUnique({ where: { id: shift.branchId }, select: { id: true } });
                    if (!shiftBranch) {
                        console.warn(`[Shift Sync] Branch ${shift.branchId} not yet in cloud — skipping shift ${shift.id}`);
                        continue;
                    }

                    // Ensure the safe exists in cloud (desktop may have auto-created it locally)
                    let resolvedSafeId = shift.safeId ?? null;
                    if (resolvedSafeId) {
                        const safeExists = await tx.safe.findUnique({ where: { id: resolvedSafeId }, select: { id: true } });
                        if (!safeExists) {
                            await tx.safe.upsert({
                                where: { id: resolvedSafeId },
                                update: {},
                                create: { id: resolvedSafeId, name: 'الصندوق الرئيسي', type: 'CASH_DRAWER', balance: 0, branchId: shift.branchId }
                            });
                        }
                    }
                    // Create new
                    await tx.shift.create({
                        data: {
                            id: shift.id,
                            userId: shift.userId,
                            branchId: shift.branchId,
                            safeId: resolvedSafeId,
                            startTime: new Date(shift.startTime),
                            endTime: shift.endTime ? new Date(shift.endTime) : null,
                            duration: shift.duration,
                            startingCash: shift.startingCash,
                            expectedCash: shift.expectedCash,
                            actualCash: shift.actualCash,
                            status: shift.status,
                            createdAt: new Date(shift.createdAt),
                            updatedAt: shift.updatedAt ? new Date(shift.updatedAt) : new Date()
                        }
                    });
                }
                processedIds.push(shift.id);
            }

            // Log the action
            await tx.syncActionLog.upsert({
                where: { idempotencyKey },
                update: { status: "PROCESSED" },
                create: {
                    idempotencyKey,
                    actionType: "SYNC_SHIFTS",
                    branchId,
                    status: "PROCESSED"
                }
            });
        });

        return NextResponse.json({ success: true, syncedIds: processedIds, ack: { status: 'processed', idempotencyKey } });

    } catch (error: any) {
        console.error("Shift sync error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
