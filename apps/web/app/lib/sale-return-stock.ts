import type { Prisma } from '@prisma/client';
export type BatchAllocation = { batchId: string; quantity: number };
export function readAllocations(raw?: string | null): BatchAllocation[] {
    try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) && a.every(x => typeof x.batchId === 'string' && Number.isInteger(x.quantity) && x.quantity > 0) ? a : []; }
    catch { return []; }
}
/** Original deductions, never a guessed batch or manufactured expiry date.
 * Unknown or expired lots stay physically segregated until a manager reviews them. */
export async function restoreSaleReturnStock(tx: Prisma.TransactionClient, branchId: string,
    sold: { drugId: string; quantity: number; batchAllocations?: string | null }[],
    prior: { items: { drugId: string; quantity: number }[] }[],
    requested: { drugId: string; quantity: number; price: number }[]) {
    const result = [];
    for (const item of requested) {
        const lines = sold.filter(l => l.drugId === item.drugId);
        const allocations = lines.flatMap(l => readAllocations(l.batchAllocations));
        let skip = prior.flatMap(r => r.items).filter(i => i.drugId === item.drugId).reduce((s, i) => s + i.quantity, 0);
        let remaining = item.quantity;
        const selected: BatchAllocation[] = [];
        for (const a of allocations) {
            const ignored = Math.min(skip, a.quantity); skip -= ignored;
            const take = Math.min(remaining, a.quantity - ignored);
            if (take > 0) { selected.push({ batchId: a.batchId, quantity: take }); remaining -= take; }
        }
        const complete = allocations.reduce((s, a) => s + a.quantity, 0) === lines.reduce((s, l) => s + l.quantity, 0) && remaining === 0;
        const batches = complete ? await tx.batch.findMany({ where: { id: { in: selected.map(a => a.batchId) }, inventory: { branchId, drugId: item.drugId }, expiryDate: { gt: new Date() } }, select: { id: true } }) : [];
        const verified = complete && selected.every(a => batches.some(b => b.id === a.batchId));
        if (verified) for (const a of selected) await tx.batch.update({ where: { id: a.batchId }, data: { quantity: { increment: a.quantity } } });
        result.push({ ...item, batchAllocations: verified ? JSON.stringify(selected) : null, stockStatus: verified ? 'RESTOCKED' : 'QUARANTINED' });
    }
    return result;
}
