export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

// GET /api/inventory/quick-sale?branchId=X
// Returns all isQuickSale=true drugs for the branch, sorted by total units sold (desc)
export async function GET(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const url = new URL(req.url);
        const branchId = url.searchParams.get('branchId');

        // Fetch quick-sale drugs with their inventory for this branch
        const drugs = await prisma.globalDrug.findMany({
            where: { isQuickSale: true, isActive: true },
            include: {
                inventories: {
                    where: {
                        ...tenantBranchWhere,
                        ...(branchId ? { branchId } : {}),
                    },
                    include: {
                        batches: {
                            where: { quantity: { gt: 0 } },
                            orderBy: { expiryDate: 'asc' },
                        },
                    },
                },
                saleItems: {
                    where: branchId
                        ? { sale: { branchId } }
                        : {},
                    select: { quantity: true },
                },
            },
        });

        const result = drugs
            .map((drug) => {
                const inv = drug.inventories[0];
                const stock = inv
                    ? inv.batches.reduce((s: number, b: any) => s + b.quantity, 0)
                    : 0;
                const totalSold = drug.saleItems.reduce((s: number, si: any) => s + si.quantity, 0);
                return {
                    id: drug.id,
                    name: drug.tradeName,
                    barcode: drug.barcode,
                    price: inv?.price ?? 0,
                    stock,
                    totalSold,
                };
            })
            .sort((a, b) => b.totalSold - a.totalSold);

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Quick-sale list error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

// PATCH /api/inventory/quick-sale
// Toggle isQuickSale for a drug
export async function PATCH(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const { drugId, isQuickSale } = await req.json();

        if (!drugId || typeof isQuickSale !== 'boolean') {
            return NextResponse.json(
                { message: 'drugId and isQuickSale (boolean) are required' },
                { status: 400 }
            );
        }

        // Don't let one tenant flip flags on another tenant's custom drug.
        const existing = await prisma.globalDrug.findUnique({
            where: { id: drugId },
            select: { organizationId: true },
        });
        if (!existing) {
            return NextResponse.json({ message: 'Drug not found' }, { status: 404 });
        }
        const isSuper = tenantCtx.user.role === 'SUPER_ADMIN';
        if (existing.organizationId && existing.organizationId !== tenantCtx.organizationId && !isSuper) {
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        const drug = await prisma.globalDrug.update({
            where: { id: drugId },
            data: { isQuickSale },
            select: { id: true, tradeName: true, isQuickSale: true },
        });

        return NextResponse.json({ success: true, drug });
    } catch (error: any) {
        console.error('Quick-sale toggle error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
