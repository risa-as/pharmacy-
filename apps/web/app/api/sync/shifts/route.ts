export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { validateSyncUser, operatorPermissions } from '@/app/lib/sync-auth';
import { logAudit, resolveUserName } from '@/app/lib/audit';
import { z } from "zod";


const SyncShiftSchema = z.object({
    id: z.string(),
    userId: z.string(),
    // User snapshot — lets the cloud resolve the correct user when the desktop's
    // local userId diverges from the cloud one (same email, different IDs).
    userEmail: z.string().nullable().optional(),
    userName: z.string().nullable().optional(),
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
        // Records that name another branch/organisation's shift, user or branch.
        // They are refused for review (never written, never silently dropped).
        const conflicts: { id: string; message: string }[] = [];

        // Process each shift in its own transaction so a single bad record
        // (e.g. an unresolvable user) can't roll back the entire batch and
        // block every shift from ever syncing.
        for (const shift of shifts) {
            try {
                if (shift.branchId !== branchId) {
                    conflicts.push({ id: shift.id, message: 'الوردية تخص فرعاً غير فرع المزامنة.' });
                    continue;
                }
                const outcome = await prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<'created' | 'closed' | 'updated' | 'skip' | 'foreign' | 'owner' | 'forbidden'> => {
                    const existing = await tx.shift.findUnique({ where: { id: shift.id } });

                    if (existing && existing.branchId !== branchId) return 'foreign';
                    if (existing) {
                        // Only the shift's own employee may change it. The desktop may
                        // know that employee by a local id; the email snapshot then
                        // identifies them, as it did when the shift was created.
                        const sameOwner = shift.userId === existing.userId || (!!shift.userEmail
                            && !!await tx.user.findFirst({ where: { id: existing.userId, email: shift.userEmail }, select: { id: true } }));
                        if (!sameOwner) return 'owner';
                        // N02-R: same permission as clockOut on the web, for that
                        // employee and the signed-in session, as of now.
                        const perms = await operatorPermissions(tx, existing.userId, branchId, syncUser);
                        if (perms === null || (perms !== 'unattributed' && !perms.canSell)) return 'forbidden';
                        // Audit the open→closed transition only (not every re-sync of
                        // an open shift) so the log isn't flooded with duplicates.
                        const becameClosed = existing.status !== 'CLOSED' && shift.status === 'CLOSED';
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
                        return becameClosed ? 'closed' : 'updated';
                    }

                    // Guard: branch must exist in cloud before we can create a shift.
                    // Return false (not synced) so the desktop retries once the branch syncs.
                    const shiftBranch = await tx.branch.findUnique({ where: { id: shift.branchId }, select: { id: true } });
                    if (!shiftBranch) {
                        console.warn(`[Shift Sync] Branch ${shift.branchId} not yet in cloud — skipping shift ${shift.id}`);
                        return 'skip';
                    }

                    // Resolve the user. The desktop's local userId may not exist in
                    // the cloud when the same email was created on both sides with
                    // different IDs. Fall back to matching by the user's email so the
                    // FK on Shift.userId is satisfied instead of failing the sync.
                    // Only users of this branch's organisation; a user found elsewhere
                    // is a foreign record, a user found nowhere is not synced yet.
                    let resolvedUserId = shift.userId;
                    const userById = await tx.user.findUnique({ where: { id: resolvedUserId }, select: { id: true, branch: { select: { organizationId: true } } } });
                    if (userById && userById.branch?.organizationId !== orgId) return 'foreign';
                    if (!userById) {
                        if (shift.userEmail) {
                            const userByEmail = await tx.user.findUnique({ where: { email: shift.userEmail }, select: { id: true, branch: { select: { organizationId: true } } } });
                            if (userByEmail && userByEmail.branch?.organizationId !== orgId) return 'foreign';
                            if (userByEmail) {
                                resolvedUserId = userByEmail.id;
                            } else {
                                console.warn(`[Shift Sync] User ${shift.userId} (email ${shift.userEmail}) not in cloud — skipping shift ${shift.id}`);
                                return 'skip';
                            }
                        } else {
                            console.warn(`[Shift Sync] User ${shift.userId} not in cloud and no email snapshot — skipping shift ${shift.id}`);
                            return 'skip';
                        }
                    }

                    // N02-R: same permission as clockIn on the web. Checked after the
                    // user resolves, so an employee not synced yet stays retryable.
                    const perms = await operatorPermissions(tx, resolvedUserId, branchId, syncUser);
                    if (perms === null || (perms !== 'unattributed' && !perms.canSell)) return 'forbidden';

                    // Resolve the safe to the branch's canonical CASH_DRAWER safe so a
                    // diverging desktop-local safe id can't create a duplicate "الصندوق الرئيسي".
                    // A safe id from another branch is never used: fall back to this
                    // branch's canonical safe as for an unknown desktop-local id.
                    let resolvedSafeId = shift.safeId ?? null;
                    if (resolvedSafeId) {
                        const exact = await tx.safe.findUnique({ where: { id: resolvedSafeId }, select: { id: true, branchId: true } });
                        if (!exact || exact.branchId !== shift.branchId) {
                            // Reuse the existing branch safe if there is one; otherwise create it.
                            const existingSafe = await tx.safe.findFirst({
                                where: { branchId: shift.branchId, type: 'CASH_DRAWER' },
                                orderBy: { createdAt: 'asc' },
                                select: { id: true },
                            });
                            if (existingSafe) {
                                resolvedSafeId = existingSafe.id;
                            } else {
                                const created = await tx.safe.create({
                                    data: { ...(exact ? {} : { id: resolvedSafeId }), name: 'الصندوق الرئيسي', type: 'CASH_DRAWER', balance: 0, branchId: shift.branchId },
                                    select: { id: true },
                                });
                                resolvedSafeId = created.id;
                            }
                        }
                    }
                    // Create new
                    await tx.shift.create({
                        data: {
                            id: shift.id,
                            userId: resolvedUserId,
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
                    return 'created';
                });
                if (outcome === 'foreign') {
                    conflicts.push({ id: shift.id, message: 'الوردية تشير إلى وردية أو مستخدم من فرع أو مؤسسة أخرى.' });
                    continue;
                }
                if (outcome === 'owner') {
                    conflicts.push({ id: shift.id, message: 'تعديل وردية موظف آخر؛ تتطلب العملية مراجعة.' });
                    continue;
                }
                if (outcome === 'forbidden') {
                    conflicts.push({ id: shift.id, message: 'صلاحية البيع غير متاحة لموظف الوردية أو للجلسة؛ تتطلب العملية مراجعة.' });
                    continue;
                }
                // Only acknowledge shifts we actually wrote, so guarded-skip shifts
                // (branch/user not yet in cloud) are retried on the next sync.
                if (outcome !== 'skip') processedIds.push(shift.id);
                // Audit shift open (created) and close transitions, attributed to the
                // employee on duty (userName snapshot from the desktop).
                if (outcome === 'created' || outcome === 'closed') {
                    await logAudit({
                        userId: shift.userId,
                        userName: shift.userName ?? await resolveUserName(shift.userId),
                        action: outcome === 'closed' ? 'SHIFT_CLOSE' : 'SHIFT_OPEN',
                        entity: 'SHIFT',
                        entityId: shift.id,
                        details: JSON.stringify({ expectedCash: shift.expectedCash, actualCash: shift.actualCash, source: 'desktop-sync' }),
                        branchId,
                    });
                }
            } catch (shiftErr: any) {
                console.error(`[Shift Sync] Failed to sync shift ${shift.id}:`, shiftErr.message);
                // Continue with the remaining shifts
            }
        }

        // Log the action (outside the per-shift transactions)
        await prisma.syncActionLog.upsert({
            where: { idempotencyKey },
            update: { status: "PROCESSED" },
            create: {
                idempotencyKey,
                actionType: "SYNC_SHIFTS",
                branchId,
                status: "PROCESSED"
            }
        });

        return NextResponse.json({ success: true, syncedIds: processedIds, conflicts, ack: { status: 'processed', idempotencyKey } });

    } catch (error: any) {
        console.error("Shift sync error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
