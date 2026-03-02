import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

/**
 * Resolve the current user from either:
 *  - A NextAuth session cookie (web dashboard)
 *  - A mobile Bearer token (base64-encoded "email:timestamp" from /api/auth/login)
 *
 * Returns the user's DB id, or null if unresolvable.
 * Callers return empty data (not 401) on null so the mobile polling loop
 * never triggers a spurious auto-logout.
 */
async function resolveUserId(req: NextRequest): Promise<string | null> {
    // 1. NextAuth session (web dashboard)
    const session = await auth();
    if (session?.user?.id) return session.user.id as string;

    // 2. Mobile Bearer token — decoded as "email:timestamp"
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const email = decoded.split(':')[0];
        if (!email) return null;
        const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        return user?.id ?? null;
    } catch {
        return null;
    }
}

/**
 * GET /api/notifications/in-app
 * Returns the 50 most recent notifications for the current user (unread first).
 * Query params:
 *   ?unread=1  → only return unread notifications
 */
export async function GET(req: NextRequest) {
    try {
        const userId = await resolveUserId(req);

        // Return empty — not 401 — so the mobile polling loop never triggers auto-logout
        if (!userId) {
            return NextResponse.json({ notifications: [], unreadCount: 0 });
        }

        const { searchParams } = new URL(req.url);
        const unreadOnly = searchParams.get('unread') === '1';

        const notifications = await prisma.notification.findMany({
            where: {
                userId,
                ...(unreadOnly ? { isRead: false } : {}),
            },
            orderBy: [
                { isRead: 'asc' },       // unread first
                { createdAt: 'desc' },
            ],
            take: 50,
        });

        const unreadCount = await prisma.notification.count({
            where: { userId, isRead: false },
        });

        return NextResponse.json({ notifications, unreadCount });
    } catch (error: any) {
        console.error('[in-app notifications GET]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/notifications/in-app
 * Marks the given notification IDs as read for the current user.
 * Body: { ids: string[] }   → mark specific IDs
 * Body: { all: true }       → mark all as read
 */
export async function POST(req: NextRequest) {
    try {
        const userId = await resolveUserId(req);
        if (!userId) {
            return NextResponse.json({ success: true, unreadCount: 0 });
        }

        const body = await req.json();
        const now = new Date();

        if (body.all) {
            await prisma.notification.updateMany({
                where: { userId, isRead: false },
                data: { isRead: true, readAt: now },
            });
        } else if (Array.isArray(body.ids) && body.ids.length > 0) {
            await prisma.notification.updateMany({
                where: {
                    id: { in: body.ids },
                    userId,
                },
                data: { isRead: true, readAt: now },
            });
        }

        const unreadCount = await prisma.notification.count({
            where: { userId, isRead: false },
        });

        return NextResponse.json({ success: true, unreadCount });
    } catch (error: any) {
        console.error('[in-app notifications POST]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
