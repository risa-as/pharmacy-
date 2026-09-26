/**
 * Local stock from a cloud snapshot, without losing or double-counting what the
 * device did that the snapshot does not include yet.
 *
 *   local batch quantity = cloud quantity − pending local deductions + pending local restocks
 *
 * "Pending" means not included in the cloud quantity: unsynced sales/returns, and
 * sales the cloud rejected that are still under review on this device (their goods
 * left the shelf), minus every operation the server reported as applied in the
 * same snapshot (a sale saved there whose response was lost is applied: deducting
 * it again would take the stock twice).
 *
 * When the server cannot say what it applied (an older server), a batch touched by
 * a pending operation keeps the previous rule — the lower of local and cloud —
 * and every other batch takes the cloud quantity, so cloud increases still arrive.
 */

export type Allocation = { batchId: string; quantity: number };

export function parseAllocations(json: string | null | undefined): Allocation[] | null {
    if (!json) return null;
    try {
        const rows = JSON.parse(json);
        if (!Array.isArray(rows)) return null;
        const out: Allocation[] = [];
        for (const row of rows) {
            const quantity = Number(row?.quantity);
            if (typeof row?.batchId !== 'string' || !Number.isFinite(quantity) || quantity < 0) return null;
            out.push({ batchId: row.batchId, quantity });
        }
        return out;
    } catch { return null; }
}

export type PendingLine = {
    drugId: string;
    /** -1 for a deduction (sale), +1 for a restock (return). */
    sign: 1 | -1;
    quantity: number;
    batchAllocations: string | null;
};

export type PendingBatch = { out: number; in: number };

export type PendingStock = {
    /** Pending deductions (out) and restocks (in), per drug then per batch id. */
    byDrug: Map<string, Map<string, PendingBatch>>;
    /** Drugs with a pending line whose batches are unknown (legacy rows). */
    unallocatedDrugs: Set<string>;
};

export function pendingStock(lines: PendingLine[]): PendingStock {
    const byDrug = new Map<string, Map<string, PendingBatch>>();
    const unallocatedDrugs = new Set<string>();
    for (const line of lines) {
        const allocations = parseAllocations(line.batchAllocations);
        if (!allocations || allocations.length === 0) {
            if (line.quantity > 0) unallocatedDrugs.add(line.drugId);
            continue;
        }
        const batches = byDrug.get(line.drugId) ?? new Map<string, PendingBatch>();
        byDrug.set(line.drugId, batches);
        for (const a of allocations) {
            const entry = batches.get(a.batchId) ?? { out: 0, in: 0 };
            if (line.sign < 0) entry.out += a.quantity; else entry.in += a.quantity;
            batches.set(a.batchId, entry);
        }
    }
    return { byDrug, unallocatedDrugs };
}

export function reconcileBatchQuantity(input: {
    cloudQuantity: number;
    /** Local quantity, when the batch already exists on the device. */
    localQuantity?: number;
    /** Net pending change for this batch (0 when none). */
    pendingDelta: number;
    /** True when the server reported which pending operations it applied. */
    appliedKnown: boolean;
    /** True when the drug has a pending line without batch allocations. */
    drugUnallocated: boolean;
}): number {
    const cloud = Math.max(0, Math.round(input.cloudQuantity));
    const touched = input.pendingDelta !== 0 || input.drugUnallocated;
    if (!touched) return cloud;
    // Without batch detail, or without knowing what the server applied, the only
    // safe choice is the previous one: never raise a batch past its local value.
    if (input.drugUnallocated || !input.appliedKnown) {
        return input.localQuantity === undefined ? cloud : Math.min(input.localQuantity, cloud);
    }
    return Math.max(0, cloud + input.pendingDelta);
}

/** Batch number of the local batch holding cloud stock that has no batch detail. */
export const SYNTHETIC_BATCH_NUMBER = 'SYNCED';

export type PlanBatch = { id: string; quantity: number; expiryDate: Date | string | null | undefined; batchNumber?: string };

export type StockPlan =
    | { hold: true }
    | {
        hold: false;
        /** Final quantity of every cloud batch. */
        quantities: Map<string, number>;
        /** The synthetic batch to keep (id) or create (id null), or none. */
        synthetic: { id: string | null; quantity: number } | null;
        /** The drug total: the sum of the batches above, nothing else. */
        total: number;
        /** Pending restocks not added: their batch no longer exists, or has expired
         *  (the server quarantines a return to an expired batch). */
        unmatchedRestock: number;
    };

const expiryTime = (value: PlanBatch['expiryDate']) => {
    const time = value ? new Date(value).getTime() : NaN;
    return Number.isNaN(time) ? 0 : time;
};

/**
 * One drug's local batches from the cloud snapshot and the pending operations.
 *
 * - Each cloud batch: reconcileBatchQuantity (cloud ± pending on that batch).
 * - The synthetic batch holds only cloud stock that has no batch detail (the cloud
 *   batches sum to zero while the cloud total is positive). An existing one keeps
 *   its id, so pending sales recorded on it keep matching it.
 * - A pending operation on a batch that is neither (replaced or removed in the
 *   cloud) keeps its recorded batch. A sale's quantity is held back from the
 *   remaining batches, sellable ones first by expiry, as a reservation only; the
 *   sale's own batch record is not changed. A restock is not moved to another
 *   batch (different expiry, cost and number) and is not made sellable.
 * - A pending restock into an expired cloud batch is not added either: the server
 *   quarantines such a return (restoreSaleReturnStock), it does not restock it.
 * - Hold (leave the drug's local stock as it is) when such a reservation cannot be
 *   computed from cloud values: the server did not say what it applied, or the drug
 *   has pending lines without batch detail (their batches keep the local value,
 *   which already includes the previous reservation).
 * - The total is the sum of the final batches.
 */
export function planDrugStock(input: {
    drugId: string;
    cloudStock: number;
    cloudBatches: PlanBatch[];
    /** This inventory's local batches. */
    localBatches: PlanBatch[];
    /** Local quantity of a batch id wherever it is on the device. */
    localQuantity: (batchId: string) => number | undefined;
    pending: PendingStock;
    appliedKnown: boolean;
    now?: Date;
}): StockPlan {
    const drugUnallocated = input.pending.unallocatedDrugs.has(input.drugId);
    const drugPending = input.pending.byDrug.get(input.drugId) ?? new Map<string, PendingBatch>();
    const now = (input.now ?? new Date()).getTime();
    const expiredCloudIds = new Set(input.cloudBatches.filter(b => expiryTime(b.expiryDate) <= now).map(b => b.id));
    const delta = (id: string) => {
        const p = drugPending.get(id);
        return p ? (expiredCloudIds.has(id) ? 0 : p.in) - p.out : 0;
    };
    const cloudIds = new Set(input.cloudBatches.map(b => b.id));

    const cloudSum = input.cloudBatches.reduce((sum, b) => sum + Math.max(0, Math.round(Number(b.quantity) || 0)), 0);
    const uncovered = cloudSum === 0 ? Math.max(0, Math.round(Number(input.cloudStock) || 0)) : 0;
    const localSynthetics = input.localBatches.filter(b => b.batchNumber === SYNTHETIC_BATCH_NUMBER && !cloudIds.has(b.id));
    const keptSynthetic = uncovered > 0
        ? localSynthetics.find(b => drugPending.has(b.id)) ?? localSynthetics[0] ?? null
        : null;

    const known = new Set(cloudIds);
    if (keptSynthetic) known.add(keptSynthetic.id);
    let reserve = 0;
    let unmatchedRestock = 0;
    for (const [batchId, p] of drugPending) {
        if (known.has(batchId)) continue;
        reserve += p.out;
        unmatchedRestock += p.in;
    }
    if ((!input.appliedKnown && (reserve > 0 || unmatchedRestock > 0)) || (drugUnallocated && reserve > 0)) return { hold: true };
    for (const id of expiredCloudIds) unmatchedRestock += drugPending.get(id)?.in ?? 0;

    const reconcile = (id: string, cloudQuantity: number, localQuantity: number | undefined) => reconcileBatchQuantity({
        cloudQuantity, localQuantity, pendingDelta: delta(id), appliedKnown: input.appliedKnown, drugUnallocated,
    });
    const quantities = new Map<string, number>();
    for (const b of input.cloudBatches) quantities.set(b.id, reconcile(b.id, Number(b.quantity) || 0, input.localQuantity(b.id)));
    const synthetic = keptSynthetic
        ? { id: keptSynthetic.id, quantity: reconcile(keptSynthetic.id, uncovered, keptSynthetic.quantity) }
        : uncovered > 0 ? { id: null, quantity: uncovered } : null;

    if (reserve > 0) {
        const pool = [
            ...input.cloudBatches.map(b => ({ key: b.id, expiry: expiryTime(b.expiryDate) })),
            ...(synthetic ? [{ key: null as string | null, expiry: new Date('2099-12-31').getTime() }] : []),
        ].sort((a, b) => Number(a.expiry <= now) - Number(b.expiry <= now) || a.expiry - b.expiry || String(a.key).localeCompare(String(b.key)));
        for (const entry of pool) {
            if (reserve <= 0) break;
            const current = entry.key === null ? synthetic!.quantity : quantities.get(entry.key)!;
            const take = Math.min(current, reserve);
            if (entry.key === null) synthetic!.quantity -= take; else quantities.set(entry.key, current - take);
            reserve -= take;
        }
    }

    const total = [...quantities.values()].reduce((a, b) => a + b, 0) + (synthetic?.quantity ?? 0);
    return { hold: false, quantities, synthetic, total, unmatchedRestock };
}
