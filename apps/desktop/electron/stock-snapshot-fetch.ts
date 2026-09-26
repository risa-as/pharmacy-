import type { PendingStockIds } from './stock-pull';

/** Ids per snapshot request; more pending than this falls back to the cached GET. */
export const MAX_PENDING_STOCK_IDS = 2000;

export type StockSnapshot = { snapshot: any; applied: { saleIds: string[]; returnIds: string[] } | null; fromCache: boolean };

/**
 * The stock snapshot. With pending operations, asks the server (POST) which of
 * them it applied, in the same read as the quantities; `applied` is then known.
 * With none pending, an older server (404/405 on POST), a malformed answer, or too
 * many ids, the cached GET is used and `applied` is null (the reconcile keeps the
 * safe rule only for batches those operations touched).
 */
export async function fetchStockSnapshot(deps: {
    post: (body: string) => Promise<{ json(): Promise<any> }>;
    getCached: () => Promise<{ snapshot: any; fromCache: boolean }>;
    /** HTTP status of a client error thrown by `post`, or undefined for other errors. */
    clientErrorStatus: (error: unknown) => number | undefined;
    warn?: (message: string) => void;
}, branchId: string, pending: PendingStockIds): Promise<StockSnapshot> {
    const count = pending.saleIds.length + pending.returnIds.length;
    if (count > 0 && count <= MAX_PENDING_STOCK_IDS) {
        try {
            const snapshot = await (await deps.post(JSON.stringify({ branchId, pendingSaleIds: pending.saleIds, pendingReturnIds: pending.returnIds }))).json();
            if (snapshot?.applied && Array.isArray(snapshot.applied.saleIds) && Array.isArray(snapshot.applied.returnIds))
                return { snapshot, applied: snapshot.applied, fromCache: false };
            deps.warn?.('[Sync] Stock snapshot without applied operations; using the cached snapshot with the safe rule.');
        } catch (error) {
            const status = deps.clientErrorStatus(error);
            if (status !== 404 && status !== 405) throw error;
            deps.warn?.('[Sync] Server has no pending-aware stock snapshot; using the cached snapshot with the safe rule.');
        }
    }
    const cached = await deps.getCached();
    return { snapshot: cached.snapshot, applied: null, fromCache: cached.fromCache };
}
