export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import bcrypt from 'bcryptjs';
import { generateSyncToken } from '@/app/lib/sync-token';

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
