import { describe, expect, it } from 'vitest';
import { loadPendingPayments, savePendingPayment, settlePendingPayment } from '../pending-payment';

/** A browser-like Storage shared by the tabs of one site. */
function memoryStorage() {
    const data = new Map<string, string>();
    return {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => { data.set(k, v); },
        removeItem: (k: string) => { data.delete(k); },
        key: (i: number) => [...data.keys()][i] ?? null,
        get length() { return data.size; },
        data,
    };
}
const values = { amount: '40', method: 'CASH', branchId: 'b1', safeId: 's1', reference: '', notes: '', date: '2026-09-27' };
const id1 = '3f1c2b1e-5a4d-4c3b-9a8f-1e2d3c4b5a69';
const id2 = '7a2b3c4d-1e2f-4a5b-8c9d-0e1f2a3b4c5d';

describe('pending supplier payments', () => {
    it('survives closing the form: the attempt comes back for that supplier only', () => {
        const storage = memoryStorage();
        expect(savePendingPayment(storage, 'supplier-1', { requestId: id1, savedAt: 1, values })).toBe(true);
        expect(loadPendingPayments(storage, 'supplier-1')).toEqual([{ requestId: id1, savedAt: 1, values }]);
        expect(loadPendingPayments(storage, 'supplier-2')).toEqual([]);
    });

    it('keeps two tabs\' attempts apart: settling one never removes or replaces the other', () => {
        const storage = memoryStorage();
        savePendingPayment(storage, 's', { requestId: id1, savedAt: 1, values }); // tab A
        savePendingPayment(storage, 's', { requestId: id2, savedAt: 2, values: { ...values, amount: '70' } }); // tab B
        expect(loadPendingPayments(storage, 's').map((p) => p.requestId)).toEqual([id1, id2]);
        settlePendingPayment(storage, 's', id1); // tab A's payment succeeded
        expect(loadPendingPayments(storage, 's')).toEqual([{ requestId: id2, savedAt: 2, values: { ...values, amount: '70' } }]);
    });

    it('reports a save that did not stick, so the form refuses to send', () => {
        const dropped = { ...memoryStorage(), setItem: () => { /* silently discarded */ } };
        expect(savePendingPayment(dropped, 's', { requestId: id1, savedAt: 1, values })).toBe(false);
        const throwing = { ...memoryStorage(), setItem: () => { throw Error('quota exceeded'); } };
        expect(savePendingPayment(throwing, 's', { requestId: id1, savedAt: 1, values })).toBe(false);
        expect(savePendingPayment(undefined, 's', { requestId: id1, savedAt: 1, values })).toBe(false);
    });

    it('ignores a corrupt or forged record instead of reusing it', () => {
        const storage = memoryStorage();
        const key = 'faramace:pending-supplier-payment:s:';
        storage.data.set(key + id1, 'not json');
        storage.data.set(key + id2, JSON.stringify({ requestId: id1, savedAt: 1, values })); // id does not match its key
        storage.data.set(key + 'not-a-uuid', JSON.stringify({ requestId: 'not-a-uuid', savedAt: 1, values }));
        expect(loadPendingPayments(storage, 's')).toEqual([]);
    });

    it('never throws when storage is unavailable', () => {
        const broken = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); }, removeItem: () => { throw Error('blocked'); },
            key: () => { throw Error('blocked'); }, get length(): number { throw Error('blocked'); } };
        expect(loadPendingPayments(broken, 's')).toEqual([]);
        expect(() => settlePendingPayment(broken, 's', id1)).not.toThrow();
    });
});
