export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { validateSyncUser } from '@/app/lib/sync-auth';

export async function GET(req: Request) {
    try {
        const syncUser = await validateSyncUser(req);
        if (syncUser instanceof NextResponse) return syncUser;

        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId');

        if (!branchId) {
            return NextResponse.json({ message: 'branchId is required' }, { status: 400 });
        }

        // Validate branchId ownership
        const userRole = syncUser.role;
        const userBranchId = syncUser.branchId;
        const userOrgId = syncUser.organizationId;
        if (userRole !== 'SUPER_ADMIN') {
            const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { organizationId: true } });
            if (!branch) return NextResponse.json({ message: 'Branch not found' }, { status: 404 });
            if (userRole === 'ADMIN') {
                if (branch.organizationId !== userOrgId) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
            } else {
                if (branchId !== userBranchId) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
            }
        }

        const inventories = await prisma.inventory.findMany({
            where: { branchId },
            include: {
                drug: true,
                batches: true,
            },
        });

        const drugs = inventories
            .filter((inv: any) => inv.drug?.isActive)
            .map((inv: any) => {
                const totalStock = inv.batches.reduce((sum: any, batch: any) => sum + batch.quantity, 0);
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
                    isQuickSale: inv.drug.isQuickSale ?? false,
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
                inventoryIds: inventories.map((inv: any) => inv.id),
                drugIds: drugs.map((d: any) => d.id),
            },
        });
    } catch (error) {
        console.error('[SyncAPI] /sync/products failed:', error);
        return NextResponse.json({ message: 'Sync error' }, { status: 500 });
    }
}
