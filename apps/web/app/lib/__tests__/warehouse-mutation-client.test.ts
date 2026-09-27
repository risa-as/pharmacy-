import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

const toast = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

// A fresh module instance = the page was reloaded (in-memory state is gone).
const load = async () => { vi.resetModules(); return (await import('../warehouse-mutation-client')).warehouseMutation; };
const memoryStorage = (store = new Map<string, string>()) => ({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), store });
const keyOf = (fetcher: any, call: number) => JSON.parse(fetcher.mock.calls[call][1].body).idempotencyKey;
const asUser = (id: string | null) => async () => id;
const me = asUser('user-1');
let local: ReturnType<typeof memoryStorage>;
beforeEach(() => {
    toast.warning.mockClear();
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
    it('does not hand one user\'s unsettled attempt to another user on the same browser', async () => {
        const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        vi.stubGlobal('fetch', fetcher);
        const warehouseMutation = await load();
        await warehouseMutation('/test/pay', init, asUser('user-1')).catch(() => {});
        await warehouseMutation('/test/pay', init, asUser('user-2')).catch(() => {});
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

describe('an unsettled attempt is never replaced by a new key', () => {
    const init = { method: 'POST', body: JSON.stringify({ amount: 50, invoice: 'i1' }) };
    it('25 hours later the same key is sent again, so the server settles it instead of applying it twice', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-27T08:00:00Z'));
        const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValue(new Response(JSON.stringify({ ok: 1, idempotentReplay: true })));
        vi.stubGlobal('fetch', fetcher);
        await (await load())('/test/pay', init, me).catch(() => {});
        vi.setSystemTime(new Date('2026-09-28T09:00:00Z'));
        await (await load())('/test/pay', init, me);
        expect(keyOf(fetcher, 1)).toBe(keyOf(fetcher, 0));
    });
    it('a replayed answer is announced: the earlier attempt was applied, no new operation was recorded', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1, idempotentReplay: true }))));
        await (await load())('/test/pay', init, me);
        expect(toast.warning).toHaveBeenCalledOnce();
        expect(String(toast.warning.mock.calls[0][0])).toContain('لم تُسجّل عملية جديدة');
    });
    it('a first-time answer is not announced as a replay', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":1}')));
        await (await load())('/test/pay', init, me);
        expect(toast.warning).not.toHaveBeenCalled();
    });
});

describe('a key from the previous version (sessionStorage, no owner) is never imported', () => {
    const init = { method: 'POST', body: JSON.stringify({ amount: 50, invoice: 'i1' }) };
    const legacySlot = 'warehouse-pending:' + JSON.stringify(['/test/pay', 'POST', JSON.parse(init.body)]);
    it('stops for review and sends nothing; the old key is not used by this (or another) user', async () => {
        const legacy = memoryStorage();
        legacy.setItem(legacySlot, 'legacy-key-0123456789abcdef');
        vi.stubGlobal('sessionStorage', legacy);
        const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
        vi.stubGlobal('fetch', fetcher);
        await expect((await load())('/test/pay', init, asUser('user-2'))).rejects.toThrow(/راجع/);
        expect(fetcher).not.toHaveBeenCalled();
        // After the review stop, the old entry is gone and a new operation gets its own key.
        expect(legacy.getItem(legacySlot)).toBeNull();
        await (await load())('/test/pay', init, asUser('user-2'));
        expect(keyOf(fetcher, 0)).not.toBe('legacy-key-0123456789abcdef');
    });
    it('keeps stopping while the old entry cannot be removed', async () => {
        vi.stubGlobal('sessionStorage', { getItem: () => 'legacy-key-0123456789abcdef', setItem: () => undefined, removeItem: () => undefined });
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
        const warehouseMutation = await load();
        await expect(warehouseMutation('/test/pay', init, me)).rejects.toThrow(/راجع/);
        await expect(warehouseMutation('/test/pay', init, me)).rejects.toThrow(/راجع/);
        expect(fetcher).not.toHaveBeenCalled();
    });
});

describe('a settled attempt is retired for sure before an identical new operation', () => {
    const init = { method: 'POST', body: JSON.stringify({ amount: 70, invoice: 'i2' }) };
    it('removal fails but the attempt can be marked settled → the next identical operation gets a new key', async () => {
        const store = new Map<string, string>();
        vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: () => { throw new DOMException('blocked', 'SecurityError'); } });
        const fetcher = vi.fn().mockImplementation(async () => new Response('{}'));
        vi.stubGlobal('fetch', fetcher);
        await (await load())('/test/pay', init, me);
        await (await load())('/test/pay', init, me);
        expect(keyOf(fetcher, 1)).not.toBe(keyOf(fetcher, 0));
    });
    it('nothing can be changed after success → the next identical operation is refused, not sent with the old key', async () => {
        const store = new Map<string, string>();
        let frozen = false;
        vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { if (!frozen) store.set(k, v); }, removeItem: () => undefined });
        const fetcher = vi.fn().mockImplementation(async () => { frozen = true; return new Response('{}'); });
        vi.stubGlobal('fetch', fetcher);
        const warehouseMutation = await load();
        await warehouseMutation('/test/pay', init, me);
        await expect(warehouseMutation('/test/pay', init, me)).rejects.toThrow(/لم تُرسل/);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});
