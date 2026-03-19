export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { checkMobileSessionLimit } from "@/app/lib/saas-guards";

/**
 * POST /api/mobile/session
 * Called on login and on every app startup.
 *
 * Body: { userId, deviceToken }
 *
 * deviceToken is a UUID generated once per device installation and stored
 * in AsyncStorage.  Each device gets its own row in MobileSession so the
 * plan limit ("max N active devices per org") can be enforced correctly.
 *
 * Rules:
 *  - Same device (same deviceToken) → just refresh lastSeenAt, no limit check.
 *  - New device (unknown deviceToken) → check limit → allow or 403.
 *  - Dirty-state (more active rows than allowed) → evict the oldest devices.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { userId, deviceToken } = body;

        if (!userId || !deviceToken) {
            return NextResponse.json({ error: "userId and deviceToken are required" }, { status: 400 });
        }

        // Resolve user and their organisation
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { branch: true },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // SUPER_ADMIN is platform staff — not subject to tenant session limits
        if (user.role === 'SUPER_ADMIN') {
            return NextResponse.json({ success: true, skipped: true });
        }

        const organizationId = user.branch?.organizationId;
        if (!organizationId) {
            return NextResponse.json({ error: "User has no organization" }, { status: 400 });
        }

        // ── Case 1: This exact device already has an active session ──────────
        const existing = await (prisma as any).mobileSession.findUnique({
            where: { deviceToken },
        });

        if (existing?.isActive) {
            // Same device, same user — just refresh the heartbeat timestamp
            const updated = await (prisma as any).mobileSession.update({
                where: { deviceToken },
                data: { lastSeenAt: new Date() },
            });
            return NextResponse.json({ success: true, sessionId: updated.id });
        }

        // ── Case 2: Device has an inactive row OR is completely new ──────────
        // Fetch current limit state (counts ALL active sessions for this org)
        const limitResult = await checkMobileSessionLimit(organizationId);
        const { max, current } = limitResult;
        const isUnlimited = max < 0;

        if (!isUnlimited && current > max) {
            // Dirty state: more active devices than the plan allows.
            // Evict the least-recently-active devices to restore the correct count.
            const excessCount = current - max;
            const toEvict = await (prisma as any).mobileSession.findMany({
                where: { organizationId, isActive: true },
                orderBy: { lastSeenAt: 'asc' },
                take: excessCount,
            });
            if (toEvict.length > 0) {
                await (prisma as any).mobileSession.updateMany({
                    where: { id: { in: toEvict.map((s: { id: string }) => s.id) } },
                    data: { isActive: false },
                });
            }
            // Re-check after eviction
            const afterEvict = await checkMobileSessionLimit(organizationId);
            if (!afterEvict.allowed) {
                return NextResponse.json(
                    {
                        error: `تم الوصول للحد الأقصى من جلسات تطبيق الموبايل في باقتك (${max} مستخدم). يرجى تسجيل خروج جهاز آخر أو الترقية لباقة أعلى.`,
                        code: "MOBILE_SESSION_LIMIT_EXCEEDED",
                        currentSessions: afterEvict.current,
                        maxSessions: max,
                    },
                    { status: 403 }
                );
            }
        } else if (!limitResult.allowed) {
            // Normal enforcement: at or over the limit, no dirty state
            return NextResponse.json(
                {
                    error: `تم الوصول للحد الأقصى من جلسات تطبيق الموبايل في باقتك (${max} مستخدم). يرجى تسجيل خروج جهاز آخر أو الترقية لباقة أعلى.`,
                    code: "MOBILE_SESSION_LIMIT_EXCEEDED",
                    currentSessions: current,
                    maxSessions: max,
                },
                { status: 403 }
            );
        }

        // Create a new session row for this device (or reactivate the old inactive one)
        const session = await (prisma as any).mobileSession.upsert({
            where: { deviceToken },
            update: { isActive: true, lastSeenAt: new Date(), userId, organizationId },
            create: { deviceToken, userId, organizationId, isActive: true },
        });

        return NextResponse.json({ success: true, sessionId: session.id });

    } catch (error: any) {
        console.error("Mobile session start error:", error?.message ?? error);
        return NextResponse.json({ error: error?.message ?? "Internal server error" }, { status: 500 });
    }
}

/**
 * DELETE /api/mobile/session
 * Called on logout to release this device's seat.
 * Body: { userId, deviceToken }
 */
export async function DELETE(req: Request) {
    try {
        const body = await req.json();
        const { deviceToken } = body;

        if (!deviceToken) {
            return NextResponse.json({ error: "deviceToken is required" }, { status: 400 });
        }

        await (prisma as any).mobileSession.updateMany({
            where: { deviceToken },
            data: { isActive: false },
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Mobile session end error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
