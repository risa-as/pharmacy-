export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { validateSyncUser, isBranchInSyncScope, hasSyncPermission } from '@/app/lib/sync-auth';

// GET /api/inventory/quick-sale?branchId=X
// Returns the branch's quick-sale drugs, sorted by total units sold (desc)
export async function GET(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (!tenantCtx.userPermissions.canViewInventory) return NextResponse.json({error:'غير مصرح'},{status:403});
        const { tenantBranchWhere } = tenantCtx;

        const url = new URL(req.url);
        const branchId = url.searchParams.get('branchId');

        // Quick-sale flags live on each branch's inventory (N09), so one
        // organisation's choice never shows up in another's list. Both queries are
        // intersected with the tenant scope: a client branchId narrows it, never
        // replaces it.
        const scope = { AND: [tenantBranchWhere, ...(branchId ? [{ branchId }] : [])] };
        const inventories = await prisma.inventory.findMany({
            where: { AND: [scope, { isQuickSale: true, drug: { isActive: true } }] },
            include: {
                drug: { select: { id: true, tradeName: true, barcode: true } },
                batches: { where: { quantity: { gt: 0 } }, orderBy: { expiryDate: 'asc' } },
            },
        });
        const drugIds = Array.from(new Set(inventories.map(inv => inv.drugId)));
        const sold = drugIds.length ? await prisma.saleItem.groupBy({
            by: ['drugId'],
            where: { drugId: { in: drugIds }, sale: scope },
            _sum: { quantity: true },
        }) : [];
        const soldByDrug = new Map(sold.map(row => [row.drugId, row._sum.quantity ?? 0]));

        // One entry per drug, as before (the first inventory in scope gives the price).
        const byDrug = new Map<string, typeof inventories>();
        for (const inv of inventories) byDrug.set(inv.drugId, [...(byDrug.get(inv.drugId) ?? []), inv]);
        const result = Array.from(byDrug.values())
            .map((invs) => ({
                id: invs[0].drug.id,
                name: invs[0].drug.tradeName,
                barcode: invs[0].drug.barcode,
                price: invs[0].price ?? 0,
                stock: invs.reduce((s, inv) => s + inv.batches.reduce((n, b) => n + b.quantity, 0), 0),
                totalSold: soldByDrug.get(invs[0].drugId) ?? 0,
            }))
            .sort((a, b) => b.totalSold - a.totalSold);

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Quick-sale list error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

// PATCH /api/inventory/quick-sale
// Toggle the quick-sale flag of one branch's inventory row — accepts both web
// session and desktop sync-token auth
export async function PATCH(req: Request) {
    try {
        const syncUser = await validateSyncUser(req);
        if (syncUser instanceof NextResponse) return syncUser;

        if (!hasSyncPermission(syncUser, 'canEditDrug')) {
            return NextResponse.json({ message: 'ليس لديك صلاحية لتعديل المخزون.' }, { status: 403 });
        }

        const { drugId, inventoryId, branchId, isQuickSale } = await req.json();

        if ((!drugId && !inventoryId) || typeof isQuickSale !== 'boolean') {
            return NextResponse.json(
                { message: 'drugId or inventoryId, and isQuickSale (boolean) are required' },
                { status: 400 }
            );
        }

        // The flag is set on inventory rows of branches the caller may act on:
        // the named inventory, or the drug's inventory in the named branch or the
        // caller's own branch. It never touches the drug shared by every
        // organisation (N09).
        const targetBranchId: string | undefined = inventoryId ? undefined : (branchId ?? syncUser.branchId);
        const target = inventoryId
            ? await prisma.inventory.findUnique({ where: { id: inventoryId }, select: { id: true, branchId: true } })
            : targetBranchId
                ? await prisma.inventory.findFirst({ where: { drugId, branchId: targetBranchId }, select: { id: true, branchId: true } })
                : null;
        if (!target) {
            return NextResponse.json({ message: 'Inventory not found' }, { status: 404 });
        }
        if (!(await isBranchInSyncScope(syncUser, target.branchId))) {
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        const inventory = await prisma.inventory.update({
            where: { id: target.id },
            data: { isQuickSale },
            select: { id: true, drugId: true, branchId: true, isQuickSale: true },
        });

        return NextResponse.json({ success: true, inventory, drug: { id: inventory.drugId, isQuickSale: inventory.isQuickSale } });
    } catch (error: any) {
        console.error('Quick-sale toggle error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
