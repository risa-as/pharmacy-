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
        const branchId = params.get('branchId');
        const rows = summary.ids.length ? await prisma.inventory.findMany({
            where: { AND: [tenant.tenantBranchWhere, branchId ? { branchId } : {}, { id: { in: summary.ids } }] },
            include: {
                drug: { select: { barcode: true, tradeName: true, scientificName: true } },
                batches: { select: { quantity: true, expiryDate: true } },
            },
        }) : [];
        const mapped = new Map(rows.map(item => [item.id, {
            id: item.id, drugId: item.drugId, barcode: item.drug.barcode,
            drugName: item.drug.tradeName, tradeName: item.drug.tradeName,
            scientificName: item.drug.scientificName ?? '',
            quantity: item.batches.reduce((sum, b) => sum + b.quantity, 0),
            expiryDate: item.batches.filter(b => b.quantity > 0)
                .reduce<Date | null>((earliest, b) => !earliest || b.expiryDate < earliest ? b.expiryDate : earliest, null),
            price: item.price, reorderLevel: item.minStock, branchId: item.branchId,
            isQuickSale: item.isQuickSale,
        }]));
        return NextResponse.json({
            items: summary.ids.flatMap(id => mapped.has(id) ? [mapped.get(id)] : []),
            page, hasMore: page * MOBILE_INVENTORY_PAGE_SIZE < summary.total,
            total: summary.total, totalValue: summary.totalValue, counts: summary.counts,
        });
    } catch (error) {
        console.error('Inventory page error:', error);
        return NextResponse.json({ message: 'Error fetching inventory' }, { status: 500 });
    }
}
