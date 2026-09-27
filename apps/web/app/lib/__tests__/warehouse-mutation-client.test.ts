import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

// A fresh module instance = the page was reloaded (in-memory state is gone).
const load = async () => { vi.resetModules(); return (await import('../warehouse-mutation-client')).warehouseMutation; };
const memoryStorage = (store = new Map<string, string>()) => ({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), store });
const keyOf = (fetcher: any, call: number) => JSON.parse(fetcher.mock.calls[call][1].body).idempotencyKey;
const asUser = (id: string | null) => async () => id;
const me = asUser('user-1');
let local: ReturnType<typeof memoryStorage>;
beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    local = memoryStorage();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('durable browser mutation identity', () => {
    it('retains the key after a network failure and clears it after complete success', async () => {
        const warehouseMutation = await load();
        const fetcher = vi.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue(new Response('{}'));
        vi.stubGlobal('fetch', fetcher);
        const init = { method: 'POST', body: JSON.stringify({ amount: 123 }) };
        await expect(warehouseMutation('/test/payment-a', init, me)).rejects.toThrow('connection lost');
        await warehouseMutation('/test/payment-a', init, me);
        expect(keyOf(fetcher, 1)).toBe(keyOf(fetcher, 0));
        fetcher.mockResolvedValue(new Response('{}'));
        await warehouseMutation('/test/payment-a', init, me);
        expect(keyOf(fetcher, 2)).not.toBe(keyOf(fetcher, 0));
    });
    it('retains the key when success headers arrive but the response body is truncated', async () => {
        const warehouseMutation = await load();
        const fetcher = vi.fn().mockResolvedValueOnce(new Response('{')).mockResolvedValueOnce(new Response('{}'));
        vi.stubGlobal('fetch', fetcher);
        const init = { method: 'POST', body: '{"amount":321}' };
        await expect(warehouseMutation('/test/payment-b', init, me)).rejects.toThrow();
        await warehouseMutation('/test/payment-b', init, me);
        expect(keyOf(fetcher, 1)).toBe(keyOf(fetcher, 0));
    });
    it('uses distinct operation identities for changed amounts after an ambiguous failure', async () => {
        const warehouseMutation = await load();
        const fetcher = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetcher);
        await warehouseMutation('/test/payment-c', { body: '{"amount":1}' }, me).catch(() => {});
        await warehouseMutation('/test/payment-c', { body: '{"amount":2}' }, me).catch(() => {});
        expect(keyOf(fetcher, 1)).not.toBe(keyOf(fetcher, 0));
    });
});

describe('the attempt survives a reload and a closed tab', () => {
    const init = { method: 'POST', body: JSON.stringify({ amount: 50, invoice: 'i1' }) };
    it('keeps the same key after the answer was lost and the page is reloaded', async () => {
        const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(new Response('{}'));
        vi.stubGlobal('fetch', fetcher);
        await expect((await load())('/test/pay', init, me)).rejects.toThrow();
        await (await load())('/test/pay', init, me);
        expect(keyOf(fetcher, 1)).toBe(keyOf(fetcher, 0));
    });
    it('keeps the same key after the tab is closed (session storage gone)', async () => {
        const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(new Response('{}'));
        vi.stubGlobal('fetch', fetcher);
        await expect((await load())('/test/pay', init, me)).rejects.toThrow();
        vi.stubGlobal('sessionStorage', memoryStorage());
        await (await load())('/test/pay', init, me);
        expect(keyOf(fetcher, 1)).toBe(keyOf(fetcher, 0));
    });
    it('reuses a key left in session storage by the previous version', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
        vi.stubGlobal('fetch', fetcher);
        const legacy = memoryStorage();
        legacy.setItem('warehouse-pending:' + JSON.stringify(['/test/pay', 'POST', JSON.parse(init.body)]), 'legacy-key-0123456789abcdef');
        vi.stubGlobal('sessionStorage', legacy);
        await (await load())('/test/pay', init, me);
        expect(keyOf(fetcher, 0)).toBe('legacy-key-0123456789abcdef');
    });
    it('does not hand one user\'s unsettled attempt to another user on the same browser', async () => {
        const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        vi.stubGlobal('fetch', fetcher);
        const warehouseMutation = await load();
        await warehouseMutation('/test/pay', init, asUser('user-1')).catch(() => {});
        await warehouseMutation('/test/pay', init, asUser('user-2')).catch(() => {});
        expect(keyOf(fetcher, 1)).not.toBe(keyOf(fetcher, 0));
    });
    it('does not replay a stale attempt forever: after a day a new key is used', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-27T08:00:00Z'));
        const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        vi.stubGlobal('fetch', fetcher);
        await (await load())('/test/pay', init, me).catch(() => {});
        vi.setSystemTime(new Date('2026-09-28T09:00:00Z'));
        await (await load())('/test/pay', init, me).catch(() => {});
        expect(keyOf(fetcher, 1)).not.toBe(keyOf(fetcher, 0));
    });
});

describe('no send without a stored attempt', () => {
    const init = { method: 'POST', body: '{"amount":9}' };
    it('refuses when storage throws', async () => {
        const fail = () => { throw new DOMException('blocked', 'SecurityError'); };
        vi.stubGlobal('localStorage', { getItem: fail, setItem: fail, removeItem: fail });
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
        await expect((await load())('/test/pay', init, me)).rejects.toThrow(/لم تُرسل/);
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('refuses when storage silently keeps nothing', async () => {
        vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
        await expect((await load())('/test/pay', init, me)).rejects.toThrow(/لم تُرسل/);
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('refuses when the signed-in user cannot be determined', async () => {
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
        await expect((await load())('/test/pay', init, asUser(null))).rejects.toThrow(/لم تُرسل/);
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('a storage failure after the attempt was stored does not change the key or send twice', async () => {
        const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(new Response('{}'));
        vi.stubGlobal('fetch', fetcher);
        await expect((await load())('/test/pay', init, me)).rejects.toThrow();
        // Storage now refuses writes but still holds the attempt: the retry reuses it.
        const kept = local.store;
        vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); }, removeItem: () => undefined });
        await (await load())('/test/pay', init, me);
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(keyOf(fetcher, 1)).toBe(keyOf(fetcher, 0));
    });
});
