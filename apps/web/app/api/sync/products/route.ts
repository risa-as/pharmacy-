export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/app/lib/prisma';
import { validateSyncUser } from '@/app/lib/sync-auth';
import { productSnapshotResponse } from '@/app/lib/product-snapshot-response';

/** Pending ids a desktop may ask about in one snapshot; beyond it, it falls back. */
const MAX_PENDING_IDS = 2000;

type Db = Pick<Prisma.TransactionClient, 'inventory'>;

/** Branch scope for an authenticated sync user; null when allowed. */
async function branchDenied(syncUser: { role: string; branchId?: string; organizationId?: string }, branchId: string | null) {
    if (!branchId) return NextResponse.json({ message: 'branchId is required' }, { status: 400 });

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
    return null;
}

async function buildSnapshot(db: Db, branchId: string) {
    const inventories = await db.inventory.findMany({
        where: { branchId },
        orderBy: { id: 'asc' },
        include: {
            drug: true,
            batches: { orderBy: { id: 'asc' } },
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
                isQuickSale: inv.isQuickSale ?? false,
                // ميزة وحدة التسعير: يُرسلان ليعرف سطح المكتب — وهو يعمل
                // أوفلاين — أُعُدّت أشرطة الدواء أم لا، فيعرض الإشارة الصحيحة
                // بدل افتراض حالة لا يعرفها. null صريح لا حذف للحقل.
                unitsPerPack: inv.drug.unitsPerPack ?? null,
                unitsPerPackConfirmedAt: inv.drug.unitsPerPackConfirmedAt
                    ? inv.drug.unitsPerPackConfirmedAt.toISOString()
                    : null,
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

    return {
        drugs,
        meta: {
            branchId,
            inventoryIds: inventories.map((inv: any) => inv.id),
            drugIds: drugs.map((d: any) => d.id),
        },
    };
}

export async function GET(req: Request) {
    try {
        const syncUser = await validateSyncUser(req);
        if (syncUser instanceof NextResponse) return syncUser;
        const branchId = new URL(req.url).searchParams.get('branchId');
        const denied = await branchDenied(syncUser, branchId);
        if (denied) return denied;
        return productSnapshotResponse(req, await buildSnapshot(prisma, branchId!));
    } catch (error) {
        console.error('[SyncAPI] /sync/products failed:', error);
        return NextResponse.json({ message: 'Sync error' }, { status: 500 });
    }
}

const PendingInput = z.object({
    branchId: z.string().min(1),
    pendingSaleIds: z.array(z.string().min(1).max(100)).max(MAX_PENDING_IDS).default([]),
    pendingReturnIds: z.array(z.string().min(1).max(100)).max(MAX_PENDING_IDS).default([]),
});

/**
 * The stock snapshot together with which of the device's pending operations this
 * branch has already applied, read in ONE repeatable-read transaction: the
 * quantities and the applied ids describe the same moment, so the desktop can
 * add back exactly the pending operations the quantities do not include yet
 * (a sale saved here whose response was lost is "applied", never deducted twice).
 * Ids are looked up within the branch only. Never cached: it depends on the ids.
 */
export async function POST(req: Request) {
    try {
        // Authenticate first: a signed device request is verified over its body.
        const syncUser = await validateSyncUser(req);
        if (syncUser instanceof NextResponse) return syncUser;
        const parsed = PendingInput.safeParse(await req.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ message: 'Invalid pending operations' }, { status: 400 });
        const { branchId, pendingSaleIds, pendingReturnIds } = parsed.data;
        const denied = await branchDenied(syncUser, branchId);
        if (denied) return denied;

        const result = await prisma.$transaction(async (tx) => {
            const snapshot = await buildSnapshot(tx, branchId);
            const sales = pendingSaleIds.length
                ? await tx.sale.findMany({ where: { id: { in: pendingSaleIds }, branchId }, select: { id: true } }) : [];
            const returns = pendingReturnIds.length
                ? await tx.saleReturn.findMany({ where: { id: { in: pendingReturnIds }, branchId }, select: { id: true } }) : [];
            return { ...snapshot, applied: { saleIds: sales.map(s => s.id), returnIds: returns.map(r => r.id) } };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000, maxWait: 5000 });

        return NextResponse.json(
            { ...result, meta: { ...result.meta, snapshotAt: new Date().toISOString() } },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        console.error('[SyncAPI] /sync/products (pending) failed:', error);
        return NextResponse.json({ message: 'Sync error' }, { status: 500 });
    }
}
