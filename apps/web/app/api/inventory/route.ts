
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export async function GET(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const inventory = await prisma.inventory.findMany({
            where: tenantBranchWhere,
            include: {
                batches: true,
                // No direct relation to GlobalDrug in schema (drugId is just string)
            }
        });

        // Fetch all drugs to map names
        const drugs = await prisma.globalDrug.findMany();
        const drugMap = new Map(drugs.map(d => [d.id, d]));

        const mappedInventory = inventory.map(item => {
            const drug = drugMap.get(item.drugId);
            const totalQuantity = item.batches.reduce((sum, batch) => sum + batch.quantity, 0);

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
