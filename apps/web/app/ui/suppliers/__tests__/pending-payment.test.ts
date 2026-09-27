import { describe, expect, it } from 'vitest';
import { clearPendingPayment, loadPendingPayment, savePendingPayment } from '../pending-payment';

function memoryStorage() {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); }, data };
}
const values = { amount: '40', method: 'CASH', branchId: 'b1', safeId: 's1', reference: '', notes: '', date: '2026-09-27' };
const requestId = '3f1c2b1e-5a4d-4c3b-9a8f-1e2d3c4b5a69';

describe('pending supplier payment', () => {
    it('survives closing the form: the same request id and values come back for that supplier only', () => {
        const storage = memoryStorage();
        savePendingPayment(storage, 'supplier-1', { requestId, values });
        expect(loadPendingPayment(storage, 'supplier-1')).toEqual({ requestId, values });
        expect(loadPendingPayment(storage, 'supplier-2')).toBeNull();
        clearPendingPayment(storage, 'supplier-1');
        expect(loadPendingPayment(storage, 'supplier-1')).toBeNull();
    });

    it('ignores a corrupt or forged record instead of reusing it', () => {
        const storage = memoryStorage();
        for (const raw of ['not json', '{}', JSON.stringify({ requestId: 'x', values }), JSON.stringify({ requestId, values: null })]) {
            storage.data.set('faramace:pending-supplier-payment:s', raw);
            expect(loadPendingPayment(storage, 's')).toBeNull();
        }
    });

    it('never throws when storage is unavailable', () => {
        const broken = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); }, removeItem: () => { throw Error('blocked'); } };
        expect(() => savePendingPayment(broken, 's', { requestId, values })).not.toThrow();
        expect(loadPendingPayment(broken, 's')).toBeNull();
        expect(() => clearPendingPayment(broken, 's')).not.toThrow();
        expect(loadPendingPayment(undefined, 's')).toBeNull();
    });
});
