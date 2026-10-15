import { beforeEach, describe, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
import { checkoutDraftKey, createCheckoutDraftStore, parseCheckoutDraft, type CheckoutDraft } from './checkout-draft';
const draft: CheckoutDraft = { version: 1, cart: [{ id: 'drug', name: 'test', price: 1200, quantity: 2, originalPrice: 1500 }], patient: { id: 'patient', name: 'Customer' }, method: 'CREDIT', manualDiscount: 100, pointsToRedeem: 0, idempotencyKey: 'same-sale-attempt' };
beforeEach(() => { vi.resetAllMocks(); storage.setItem.mockResolvedValue(undefined); });
describe('checkout drafts', () => {
    it('isolates users and branches, including separator characters', () => {
        expect(checkoutDraftKey('a', 'b')).not.toBe(checkoutDraftKey('a', 'c'));
        expect(checkoutDraftKey('a:b', 'c')).not.toBe(checkoutDraftKey('a', 'b:c'));
        expect(checkoutDraftKey('a', 'b')).not.toBe(checkoutDraftKey('b', 'b'));
    });
    it('restores sale details and the same retry key after process death', async () => {
        storage.getItem.mockResolvedValue(JSON.stringify(draft));
        expect(await createCheckoutDraftStore('scope').load()).toEqual(draft);
        expect(parseCheckoutDraft(null)).toBeNull();
    });
    it('rejects corrupt or incompatible drafts instead of silently overwriting them', () => {
        expect(() => parseCheckoutDraft('{')).toThrow();
        expect(() => parseCheckoutDraft(JSON.stringify({ ...draft, version: 2 }))).toThrow();
        expect(() => parseCheckoutDraft(JSON.stringify({ ...draft, cart: [{ id: 'x', name: 'x', price: -1, quantity: 1 }] }))).toThrow();
    });
    it('serializes edits and clearing so an old draft cannot win the race', async () => {
        let resolve!: () => void;
        storage.setItem.mockImplementationOnce(() => new Promise<void>(r => { resolve = r; }));
        const store = createCheckoutDraftStore('scope');
        const first = store.save(draft);
        const cleared = { ...draft, cart: [], patient: null, method: null, manualDiscount: 0 };
        const second = store.save(cleared);
        await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1));
        resolve(); await Promise.all([first, second]); await store.flush();
        expect(JSON.parse(storage.setItem.mock.calls[1][1])).toEqual(cleared);
    });
    it('waits for writes from a previous provider of the same scope', async () => {
        let resolve!: () => void;
        storage.setItem.mockImplementationOnce(() => new Promise<void>(r => { resolve = r; }));
        const old = createCheckoutDraftStore('remount-scope');
        const saving = old.save(draft);
        storage.getItem.mockResolvedValue(JSON.stringify(draft));
        const loading = createCheckoutDraftStore('remount-scope').load();
        await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalled());
        expect(storage.getItem).not.toHaveBeenCalled();
        resolve(); await saving;
        expect(await loading).toEqual(draft);
    });
    it('reports a failed write and can save the next edit', async () => {
        storage.setItem.mockRejectedValueOnce(new Error('storage full'));
        const store = createCheckoutDraftStore('scope');
        await expect(store.save(draft)).rejects.toThrow('storage full');
        await expect(store.flush()).rejects.toThrow();
        await expect(store.save(draft)).resolves.toBeUndefined();
    });
});
