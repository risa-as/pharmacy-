export const dynamic = 'force-dynamic';


import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import bcrypt from 'bcryptjs';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { enforceRateLimit } from '@/app/lib/rate-limit';

export async function POST(req: Request) {
    try {
        const limited = await enforceRateLimit(req, 'change-password', 10, 60_000);
        if (limited) return limited;

        // Identity comes from the authenticated session/token — never from the body.
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const { currentPassword, newPassword } = await req.json();

        if (!currentPassword || !newPassword) {
            return NextResponse.json(
                { message: 'Missing required fields' },
                { status: 400 }
            );
        }

        if (String(newPassword).length < 6) {
            return NextResponse.json(
                { message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: tenantCtx.user.id },
        });

        if (!user || !user.password) {
            return NextResponse.json(
                { message: 'User not found' },
                { status: 404 }
            );
        }

        const isValid = await bcrypt.compare(currentPassword, user.password);

        if (!isValid) {
            return NextResponse.json(
                { message: 'Invalid current password' },
                { status: 401 }
            );
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword },
        });

        return NextResponse.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Password change error:', error);
        return NextResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
        );
    }
}
