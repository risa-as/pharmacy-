import { describe, expect, it } from 'vitest';
import { productSnapshotResponse } from '../product-snapshot-response';

const snapshot = { drugs: [{ id: 'd1', stock: 5 }], meta: { branchId: 'b1', inventoryIds: ['i1'], drugIds: ['d1'] } };
describe('conditional product snapshots', () => {
    it('returns an empty 304 for an unchanged authenticated snapshot', async () => {
        const initial = productSnapshotResponse(new Request('http://localhost'), snapshot);
        const etag = initial.headers.get('etag')!;
        expect(initial.status).toBe(200);
        expect(await initial.json()).toMatchObject(snapshot);
        const unchanged = productSnapshotResponse(new Request('http://localhost', { headers: { 'If-None-Match': etag } }), snapshot);
        expect(unchanged.status).toBe(304);
        expect(await unchanged.text()).toBe('');
        expect(unchanged.headers.get('cache-control')).toBe('private, no-cache');
    });
    it.each([
        { ...snapshot, drugs: [{ id: 'd1', stock: 4 }] },
        { drugs: [], meta: { branchId: 'b1', inventoryIds: [], drugIds: [] } },
        { ...snapshot, meta: { ...snapshot.meta, branchId: 'b2' } },
    ])('changes the revision for stock, deletion or scope changes', next => {
        const etag = productSnapshotResponse(new Request('http://localhost'), snapshot).headers.get('etag')!;
        const response = productSnapshotResponse(new Request('http://localhost', { headers: { 'If-None-Match': etag } }), next);
        expect(response.status).toBe(200);
        expect(response.headers.get('etag')).not.toBe(etag);
    });
});
