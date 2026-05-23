export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

/**
 * When CRON_SECRET is configured, Vercel Cron sends it as a Bearer token.
 * If it's set we require it; if it isn't we stay backward-compatible.
 */
function isCronAuthorized(req: Request): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return true;
    return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function runCleanup() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await prisma.mobileSession.updateMany({
        where: { isActive: true, lastSeenAt: { lt: cutoff } },
        data: { isActive: false },
    });
    return NextResponse.json({
        success: true,
        deactivatedCount: result.count,
        message: `تم إلغاء تفعيل ${result.count} جلسة منتهية الصلاحية`,
    });
}

/** Called by Vercel Cron (GET) daily at 3 AM UTC */
export async function GET(req: Request) {
    try {
        if (!isCronAuthorized(req)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return await runCleanup();
    } catch (error) {
        console.error("Mobile session cleanup error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * POST /api/mobile/session/cleanup
 * Can also be triggered manually by an admin (or the cron secret).
 */
export async function POST(req: Request) {
    try {
        if (!isCronAuthorized(req)) {
            const session = await auth();
            const role = (session?.user as any)?.role;
            if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        }
        return await runCleanup();
    } catch (error) {
        console.error("Mobile session cleanup error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
