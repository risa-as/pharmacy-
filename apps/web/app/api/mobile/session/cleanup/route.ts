export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

/**
 * POST /api/mobile/session/cleanup
 * Deactivates MobileSessions that have not been updated in more than 24 hours.
 * Should be called by a cron job or periodic task.
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
