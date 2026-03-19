export const dynamic = 'force-dynamic';

import { prisma } from '@/app/lib/prisma';
import { requireFeature } from '@/app/lib/page-guards';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';
import BranchComparisonClient from './BranchComparisonClient';

export default async function BranchComparisonPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { organizationId, user } = tenantCtx;

    // Fix #4: Staff users (no organizationId) must look up their org via branchId
    let resolvedOrgId = organizationId;
    if (!resolvedOrgId && user.branchId) {
        const branch = await prisma.branch.findUnique({
            where: { id: user.branchId },
            select: { organizationId: true }
        });
        resolvedOrgId = branch?.organizationId ?? undefined;
    }

    if (resolvedOrgId) {
        const upgrade = await requireFeature(resolvedOrgId, 'advancedReports');
        if (upgrade) return <UpgradeRequired {...upgrade} />;
    }

    return <BranchComparisonClient />;
}
