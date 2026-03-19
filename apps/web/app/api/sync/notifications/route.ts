export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from "@/app/lib/prisma";
import { validateSyncUser } from '@/app/lib/sync-auth';


/**
 * GET /api/sync/notifications?since=ISO_TIMESTAMP
 *
 * Incremental notification sync endpoint for the mobile app.
 * Returns only notifications created or updated since `since`.
 * This avoids re-fetching all 50 notifications on every poll cycle.
 *
 * Query params:
 *   since — ISO 8601 timestamp (e.g. 2026-03-01T12:00:00Z)
 *           If omitted, returns the latest 50 notifications (full fetch).
 */
export async function GET(req: Request) {
    const syncUser = await validateSyncUser(req);
    if (syncUser instanceof NextResponse) return syncUser;

    const { searchParams } = new URL(req.url);
    const sinceParam = searchParams.get('since');
    const since = sinceParam ? new Date(sinceParam) : null;

    if (since && isNaN(since.getTime())) {
        return NextResponse.json({ message: 'Invalid since timestamp' }, { status: 400 });
    }

    const notifications = await prisma.notification.findMany({
        where: {
            userId: syncUser.id,
            ...(since ? { createdAt: { gt: since } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: since ? 200 : 50, // larger window for incremental; capped for full fetch
        select: {
            id: true,
            title: true,
            body: true,
            type: true,
            isRead: true,
            data: true,
            createdAt: true,
        },
    });

    const unreadCount = await prisma.notification.count({
        where: { userId: syncUser.id, isRead: false },
    });

    return NextResponse.json({
        notifications,
        unreadCount,
        syncedAt: new Date().toISOString(),
    });
}
