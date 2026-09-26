import { prisma } from './db';
import store from './store';
import { pendingStock, PendingLine, PendingStock } from './stock-reconcile';

export type PendingStockIds = {
    saleIds: string[];
    returnIds: string[];
    /** Inventories with a local add queued for upload: the cloud does not know them yet. */
    protectedInventoryIds: Set<string>;
};

/** Operations this device holds that a cloud snapshot may not include yet. */
async function pendingIds(db: any) {
    const [sales, returns, failures] = await Promise.all([
        db.sale.findMany({ where: { synced: false }, select: { id: true } }),
        db.saleReturn.findMany({ where: { synced: false }, select: { id: true } }),
        // Rejected by the cloud and still under review here: the goods left the
        // shelf, so the deduction stays until the review resolves (deletes) it.
        db.syncFailure.findMany({ where: { entityType: { in: ['SALE', 'SALE_RETURN'] } }, select: { entityType: true, entityId: true } }),
    ]);
    return {
        saleIds: [...new Set([...sales.map((s: any) => s.id), ...failures.filter((f: any) => f.entityType === 'SALE').map((f: any) => f.entityId)])] as string[],
        returnIds: [...new Set([...returns.map((r: any) => r.id), ...failures.filter((f: any) => f.entityType === 'SALE_RETURN').map((f: any) => f.entityId)])] as string[],
    };
}

/** Inventories with a local add still queued for upload (the cloud has not seen them). */
export function queuedInventoryIds(): Set<string> {
    const ids = new Set<string>();
    const queued = store.get('pendingSyncActions');
    for (const action of Array.isArray(queued) ? queued : []) {
        const payload = (action as any)?.payload ?? {};
        if ((action as any)?.type === 'add-batch' && typeof payload.inventoryId === 'string') ids.add(payload.inventoryId);
        if ((action as any)?.type === 'add-inventory' && typeof payload.id === 'string') ids.add(payload.id);
    }
    return ids;
}

/** Read before asking the cloud, so the server can say which of these it applied. */
export async function readPendingStockIds(): Promise<PendingStockIds> {
    return { ...await pendingIds(prisma), protectedInventoryIds: queuedInventoryIds() };
}

/**
 * Pending stock read INSIDE the apply transaction, so a sale saved on this device
 * after the snapshot request is included (SQLite serializes it with this
 * transaction). Pending = what was pending when the snapshot was requested (an
 * acknowledgement may have landed since) plus what is pending now, minus what the
 * server applied in that snapshot. `applied` null: the server could not say.
 */
export async function pendingStockInTx(
    tx: any, before: PendingStockIds, applied: { saleIds: string[]; returnIds: string[] } | null,
): Promise<PendingStock> {
    const now = await pendingIds(tx);
    const appliedSales = new Set(applied?.saleIds ?? []);
    const appliedReturns = new Set(applied?.returnIds ?? []);
    const saleIds = [...new Set([...before.saleIds, ...now.saleIds])].filter(id => !appliedSales.has(id));
    const returnIds = [...new Set([...before.returnIds, ...now.returnIds])].filter(id => !appliedReturns.has(id));
    const lines: PendingLine[] = [];
    for (let i = 0; i < saleIds.length; i += 500) {
        const items = await tx.saleItem.findMany({ where: { saleId: { in: saleIds.slice(i, i + 500) } },
            select: { drugId: true, quantity: true, batchAllocations: true } });
        for (const item of items) lines.push({ drugId: item.drugId, sign: -1, quantity: item.quantity, batchAllocations: item.batchAllocations });
    }
    for (let i = 0; i < returnIds.length; i += 500) {
        const items = await tx.saleReturnItem.findMany({ where: { saleReturnId: { in: returnIds.slice(i, i + 500) }, stockStatus: 'RESTOCKED' },
            select: { drugId: true, quantity: true, batchAllocations: true } });
        for (const item of items) lines.push({ drugId: item.drugId, sign: 1, quantity: item.quantity, batchAllocations: item.batchAllocations });
    }
    return pendingStock(lines);
}
