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

        const where = {
            ...tenantBranchWhere,
            ...(filterDrugId ? { drugId: filterDrugId } : {}),
            ...(filterBranchId ? { branchId: filterBranchId } : {}),
        };

        const inventory = await prisma.inventory.findMany({
            where,
            include: {
                batches: true,
                // No direct relation to GlobalDrug in schema (drugId is just string)
            }
        });

        // Fetch all drugs to map names
        const drugs = await prisma.globalDrug.findMany();
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
