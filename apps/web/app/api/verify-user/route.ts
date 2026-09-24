export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import bcrypt from 'bcryptjs';
import { generateSyncToken } from '@/app/lib/sync-token';
import { issueOperatorProof, requestDeviceId } from '@/app/lib/operator-proof';
import { enforceRateLimit } from '@/app/lib/rate-limit';
import { getSubscriptionState } from '@/app/lib/subscription-state';
import { deviceSigningEnabled } from '@/app/lib/device-signature';
import { enforceDeviceSignature } from '@/app/lib/device-auth';

export async function POST(req: Request) {
    try {
        const limited = await enforceRateLimit(req, 'verify-user', 10, 60_000);
        if (limited) return limited;

        const signatureRequest = req.clone();
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
        // Signed with the current sessionVersion; the desktop echoes it back as
        // x-session-version (user.sessionVersion is also in the response body).
        const deviceId = user.branchId ? await requestDeviceId(prisma, req, user.branchId) : null;
        const signingKey = deviceSigningEnabled() && deviceId ? await prisma.deviceSigningKey.findUnique({where:{licenseId:deviceId}}) : null;
        // Signature validation reads a clone before the body is consumed (see below).
        if (signingKey?.status === 'ACTIVE') {
            const denied = await enforceDeviceSignature(signatureRequest);
            if (denied) return denied;
        }
        if (signingKey?.status === 'REVOKED') return NextResponse.json({error:'اعتماد الجهاز ملغى.'},{status:403});
        const syncToken = generateSyncToken(user.id, user.branchId || '', orgId, user.role, user.sessionVersion,
            signingKey?.status === 'ACTIVE' ? {keyId:signingKey.id,fingerprint:signingKey.fingerprint} : undefined);

        const { password: _, branch: __, ...userWithoutPassword } = user as any;
        return NextResponse.json({
            success: true,
            user: { ...userWithoutPassword, organizationId: orgId },
            syncToken,
            // A bootstrap login may propose a key, but strict sync still rejects
            // its token until an administrator approves the key and it logs in again.
            deviceEnrollmentRequired: deviceSigningEnabled() && process.env.REQUIRE_TPM_SYNC === 'true' && signingKey?.status !== 'ACTIVE',
            // N16: proves later that this employee performed the operations the
            // desktop attributes to them. Not a sync credential.
            // Bound to this device's license when it presents one (N16).
            ...(user.branchId ? { operatorProof: issueOperatorProof(user.id, user.branchId, user.sessionVersion, await requestDeviceId(prisma, req, user.branchId)) } : {}),
        });

    } catch (error) {
        console.error("Verify user error:", error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
