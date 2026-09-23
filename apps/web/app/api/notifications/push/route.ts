export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { getTenantContext } from '@/app/lib/tenant-utils';

// POST: Send push notification to specific users or a branch
export async function POST(req: NextRequest) {
    try {
        const ctx = await getTenantContext();
        if (ctx instanceof NextResponse) return ctx;
        if (ctx.user.role !== 'ADMIN' || !ctx.organizationId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { title, body: messageBody, targetUserIds, targetBranchId } = body;

        if (!title || !messageBody) {
            return NextResponse.json({ error: "title and body are required" }, { status: 400 });
        }

        // Every target set (explicit users, a branch, or "all") is intersected with
        // the admin's own organization; previously "all" meant every user on the platform.
        const target = Array.isArray(targetUserIds) && targetUserIds.length > 0
            ? { id: { in: targetUserIds } }
            : targetBranchId ? { branchId: targetBranchId } : {};

        const users = await prisma.user.findMany({
            where: { AND: [{ pushEnabled: true, expoPushToken: { not: null } }, { branch: { organizationId: ctx.organizationId } }, target] },
            select: { id: true, expoPushToken: true, name: true }
        });

        const tokens = users
            .map((u: any) => u.expoPushToken)
            .filter((t: string | null | undefined): t is string => t !== null && t !== undefined && t.length > 0);

        if (tokens.length === 0) {
            return NextResponse.json({
                success: false,
                message: 'لا يوجد مستخدمين مع Expo push tokens مفعّلة',
                sent: 0
            });
        }

        // Send via Expo Push API
        const messages = tokens.map((token: any) => ({
            to: token,
            title,
            body: messageBody,
            sound: 'default',
            data: { type: 'notification', from: 'admin' }
        }));

        // Batch send to Expo push API
        const chunks = chunkArray(messages, 100);
        let totalSent = 0;
        const errors: string[] = [];

        for (const chunk of chunks) {
            try {
                const response = await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(chunk)
                });

                if (response.ok) {
                    totalSent += chunk.length;
                } else {
                    const err = await response.text();
                    errors.push(err);
                }
            } catch (e: any) {
                errors.push(e.message);
            }
        }

        return NextResponse.json({
            success: true,
            sent: totalSent,
            totalTokens: tokens.length,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error: any) {
        console.error('Push Notification Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// GET: Get notification status (tokens count per branch)
export async function GET() {
    try {
        const ctx = await getTenantContext();
        if (ctx instanceof NextResponse) return ctx;

        // Counts are scoped to the caller's tenant (previously platform-wide).
        const scope = { branch: ctx.branchModelWhere };
        const enabled = { AND: [scope, { pushEnabled: true, expoPushToken: { not: null } }] };

        const stats = await prisma.user.groupBy({
            by: ['branchId'],
            where: enabled,
            _count: true
        });

        const totalEnabled = await prisma.user.count({ where: enabled });

        const totalUsers = await prisma.user.count({ where: scope });

        return NextResponse.json({
            totalUsers,
            totalEnabled,
            byBranch: stats
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Register push token for current user
export async function PUT(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { expoPushToken, pushEnabled } = await req.json();

        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                ...(expoPushToken !== undefined && { expoPushToken }),
                ...(pushEnabled !== undefined && { pushEnabled })
            }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}
