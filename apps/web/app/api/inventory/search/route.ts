export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export async function GET(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const { searchParams } = new URL(req.url);
        const query    = searchParams.get('query')?.trim() ?? '';
        const branchId = searchParams.get('branchId');

        if (query.length < 2) return NextResponse.json([]);

        // Find matching drugs by trade or scientific name
        const drugs = await prisma.globalDrug.findMany({
            where: {
                OR: [
                    { tradeName:     { contains: query, mode: 'insensitive' } },
                    { scientificName: { contains: query, mode: 'insensitive' } },
                ],
            },
            select: { id: true, tradeName: true, scientificName: true, barcode: true },
            take: 10,
        });

        if (drugs.length === 0) return NextResponse.json([]);

        const drugIds = drugs.map((d: any) => d.id);

        // Find inventory records for these drugs within the tenant scope
        const inventoryWhere: any = {
            ...tenantBranchWhere,
            drugId: { in: drugIds },
            ...(branchId ? { branchId } : {}),
        };

        const inventories = await prisma.inventory.findMany({
            where: inventoryWhere,
            select: {
                id: true,
                drugId: true,
                branchId: true,
                price: true,
                batches: {
                    select: { quantity: true },
                    where: { quantity: { gt: 0 } },
                },
            },
        });

        const invMap = new Map<string, any>();
        for (const inv of inventories) {
            const qty = inv.batches.reduce((s: number, b: any) => s + b.quantity, 0);
            if (!invMap.has(inv.drugId) || qty > (invMap.get(inv.drugId).quantity ?? 0)) {
                invMap.set(inv.drugId, { ...inv, quantity: qty });
            }
        }

        const results = drugs
            .filter((d: any) => invMap.has(d.id))
            .map((d: any) => {
                const inv = invMap.get(d.id);
                return {
                    id:             d.id,
                    name:           d.tradeName,
                    tradeName:      d.tradeName,
                    scientificName: d.scientificName ?? '',
                    barcode:        d.barcode ?? '',
                    price:          inv.price,
                    quantity:       inv.quantity,
                };
            });

        return NextResponse.json(results);
    } catch (error: any) {
        console.error('Drug search failed:', error);
        return NextResponse.json({ message: 'Search failed: ' + error.message }, { status: 500 });
    }
}
