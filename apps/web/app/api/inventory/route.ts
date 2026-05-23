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
        const filterDrugId   = url.searchParams.get('drugId');
        const filterBranchId = url.searchParams.get('branchId');
        const searchQuery    = url.searchParams.get('search')?.trim() ?? '';
        const isSearch       = searchQuery.length >= 2;

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

        // When searching: find matching drugs first, then filter inventory to those drugs
        let searchDrugIds: string[] | null = null;
        if (isSearch) {
            const matchingDrugs = await prisma.globalDrug.findMany({
                where: {
                    OR: [
                        { tradeName:      { contains: searchQuery, mode: 'insensitive' } },
                        { scientificName: { contains: searchQuery, mode: 'insensitive' } },
                        { barcode:        { contains: searchQuery } },
                    ],
                },
                select: { id: true },
                take: 20,
            });
            searchDrugIds = matchingDrugs.map((d: any) => d.id);
            if (searchDrugIds.length === 0) return NextResponse.json([]);
        }

        const where = {
            ...tenantBranchWhere,
            ...(filterDrugId    ? { drugId: filterDrugId }   : {}),
            ...(filterBranchId  ? { branchId: filterBranchId } : {}),
            ...(searchDrugIds   ? { drugId: { in: searchDrugIds } } : {}),
        };

        const inventory = await prisma.inventory.findMany({
            where,
            include: { batches: true },
            ...(isSearch ? { take: 10 } : {}),
        });

        // Fetch only drugs referenced in this inventory result (avoids full-table scan)
        const drugIds = Array.from(new Set(inventory.map((item: any) => item.drugId)));
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
                // For POS name search: expose these fields
                name:           drug ? drug.tradeName     : 'Unknown Drug',
                tradeName:      drug ? drug.tradeName     : 'Unknown Drug',
                scientificName: drug ? (drug.scientificName ?? '') : '',
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
