/**
 * A supplier payment whose outcome is not known yet (sent, no answer received).
 * Kept in the browser per supplier, so closing the form or reloading the page
 * reopens the same attempt with the same request id: the server then reports
 * whether it was recorded, and a resend can never pay twice. Cleared once the
 * outcome is known. Storage failures are ignored (private mode, blocked site
 * data): the payment itself never depends on this record.
 */
export type PendingPaymentValues = {
    amount: string;
    method: string;
    branchId: string;
    safeId: string;
    reference: string;
    notes: string;
    date: string;
};
export type PendingPayment = { requestId: string; values: PendingPaymentValues };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const keyFor = (supplierId: string) => `faramace:pending-supplier-payment:${supplierId}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function savePendingPayment(storage: StorageLike | undefined, supplierId: string, pending: PendingPayment) {
    try { storage?.setItem(keyFor(supplierId), JSON.stringify(pending)); } catch { /* storage unavailable */ }
}

export function loadPendingPayment(storage: StorageLike | undefined, supplierId: string): PendingPayment | null {
    try {
        const raw = storage?.getItem(keyFor(supplierId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.requestId !== 'string' || !UUID.test(parsed.requestId) || !parsed.values || typeof parsed.values !== 'object') return null;
        const v = parsed.values;
        const text = (x: unknown) => (typeof x === 'string' ? x : '');
        return {
            requestId: parsed.requestId,
            values: { amount: text(v.amount), method: text(v.method) || 'CASH', branchId: text(v.branchId), safeId: text(v.safeId),
                reference: text(v.reference), notes: text(v.notes), date: text(v.date) },
        };
    } catch {
        return null;
    }
}

export function clearPendingPayment(storage: StorageLike | undefined, supplierId: string) {
    try { storage?.removeItem(keyFor(supplierId)); } catch { /* storage unavailable */ }
}
