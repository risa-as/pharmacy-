import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

const toast = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

// A fresh module instance = a reloaded page or another tab (in-memory state is its
// own); they share the stubbed localStorage like tabs of one browser do.
const load = async () => { vi.resetModules(); return (await import('../warehouse-mutation-client')).warehouseMutation; };
type Hooks = { get?: (k: string) => string | null; set?: (k: string, v: string) => void; remove?: (k: string) => void; list?: () => string[] };
/** A Storage-shaped fake (getItem/setItem/removeItem/key/length) over a Map, with overridable behaviour. */
const fakeStorage = (store = new Map<string, string>(), hooks: Hooks = {}) => {
    const keys = () => (hooks.list ? hooks.list() : [...store.keys()]);
    return {
        store,
        getItem: (k: string) => (hooks.get ? hooks.get(k) : store.get(k) ?? null),
        setItem: (k: string, v: string) => (hooks.set ? hooks.set(k, v) : void store.set(k, v)),
        removeItem: (k: string) => (hooks.remove ? hooks.remove(k) : void store.delete(k)),
        key: (i: number) => keys()[i] ?? null,
        get length() { return keys().length; },
    };
};
const PAY = '/test/pay';
const STATUS = '/api/warehouse-operations/resolve';
const paymentCalls = (fetcher: any) => fetcher.mock.calls.filter((c: any[]) => String(c[0]) !== STATUS);
const keyOf = (fetcher: any, call: number) => JSON.parse(paymentCalls(fetcher)[call][1].body).idempotencyKey;
const asUser = (id: string | null) => async () => id;
const me = asUser('user-1');
let local: ReturnType<typeof fakeStorage>;
beforeEach(() => {
    toast.warning.mockClear();
    vi.stubGlobal('crypto', webcrypto);
    local = fakeStorage();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', fakeStorage());
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
        expect(local.store.size).toBe(0);
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
        await expect((await load())(PAY, init, me)).rejects.toThrow();
        await (await load())(PAY, init, me);
        expect(keyOf(fetcher, 1)).toBe(keyOf(fetcher, 0));
    });
    it('keeps the same key after the tab is closed (session storage gone)', async () => {
        const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(new Response('{}'));
        vi.stubGlobal('fetch', fetcher);
        await expect((await load())(PAY, init, me)).rejects.toThrow();
        vi.stubGlobal('sessionStorage', fakeStorage());
        await (await load())(PAY, init, me);
        expect(keyOf(fetcher, 1)).toBe(keyOf(fetcher, 0));
    });
    it('does not hand one user\'s unsettled attempt to another user on the same browser', async () => {
        const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        vi.stubGlobal('fetch', fetcher);
        const warehouseMutation = await load();
        await warehouseMutation(PAY, init, asUser('user-1')).catch(() => {});
        await warehouseMutation(PAY, init, asUser('user-2')).catch(() => {});
        expect(keyOf(fetcher, 1)).not.toBe(keyOf(fetcher, 0));
    });
});

describe('no send without a stored attempt', () => {
    const init = { method: 'POST', body: '{"amount":9}' };
    it('refuses when storage throws', async () => {
        const fail = () => { throw new DOMException('blocked', 'SecurityError'); };
        vi.stubGlobal('localStorage', fakeStorage(new Map(), { get: fail, set: fail, remove: fail, list: fail }));
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
        await expect((await load())(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('refuses when storage silently keeps nothing', async () => {
        vi.stubGlobal('localStorage', fakeStorage(new Map(), { set: () => undefined }));
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
        await expect((await load())(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('refuses when the stored attempts cannot be listed (a pending one could be missed)', async () => {
        vi.stubGlobal('localStorage', fakeStorage(new Map(), { list: () => { throw new DOMException('blocked', 'SecurityError'); } }));
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
        await expect((await load())(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('refuses when the signed-in user cannot be determined', async () => {
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
        await expect((await load())(PAY, init, asUser(null))).rejects.toThrow(/لم تُرسل/);
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('a storage failure after the attempt was stored does not change the key or send twice', async () => {
        const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(new Response('{}'));
        vi.stubGlobal('fetch', fetcher);
        await expect((await load())(PAY, init, me)).rejects.toThrow();
        // Storage now refuses writes but still holds the attempt: the retry reuses it.
        vi.stubGlobal('localStorage', fakeStorage(local.store, { set: () => { throw new DOMException('full', 'QuotaExceededError'); }, remove: () => undefined }));
        await (await load())(PAY, init, me);
        expect(paymentCalls(fetcher)).toHaveLength(2);
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
        await (await load())(PAY, init, me).catch(() => {});
        vi.setSystemTime(new Date('2026-09-28T09:00:00Z'));
        await (await load())(PAY, init, me);
        expect(keyOf(fetcher, 1)).toBe(keyOf(fetcher, 0));
    });
    it('a replayed answer is announced: the earlier attempt was applied, no new operation was recorded', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1, idempotentReplay: true }))));
        await (await load())(PAY, init, me);
        expect(toast.warning).toHaveBeenCalledOnce();
        expect(String(toast.warning.mock.calls[0][0])).toContain('لم تُسجّل عملية جديدة');
    });
    it('a first-time answer is not announced as a replay', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":1}')));
        await (await load())(PAY, init, me);
        expect(toast.warning).not.toHaveBeenCalled();
    });
});

describe('a settled attempt is retired for sure before an identical new operation', () => {
    const init = { method: 'POST', body: JSON.stringify({ amount: 70, invoice: 'i2' }) };
    it('removal fails but the attempt can be marked settled → the next identical operation gets a new key', async () => {
        vi.stubGlobal('localStorage', fakeStorage(new Map(), { remove: () => { throw new DOMException('blocked', 'SecurityError'); } }));
        const fetcher = vi.fn().mockImplementation(async () => new Response('{}'));
        vi.stubGlobal('fetch', fetcher);
        await (await load())(PAY, init, me);
        await (await load())(PAY, init, me);
        expect(keyOf(fetcher, 1)).not.toBe(keyOf(fetcher, 0));
    });
    it('nothing can be changed after success → the next identical operation is refused, not sent with the old key', async () => {
        const store = new Map<string, string>();
        let frozen = false;
        vi.stubGlobal('localStorage', fakeStorage(store, { set: (k, v) => { if (!frozen) store.set(k, v); }, remove: () => undefined }));
        const fetcher = vi.fn().mockImplementation(async () => { frozen = true; return new Response('{}'); });
        vi.stubGlobal('fetch', fetcher);
        const warehouseMutation = await load();
        await warehouseMutation(PAY, init, me);
        await expect(warehouseMutation(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});

describe('two tabs: an answer retires only its own attempt', () => {
    const init = { method: 'POST', body: JSON.stringify({ amount: 80, invoice: 'i3' }) };
    it('a late answer from tab B does not delete tab A\'s newer attempt (two intended payments stay two)', async () => {
        // Server: applies each new key once, replays a known key.
        const applied = new Set<string>();
        const answer = (key: string) => { const replay = applied.has(key); applied.add(key); return new Response('{"ok":1}', { headers: replay ? { 'x-idempotent-replay': '1' } : {} }); };
        let releaseA!: () => void, releaseB!: () => void;
        const script: ((key: string) => Promise<Response>)[] = [
            (key) => new Promise(r => { releaseA = () => r(answer(key)); }),                 // tab A, first payment
            (key) => { const res = answer(key); return new Promise(r => { releaseB = () => r(res); }); }, // tab B, same payment: applied/replayed now, answer late
            (key) => { answer(key); return Promise.reject(new TypeError('Failed to fetch')); }, // tab A, new payment: applied, answer lost
            async (key) => answer(key),                                                          // tab A, retry
        ];
        const fetcher = vi.fn((_url: string, opts: any) => script.shift()!(JSON.parse(opts.body).idempotencyKey));
        vi.stubGlobal('fetch', fetcher);
        const tabA = await load(), tabB = await load();
        const a1 = tabA(PAY, init, me);
        await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
        const b1 = tabB(PAY, init, me);
        await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
        expect(keyOf(fetcher, 1)).toBe(keyOf(fetcher, 0));   // both tabs carried the same attempt
        releaseA(); await a1;                                // first payment done
        await expect(tabA(PAY, init, me)).rejects.toThrow(); // user starts a new payment; its answer is lost
        releaseB(); await b1;                                // tab B's late answer for the first payment
        await tabA(PAY, init, me);                           // retry of the new payment
        expect(keyOf(fetcher, 3)).toBe(keyOf(fetcher, 2));
        expect(applied.size).toBe(2);
    });
});

describe('a key from the previous version (sessionStorage, no owner) is resolved on the server before anything else', () => {
    // «resolve» = the server says «recorded», or voids the key so its old request can never apply later.
    const init = { method: 'POST', body: JSON.stringify({ amount: 50, invoice: 'i1' }) };
    const LEGACY = 'legacy-key-0123456789abcdef';
    const legacySlot = 'warehouse-pending:' + JSON.stringify([PAY, 'POST', JSON.parse(init.body)]);
    const withLegacy = () => { const s = fakeStorage(); s.setItem(legacySlot, LEGACY); vi.stubGlobal('sessionStorage', s); return s; };
    const server = (status: () => Promise<Response>) => vi.fn((url: string) => (url === STATUS ? status() : Promise.resolve(new Response('{"ok":1}'))));

    it('asks the server about the old key (for this URL) before sending', async () => {
        withLegacy();
        const fetcher = server(async () => new Response('{"recorded":false,"voided":true}'));
        vi.stubGlobal('fetch', fetcher);
        await (await load())(PAY, init, me);
        expect(fetcher.mock.calls[0][0]).toBe(STATUS);
        expect(JSON.parse((fetcher.mock.calls[0][1] as any).body)).toEqual({ url: PAY, key: LEGACY });
    });
    it('status unknown → blocked and nothing sent; the old attempt is kept, so the next click is blocked too', async () => {
        const legacy = withLegacy();
        const fetcher = server(() => Promise.reject(new TypeError('Failed to fetch')));
        vi.stubGlobal('fetch', fetcher);
        const warehouseMutation = await load();
        await expect(warehouseMutation(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        await expect(warehouseMutation(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        expect(paymentCalls(fetcher)).toHaveLength(0);
        expect(legacy.getItem(legacySlot)).toBe(LEGACY);
    });
    it('a server error is not a «not recorded» answer', async () => {
        const legacy = withLegacy();
        const fetcher = server(async () => new Response('{"error":"x"}', { status: 500 }));
        vi.stubGlobal('fetch', fetcher);
        await expect((await load())(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        expect(paymentCalls(fetcher)).toHaveLength(0);
        expect(legacy.getItem(legacySlot)).toBe(LEGACY);
    });
    it('recorded → nothing new is sent, the user is told it is already recorded; the next click is a new operation', async () => {
        const legacy = withLegacy();
        const fetcher = server(async () => new Response('{"recorded":true}'));
        vi.stubGlobal('fetch', fetcher);
        const warehouseMutation = await load();
        await expect(warehouseMutation(PAY, init, me)).rejects.toThrow(/مسجلة/);
        expect(paymentCalls(fetcher)).toHaveLength(0);
        expect(legacy.getItem(legacySlot)).toBeNull();
        await warehouseMutation(PAY, init, me);
        expect(paymentCalls(fetcher)).toHaveLength(1);
        expect(keyOf(fetcher, 0)).not.toBe(LEGACY);
    });
    it('«not recorded» without the server voiding the key is not enough (the old request could still apply) → blocked', async () => {
        const legacy = withLegacy();
        const fetcher = server(async () => new Response('{"recorded":false}'));
        vi.stubGlobal('fetch', fetcher);
        await expect((await load())(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        expect(paymentCalls(fetcher)).toHaveLength(0);
        expect(legacy.getItem(legacySlot)).toBe(LEGACY);
    });
    it('voided → sent once with a new key (never the ownerless old key)', async () => {
        const legacy = withLegacy();
        const fetcher = server(async () => new Response('{"recorded":false,"voided":true}'));
        vi.stubGlobal('fetch', fetcher);
        await (await load())(PAY, init, me);
        expect(paymentCalls(fetcher)).toHaveLength(1);
        expect(keyOf(fetcher, 0)).not.toBe(LEGACY);
        expect(legacy.getItem(legacySlot)).toBeNull();
    });
    it('the old-version storage cannot be read → nothing is sent and the server is not bypassed', async () => {
        vi.stubGlobal('sessionStorage', fakeStorage(new Map([[legacySlot, LEGACY]]), { get: () => { throw new DOMException('blocked', 'SecurityError'); } }));
        const fetcher = server(async () => new Response('{"recorded":false,"voided":true}'));
        vi.stubGlobal('fetch', fetcher);
        const warehouseMutation = await load();
        await expect(warehouseMutation(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        await expect(warehouseMutation(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('once that storage reads again, the old key is resolved on the server first, then a new key is used', async () => {
        const store = new Map([[legacySlot, LEGACY]]);
        let broken = true;
        vi.stubGlobal('sessionStorage', fakeStorage(store, { get: (k) => { if (broken) throw new DOMException('blocked', 'SecurityError'); return store.get(k) ?? null; } }));
        const fetcher = server(async () => new Response('{"recorded":false,"voided":true}'));
        vi.stubGlobal('fetch', fetcher);
        const warehouseMutation = await load();
        await expect(warehouseMutation(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        broken = false;
        await warehouseMutation(PAY, init, me);
        expect(fetcher.mock.calls[0][0]).toBe(STATUS);
        expect(JSON.parse((fetcher.mock.calls[0][1] as any).body)).toEqual({ url: PAY, key: LEGACY });
        expect(paymentCalls(fetcher)).toHaveLength(1);
        expect(keyOf(fetcher, 0)).not.toBe(LEGACY);
        expect(store.has(legacySlot)).toBe(false);
    });
    it('recorded but the old entry cannot be removed → keeps stopping (no bypass)', async () => {
        vi.stubGlobal('sessionStorage', fakeStorage(new Map([[legacySlot, LEGACY]]), { remove: () => undefined }));
        const fetcher = server(async () => new Response('{"recorded":true}'));
        vi.stubGlobal('fetch', fetcher);
        const warehouseMutation = await load();
        await expect(warehouseMutation(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        await expect(warehouseMutation(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        expect(paymentCalls(fetcher)).toHaveLength(0);
    });
});

describe('a stored attempt that cannot be read is never treated as absent', () => {
    const init = { method: 'POST', body: JSON.stringify({ amount: 90, invoice: 'i4' }) };
    const lostThenRead = async (breakRead: (name: string) => void) => {
        const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(new Response('{}'));
        vi.stubGlobal('fetch', fetcher);
        await expect((await load())(PAY, init, me)).rejects.toThrow();
        const [name] = [...local.store.keys()];
        breakRead(name);
        return fetcher;
    };
    it('reading the pending entry throws → nothing sent (no new key for a lost payment)', async () => {
        const fetcher = await lostThenRead((name) => vi.stubGlobal('localStorage', fakeStorage(local.store, { get: (k) => { if (k === name) throw new DOMException('blocked', 'SecurityError'); return local.store.get(k) ?? null; } })));
        await expect((await load())(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        expect(paymentCalls(fetcher)).toHaveLength(1);
    });
    it('corrupt entry content → nothing sent', async () => {
        const fetcher = await lostThenRead((name) => local.store.set(name, '{not json'));
        await expect((await load())(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        expect(paymentCalls(fetcher)).toHaveLength(1);
    });
    it('entry content for a different key → nothing sent', async () => {
        const fetcher = await lostThenRead((name) => local.store.set(name, JSON.stringify({ key: 'someone-else-0123456789abcdef', savedAt: 1, state: 'pending' })));
        await expect((await load())(PAY, init, me)).rejects.toThrow(/لم تُرسل/);
        expect(paymentCalls(fetcher)).toHaveLength(1);
    });
    it('an entry that was really removed (listed, then gone) is not a blocker', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
        vi.stubGlobal('fetch', fetcher);
        const ghost = 'warehouse-attempt:v3:user-1:' + JSON.stringify([PAY, 'POST', JSON.parse(init.body)]) + '#' + 'a'.repeat(48);
        vi.stubGlobal('localStorage', fakeStorage(local.store, { list: () => [ghost, ...local.store.keys()] }));
        await (await load())(PAY, init, me);
        expect(paymentCalls(fetcher)).toHaveLength(1);
        expect(keyOf(fetcher, 0)).not.toBe('a'.repeat(48));
    });
});
