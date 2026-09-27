/**
 * Supplier payments whose outcome is not known yet (sent, no answer received).
 * One record per attempt, kept in the browser, so closing the form, reloading
 * the page or a second tab never loses an attempt: reopening resumes it with the
 * same request id, the server reports whether it was recorded, and a resend can
 * never pay twice. A record is removed only when its own outcome is known.
 *
 * Sending is allowed only if the record was saved and read back: without it, a
 * lost answer could not be settled and the payment could be made twice.
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
export type PendingPayment = { requestId: string; savedAt: number; values: PendingPaymentValues };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
const prefix = (supplierId: string) => `faramace:pending-supplier-payment:${supplierId}:`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Saves the attempt and confirms it by reading it back. False: do not send. */
export function savePendingPayment(storage: StorageLike | undefined, supplierId: string, pending: PendingPayment): boolean {
    try {
        if (!storage) return false;
        const key = prefix(supplierId) + pending.requestId;
        const raw = JSON.stringify(pending);
        storage.setItem(key, raw);
        return storage.getItem(key) === raw;
    } catch {
        return false;
    }
}

function parse(raw: string | null, requestId: string): PendingPayment | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.requestId !== requestId || !UUID.test(requestId) || !parsed.values || typeof parsed.values !== 'object') return null;
        const v = parsed.values;
        const text = (x: unknown) => (typeof x === 'string' ? x : '');
        return {
            requestId,
            savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
            values: { amount: text(v.amount), method: text(v.method) || 'CASH', branchId: text(v.branchId), safeId: text(v.safeId),
                reference: text(v.reference), notes: text(v.notes), date: text(v.date) },
        };
    } catch {
        return null;
    }
}

/** Every unsettled attempt for this supplier, oldest first. Corrupt records are ignored. */
export function loadPendingPayments(storage: StorageLike | undefined, supplierId: string): PendingPayment[] {
    try {
        if (!storage) return [];
        const keys: string[] = [];
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key?.startsWith(prefix(supplierId))) keys.push(key);
        }
        return keys
            .map((key) => parse(storage.getItem(key), key.slice(prefix(supplierId).length)))
            .filter((p): p is PendingPayment => p !== null)
            .sort((a, b) => a.savedAt - b.savedAt);
    } catch {
        return [];
    }
}

/** Removes one attempt, once its outcome is known. Other attempts are untouched. */
export function settlePendingPayment(storage: StorageLike | undefined, supplierId: string, requestId: string) {
    try { storage?.removeItem(prefix(supplierId) + requestId); } catch { /* storage unavailable */ }
}

export type AttemptStatus = 'recorded' | 'not_recorded' | 'unknown';

/**
 * When the form opens: recorded attempts are settled; every other attempt stays
 * saved, and the oldest of them is resumed with its own id. "Not recorded" is not
 * final (a request may still be completing), and "unknown" cannot be verified, so
 * neither is dropped and no new id is started while one of them remains.
 */
export function decideOnOpen(checked: { attempt: PendingPayment; status: AttemptStatus }[]) {
    const settle = checked.filter((c) => c.status === 'recorded').map((c) => c.attempt.requestId);
    const open = checked.filter((c) => c.status !== 'recorded');
    return { settle, recorded: settle.length, resume: open[0]?.attempt ?? null, unverified: open.filter((c) => c.status === 'unknown').length };
}

/**
 * After the server refused a send: only "recorded" settles the attempt (the
 * payment exists: show a final result, never a ready-to-send form). Otherwise the
 * same id is kept, so a resend, or an earlier request finishing late, can never
 * produce a second payment.
 */
export function decideAfterRefusal(status: AttemptStatus): 'finished' | 'keep' {
    return status === 'recorded' ? 'finished' : 'keep';
}
