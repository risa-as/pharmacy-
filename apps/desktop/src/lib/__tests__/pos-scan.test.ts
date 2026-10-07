import { describe, expect, it, vi } from 'vitest';
import { addOne, knownByBarcode, sharedLookup } from '../pos-scan';

const p = (id: string, stock: number) => ({ id, barcode: 'B-' + id, stock, name: id });

describe('fast repeated barcode scans', () => {
    it('five scans in a row count five, applied one after another without waiting for a render', () => {
        let cart: ReturnType<typeof addOne<ReturnType<typeof p>>>['cart'] = [];
        for (let i = 0; i < 5; i++) {
            const r = addOne(cart, p('a', 10));
            expect(r.ok).toBe(true);
            cart = r.cart;
        }
        expect(cart).toEqual([{ ...p('a', 10), quantity: 5 }]);
    });

    it('never goes above the known stock, and never mutates the cart it was given', () => {
        const start = [{ ...p('a', 2), quantity: 2 }];
        const r = addOne(start, p('a', 2));
        expect(r).toMatchObject({ ok: false, reason: 'STOCK_LIMIT' });
        expect(r.cart).toBe(start);
        expect(addOne([], p('z', 0))).toMatchObject({ ok: false, reason: 'OUT_OF_STOCK' });
        const before = [{ ...p('a', 5), quantity: 1 }];
        addOne(before, p('a', 5));
        expect(before[0].quantity).toBe(1);
    });

    it('a barcode already in the cart or scanned before is known without asking the main process', () => {
        const cache = new Map([['B-c', p('c', 3)]]);
        const cart = [{ ...p('a', 4), quantity: 1 }];
        expect(knownByBarcode('B-a', cart, cache)?.id).toBe('a');
        expect(knownByBarcode(' B-c ', cart, cache)?.id).toBe('c');
        expect(knownByBarcode('B-x', cart, cache)).toBeUndefined();
        expect(knownByBarcode('  ', cart, cache)).toBeUndefined();
    });

    it('scans of a new barcode while its lookup runs share one request', async () => {
        const pending = new Map<string, Promise<unknown>>();
        let release!: (v: unknown) => void;
        const lookup = vi.fn(() => new Promise(r => { release = r; }));
        const first = sharedLookup(pending, 'B-n', lookup);
        const second = sharedLookup(pending, 'B-n', lookup);
        expect(second).toBe(first);
        expect(lookup).toHaveBeenCalledTimes(1);
        release(p('n', 9));
        await expect(first).resolves.toMatchObject({ id: 'n' });
        // Finished lookups are forgotten, so a later scan refreshes again.
        expect(pending.size).toBe(0);
        sharedLookup(pending, 'B-n', lookup);
        expect(lookup).toHaveBeenCalledTimes(2);
    });

    it('a failed lookup is forgotten too', async () => {
        const pending = new Map<string, Promise<unknown>>();
        await expect(sharedLookup(pending, 'B-f', () => Promise.reject(new Error('ipc')))).rejects.toThrow('ipc');
        expect(pending.size).toBe(0);
    });
});

describe('what the product grid shows', () => {
    it('a catalogue refresh never replaces a search the user is reading', async () => {
        const { catalogueMayApply } = await import('../pos-scan');
        expect(catalogueMayApply({ showingSearch: false, currentTerm: '' })).toBe(true);
        expect(catalogueMayApply({ showingSearch: false, currentTerm: 'a' })).toBe(true); // one letter is not a search
        expect(catalogueMayApply({ showingSearch: true, currentTerm: 'par' })).toBe(false);
        expect(catalogueMayApply({ showingSearch: false, currentTerm: 'pa' })).toBe(false); // typed, answer pending
        expect(catalogueMayApply({ showingSearch: true, currentTerm: '' })).toBe(false); // cleared, catalogue restored from cache first
    });
    it('a search answer is shown only for the term still in the box', async () => {
        const { searchAnswerMayApply } = await import('../pos-scan');
        expect(searchAnswerMayApply('para', 'para')).toBe(true);
        expect(searchAnswerMayApply('par', 'para')).toBe(false);
        expect(searchAnswerMayApply('para', '')).toBe(false);
    });
});
