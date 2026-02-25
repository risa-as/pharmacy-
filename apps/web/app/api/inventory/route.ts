
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId');

        const whereClause: any = {};
        if (branchId) {
            whereClause.branchId = branchId;
        }

        const inventory = await prisma.inventory.findMany({
            where: whereClause,
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
