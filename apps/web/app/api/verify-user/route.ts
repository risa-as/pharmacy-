export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SYNC_SECRET = process.env.SYNC_TOKEN_SECRET || 'faramace-sync-secret-key';

export function generateSyncToken(userId: string, branchId: string, orgId: string, role: string): string {
    return crypto.createHmac('sha256', SYNC_SECRET)
        .update(`${userId}:${branchId}:${orgId}:${role}`)
        .digest('hex');
}

export async function POST(req: Request) {
    try {
        const { email, password } = await req.json();

        const user = await prisma.user.findFirst({
            where: { email },
            include: { branch: { select: { organizationId: true } } },
        });

        if (!user) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        const isMatch = bcrypt.compareSync(password, user.password);
        if (!isMatch) {
            return NextResponse.json({ success: false, error: 'Invalid password' }, { status: 401 });
        }

        const orgId = user.branch?.organizationId || '';
        const syncToken = generateSyncToken(user.id, user.branchId || '', orgId, user.role);

        const { password: _, branch: __, ...userWithoutPassword } = user as any;
        return NextResponse.json({
            success: true,
            user: { ...userWithoutPassword, organizationId: orgId },
            syncToken,
        });

    } catch (error) {
        console.error("Verify user error:", error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
