export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { checkFeatureAccess } from '@/app/lib/saas-guards';

// GET: List all warehouses
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        // Fail closed: a resolved context with no organizationId (and not
        // SUPER_ADMIN) must not silently bypass the plan-feature check.
        if (!tenantCtx.organizationId && tenantCtx.user.role !== 'SUPER_ADMIN') {
            return NextResponse.json({ error: "Organization not found" }, { status: 403 });
        }

        if (tenantCtx.organizationId) {
            const access = await checkFeatureAccess(tenantCtx.organizationId, 'warehouseManagement');
            if (!access.allowed) {
                return NextResponse.json({
                    error: 'هذه الميزة متاحة في باقة الشركات فقط.',
                    code: 'FEATURE_NOT_IN_PLAN',
                    requiredPlan: 'ENTERPRISE'
                }, { status: 403 });
            }
        }

        const warehouses = await prisma.warehouse.findMany({
            include: { _count: { select: { orders: true } } },
            orderBy: { name: 'asc' }
        });
        return NextResponse.json({ warehouses });
    } catch (e: any) {
        console.error('warehouses GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب قائمة المذاخر' }, { status: 500 });
    }
}
