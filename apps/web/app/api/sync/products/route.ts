export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId');

        if (!branchId) {
            return NextResponse.json({ message: 'branchId is required' }, { status: 400 });
        }

        const inventories = await prisma.inventory.findMany({
            where: { branchId },
            include: {
                drug: true,
                batches: true,
            },
        });

        const drugs = inventories
            .filter((inv) => inv.drug?.isActive)
            .map((inv) => {
                const totalStock = inv.batches.reduce((sum, batch) => sum + batch.quantity, 0);
                return {
                    id: inv.drug.id,
                    inventoryId: inv.id,
                    barcode: inv.drug.barcode,
                    tradeName: inv.drug.tradeName,
                    scientificName: inv.drug.scientificName,
                    price: inv.price || 0,
                    costPrice: inv.cost || 0,
                    minStock: inv.minStock || 0,
                    maxStock: inv.maxStock || 100,
                    stock: totalStock,
                    batches: inv.batches.map((b: any) => ({
                        id: b.id,
                        batchNumber: b.batchNumber,
                        quantity: b.quantity,
                        expiryDate: b.expiryDate.toISOString(),
                        costPrice: b.costPrice
                    }))
                };
            });

        return NextResponse.json({
            drugs,
            meta: {
                branchId,
                snapshotAt: new Date().toISOString(),
                inventoryIds: inventories.map((inv) => inv.id),
                drugIds: drugs.map((d) => d.id),
            },
        });
    } catch (error) {
        console.error('[SyncAPI] /sync/products failed:', error);
        return NextResponse.json({ message: 'Sync error' }, { status: 500 });
    }
}
