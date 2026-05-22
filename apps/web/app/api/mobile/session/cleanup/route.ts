export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

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
export async function GET() {
    try {
        return await runCleanup();
    } catch (error) {
        console.error("Mobile session cleanup error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * POST /api/mobile/session/cleanup
 * Can also be triggered manually.
 */
export async function POST() {
    try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

        const result = await prisma.mobileSession.updateMany({
            where: {
                isActive: true,
                lastSeenAt: { lt: cutoff },
            },
            data: { isActive: false },
        });

        return NextResponse.json({
            success: true,
            deactivatedCount: result.count,
            message: `تم إلغاء تفعيل ${result.count} جلسة منتهية الصلاحية`,
        });

    } catch (error) {
        console.error("Mobile session cleanup error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
