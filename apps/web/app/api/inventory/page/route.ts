import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { buildMobileInventoryQuery, MOBILE_INVENTORY_PAGE_SIZE, type MobileInventorySummary } from '@/app/lib/mobile-inventory-query';
import { normalizeInventoryDashboardPage } from '@/app/lib/inventory-dashboard-query';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const tenant = await getTenantContext();
        if (tenant instanceof NextResponse) return tenant;
        if (!tenant.userPermissions.canViewInventory) return NextResponse.json({ error: 'ليس لديك صلاحية لهذا الإجراء.' }, { status: 403 });
        const params = new URL(req.url).searchParams;
        const page = normalizeInventoryDashboardPage(params.get('page'));
        const [summary] = await prisma.$queryRaw<MobileInventorySummary[]>(buildMobileInventoryQuery(params, tenant.tenantBranchWhere));
        return NextResponse.json({
            // Rows and totals are from the same scoped database snapshot.
            items: summary.items,
            page, hasMore: page * MOBILE_INVENTORY_PAGE_SIZE < summary.total,
            total: summary.total, totalValue: summary.totalValue, counts: summary.counts,
        });
    } catch (error) {
        console.error('Inventory page error:', error);
        return NextResponse.json({ message: 'Error fetching inventory' }, { status: 500 });
    }
}
