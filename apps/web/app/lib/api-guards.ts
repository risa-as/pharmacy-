import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { checkFeatureAccess } from '@/app/lib/saas-guards';
import { getTenantContext } from '@/app/lib/tenant-utils';

/**
 * Helper: check feature access and return 403 if blocked.
 * Returns null if allowed, NextResponse if denied.
 */
export async function guardFeature(
    feature: string,
    requiredPlan: 'PROFESSIONAL' | 'ENTERPRISE'
): Promise<NextResponse | null> {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    const { organizationId } = tenantCtx;
    if (!organizationId) return null; // SUPER_ADMIN - allow all

    const access = await checkFeatureAccess(organizationId, feature as any);
    if (!access.allowed) {
        return NextResponse.json(
            {
                error: `هذه الميزة غير متاحة في باقتك الحالية. يرجى الترقية إلى باقة ${requiredPlan === 'PROFESSIONAL' ? 'الاحترافية' : 'الشركات'}.`,
                code: 'FEATURE_NOT_IN_PLAN',
                requiredPlan,
            },
            { status: 403 }
        );
    }

    return null;
}
