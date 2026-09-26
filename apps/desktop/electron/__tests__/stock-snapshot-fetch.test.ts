import { describe, expect, it, vi } from 'vitest';
import { fetchStockSnapshot, MAX_PENDING_STOCK_IDS } from '../stock-snapshot-fetch';

class ClientError extends Error { constructor(public status: number) { super('client ' + status); } }
const cached = { snapshot: { drugs: ['cached'] }, fromCache: true };
const deps = (post: (body?: string) => Promise<any>) => ({
    post: vi.fn(post), getCached: vi.fn(async () => cached),
    clientErrorStatus: (e: unknown) => e instanceof ClientError ? e.status : undefined, warn: vi.fn(),
});
const pending = (n: number) => ({ saleIds: Array.from({ length: n }, (_, i) => 's' + i), returnIds: [], protectedInventoryIds: new Set<string>() });

describe('fetchStockSnapshot', () => {
    it('asks the server which pending operations it applied when some are pending', async () => {
        const d = deps(async () => ({ json: async () => ({ drugs: [], applied: { saleIds: ['s0'], returnIds: [] } }) }));
        const r = await fetchStockSnapshot(d, 'b', pending(1));
        expect(r.applied).toEqual({ saleIds: ['s0'], returnIds: [] });
        expect(JSON.parse(String((d.post.mock.calls[0] as unknown[])[0]))).toEqual({ branchId: 'b', pendingSaleIds: ['s0'], pendingReturnIds: [] });
        expect(d.getCached).not.toHaveBeenCalled();
    });

    it('uses the cached GET, with applied unknown, when nothing is pending', async () => {
        const d = deps(async () => { throw new Error('not called'); });
        expect(await fetchStockSnapshot(d, 'b', pending(0))).toEqual({ ...cached, applied: null });
        expect(d.post).not.toHaveBeenCalled();
    });

    it('falls back to the cached GET on a server without the POST (404/405)', async () => {
        for (const status of [404, 405]) {
            const r = await fetchStockSnapshot(deps(async () => { throw new ClientError(status); }), 'b', pending(1));
            expect(r).toEqual({ ...cached, applied: null });
        }
    });

    it('falls back when the answer has no usable applied list', async () => {
        expect((await fetchStockSnapshot(deps(async () => ({ json: async () => ({ drugs: [] }) })), 'b', pending(1))).applied).toBeNull();
    });

    it('falls back without asking when too many operations are pending', async () => {
        const d = deps(async () => { throw new Error('not called'); });
        expect((await fetchStockSnapshot(d, 'b', pending(MAX_PENDING_STOCK_IDS + 1))).applied).toBeNull();
        expect(d.post).not.toHaveBeenCalled();
    });

    it('does not hide other failures (auth, server errors) behind the fallback', async () => {
        await expect(fetchStockSnapshot(deps(async () => { throw new ClientError(401); }), 'b', pending(1))).rejects.toThrow('client 401');
        await expect(fetchStockSnapshot(deps(async () => { throw new Error('network'); }), 'b', pending(1))).rejects.toThrow('network');
    });
});
