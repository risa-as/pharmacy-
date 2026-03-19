export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import AuditLogClient from "@/app/ui/reports/audit-log-client";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { requireFeature } from '@/app/lib/page-guards';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';

export default async function AuditLogPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere, tenantWhere, organizationId } = tenantCtx;

    if (organizationId) {
        const upgrade = await requireFeature(organizationId, 'advancedReports');
        if (upgrade) return <UpgradeRequired {...upgrade} />;
    }

    const users = await prisma.user.findMany({
        where: tenantBranchWhere,
        select: { id: true, name: true }
    });

    const branches = await prisma.branch.findMany({
        where: tenantWhere,
        select: { id: true, name: true }
    });

    return (
        <div className="glass-card p-6" dir="rtl">
            <h1 className="text-2xl font-bold text-foreground mb-6">📋 سجل النشاطات</h1>
            <AuditLogClient users={users} branches={branches} />
        </div>
    );
}
