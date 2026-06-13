export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import bcrypt from 'bcryptjs';
import { generateSyncToken } from '@/app/lib/sync-token';
import { enforceRateLimit } from '@/app/lib/rate-limit';
import { getSubscriptionState } from '@/app/lib/subscription-state';

export async function POST(req: Request) {
    try {
        const limited = await enforceRateLimit(req, 'verify-user', 10, 60_000);
        if (limited) return limited;

        const { email, password } = await req.json();

        const user = await prisma.user.findFirst({
            where: { email },
            include: { branch: { select: { organizationId: true } } },
        });

        const INVALID_CREDENTIALS = { success: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' };

        if (!user) {
            // Run a dummy bcrypt compare to match timing of real comparison (prevents
            // username enumeration via response-time difference).
            await bcrypt.compare(password, '$2b$10$invalidhashpadding00000000000000000000000000000000000');
            return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
        }

        // Reject soft-disabled (departed) employees.
        if ((user as any).isActive === false) {
            return NextResponse.json(
                { success: false, error: 'تم تعطيل هذا الحساب. يرجى مراجعة مدير الصيدلية.' },
                { status: 403 },
            );
        }

        const orgId = user.branch?.organizationId || '';

        // Block desktop login when the organisation is suspended / past grace.
        if (orgId && user.role !== 'SUPER_ADMIN') {
            const org = await prisma.organization.findUnique({
                where: { id: orgId },
                select: { isSuspended: true, subscriptionEndsAt: true },
            });
            if (org && getSubscriptionState(org).state === 'suspended') {
                return NextResponse.json(
                    { success: false, error: 'تم تعليق اشتراك مؤسستكم. يرجى تجديد الاشتراك للمتابعة.' },
                    { status: 403 },
                );
            }
        }
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
