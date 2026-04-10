export const dynamic = 'force-dynamic';


import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export async function GET(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const url = new URL(req.url);
        const filterDrugId = url.searchParams.get('drugId');
        const filterBranchId = url.searchParams.get('branchId');

        // Validate filterBranchId is within the tenant's scope
        if (filterBranchId && tenantCtx.user.role !== 'SUPER_ADMIN') {
            const branch = await prisma.branch.findUnique({
                where: { id: filterBranchId },
                select: { organizationId: true },
            });
            if (!branch || branch.organizationId !== tenantCtx.user.organizationId) {
                return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
            }
        }

        const where = {
            ...tenantBranchWhere,
            ...(filterDrugId ? { drugId: filterDrugId } : {}),
            ...(filterBranchId ? { branchId: filterBranchId } : {}),
        };

        const inventory = await prisma.inventory.findMany({
            where,
            include: {
                batches: true,
            }
        });

        // Fetch only drugs referenced in this inventory result (avoids full-table scan)
        const drugIds = [...new Set(inventory.map((item: any) => item.drugId))];
        const drugs = drugIds.length > 0
            ? await prisma.globalDrug.findMany({ where: { id: { in: drugIds } } })
            : [];
        const drugMap = new Map<string, any>(drugs.map((d: any) => [d.id, d]));

        const mappedInventory = inventory.map((item: any) => {
            const drug = drugMap.get(item.drugId);
            const totalQuantity = item.batches.reduce((sum: number, batch: any) => sum + batch.quantity, 0);

            return {
                id: item.id,
                drugId: item.drugId,
                barcode: drug ? drug.barcode : '',
                drugName: drug ? drug.tradeName : 'Unknown Drug',
                quantity: totalQuantity,
                price: item.price,
                publicPrice: drug ? (drug as any).publicPrice || item.price : item.price,
                reorderLevel: item.minStock,
                branchId: item.branchId,
                isQuickSale: drug ? (drug.isQuickSale ?? false) : false,
            };
        });

        return NextResponse.json(mappedInventory);
    } catch (error) {
        console.error('API Inventory Error:', error);
        return NextResponse.json(
            { message: 'Error fetching inventory' },
            { status: 500 }
        );
    }
}
