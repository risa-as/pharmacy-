export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

function getIraqDayStart(): Date {
    const iraqOffset = 3 * 60 * 60 * 1000;
    const nowInIraq  = new Date(Date.now() + iraqOffset);
    return new Date(Date.UTC(
        nowInIraq.getUTCFullYear(),
        nowInIraq.getUTCMonth(),
        nowInIraq.getUTCDate(),
        0, 0, 0, 0
    ) - iraqOffset);
}

export async function GET() {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const { organizationId } = tenantCtx;
        const branchId = tenantCtx.user.branchId;

        if (!organizationId || !branchId) {
            return NextResponse.json({ limit: 20, used: 0, remaining: 20 });
        }

        const dayStart = getIraqDayStart();
        const [org, used] = await Promise.all([
            prisma.organization.findUnique({
                where: { id: organizationId },
                select: { prescriptionScanDailyLimit: true },
            }),
            prisma.prescriptionScanLog.count({
                where: { branchId, createdAt: { gte: dayStart } },
            }),
        ]);

        const limit     = org?.prescriptionScanDailyLimit ?? 20;
        const remaining = Math.max(0, limit - used);

        return NextResponse.json({ limit, used, remaining });
    } catch (error) {
        console.error('Scan usage error:', error);
        return NextResponse.json({ limit: 20, used: 0, remaining: 20 });
    }
}
