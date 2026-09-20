import { beforeEach, describe, expect, it } from 'vitest';
import {
    buildProductSnapshotCacheKey,
    clearProductSnapshotCache,
    fetchProductSyncSnapshotWithCache,
    isCacheableProductSyncSnapshot,
    isValidProductSyncSnapshot,
    type ProductSnapshotFetchResponse,
} from '../product-sync-cache';

function response(
    status: number,
    body: unknown,
    etag: string | null = null,
): ProductSnapshotFetchResponse {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: {
            get(name: string) {
                return name.toLowerCase() === 'etag' ? etag : null;
            },
        },
        async json() {
            return body;
        },
    };
}

function snapshot(branchId = 'branch-1') {
    return {
        drugs: [
            {
                id: 'drug-1',
                inventoryId: 'inv-1',
                barcode: '111',
                tradeName: 'Aspirin',
                scientificName: 'ASA',
                stock: 10,
                batches: [],
            },
        ],
        meta: {
            branchId,
            inventoryIds: ['inv-1'],
            drugIds: ['drug-1'],
            snapshotAt: '2026-09-20T10:00:00.000Z',
        },
    };
}

describe('product sync snapshot cache', () => {
    beforeEach(() => {
        clearProductSnapshotCache();
    });

    it('reuses a cached complete 200 snapshot after a 304 while preserving apply input', async () => {
        const calls: Array<Record<string, string>> = [];
        const firstSnapshot = snapshot();
        const result200 = await fetchProductSyncSnapshotWithCache(
            {
                apiBaseUrl: 'https://app.faramace.com/api',
                branchId: 'branch-1',
                authHeaders: { 'x-user-id': 'user-1', 'x-sync-token': 'token-1' },
            },
            async (headers) => {
                calls.push(headers);
                return response(200, firstSnapshot, 'W/"abc"');
            },
        );
        const result304 = await fetchProductSyncSnapshotWithCache(
            {
                apiBaseUrl: 'https://app.faramace.com/api',
                branchId: 'branch-1',
                authHeaders: { 'x-user-id': 'user-1', 'x-sync-token': 'token-1' },
            },
            async (headers) => {
                calls.push(headers);
                return response(304, null, 'W/"abc"');
            },
        );

        expect(result200.fromCache).toBe(false);
        expect(result304.fromCache).toBe(true);
        expect(result304.snapshot).toBe(firstSnapshot);
        expect(calls).toEqual([
            {},
            { 'If-None-Match': 'W/"abc"' },
        ]);
    });

    it('does not share etags across branch or auth identity changes', async () => {
        await fetchProductSyncSnapshotWithCache(
            {
                apiBaseUrl: 'https://app.faramace.com/api',
                branchId: 'branch-1',
                authHeaders: { 'x-user-id': 'user-1', 'x-sync-token': 'token-1' },
            },
            async () => response(200, snapshot('branch-1'), 'W/"branch-1"'),
        );

        const branchTwoCalls: Array<Record<string, string>> = [];
        await fetchProductSyncSnapshotWithCache(
            {
                apiBaseUrl: 'https://app.faramace.com/api',
                branchId: 'branch-2',
                authHeaders: { 'x-user-id': 'user-1', 'x-sync-token': 'token-1' },
            },
            async (headers) => {
                branchTwoCalls.push(headers);
                return response(200, snapshot('branch-2'), 'W/"branch-2"');
            },
        );

        const userTwoCalls: Array<Record<string, string>> = [];
        await fetchProductSyncSnapshotWithCache(
            {
                apiBaseUrl: 'https://app.faramace.com/api',
                branchId: 'branch-1',
                authHeaders: { 'x-user-id': 'user-2', 'x-sync-token': 'token-2' },
            },
            async (headers) => {
                userTwoCalls.push(headers);
                return response(200, snapshot('branch-1'), 'W/"user-2"');
            },
        );

        expect(branchTwoCalls).toEqual([{}]);
        expect(userTwoCalls).toEqual([{}]);
    });

    it('does not cache malformed 200 responses', async () => {
        await expect(fetchProductSyncSnapshotWithCache(
            {
                apiBaseUrl: 'https://app.faramace.com/api',
                branchId: 'branch-1',
                authHeaders: { 'x-user-id': 'user-1' },
            },
            async () => response(200, { meta: { branchId: 'branch-1' } }, 'W/"bad"'),
        )).rejects.toThrow('valid drugs array');

        const calls: Array<Record<string, string>> = [];
        await fetchProductSyncSnapshotWithCache(
            {
                apiBaseUrl: 'https://app.faramace.com/api',
                branchId: 'branch-1',
                authHeaders: { 'x-user-id': 'user-1' },
            },
            async (headers) => {
                calls.push(headers);
                return response(200, snapshot(), 'W/"good"');
            },
        );

        expect(calls).toEqual([{}]);
    });

    it('does not cache failed responses', async () => {
        const identity = {
            apiBaseUrl: 'https://app.faramace.com/api',
            branchId: 'branch-1',
            authHeaders: { 'x-user-id': 'user-1' },
        };

        await expect(fetchProductSyncSnapshotWithCache(
            identity,
            async () => response(500, { message: 'server error' }, 'W/"failed"'),
        )).rejects.toThrow('HTTP 500');

        const calls: Array<Record<string, string>> = [];
        await fetchProductSyncSnapshotWithCache(
            identity,
            async (headers) => {
                calls.push(headers);
                return response(200, snapshot(), 'W/"good"');
            },
        );

        expect(calls).toEqual([{}]);
    });

    it('applies older drugs-only snapshots without caching them', async () => {
        const identity = {
            apiBaseUrl: 'https://app.faramace.com/api',
            branchId: 'branch-1',
            authHeaders: { 'x-user-id': 'user-1' },
        };

        const result = await fetchProductSyncSnapshotWithCache(
            identity,
            async () => response(200, { drugs: [{ id: 'drug-1' }] }, 'W/"old-server"'),
        );

        const calls: Array<Record<string, string>> = [];
        await fetchProductSyncSnapshotWithCache(
            identity,
            async (headers) => {
                calls.push(headers);
                return response(200, snapshot(), 'W/"new-server"');
            },
        );

        expect(result.snapshot.drugs).toEqual([{ id: 'drug-1' }]);
        expect(calls).toEqual([{}]);
    });

    it('evicts a previous etag when a fresh 200 arrives without an etag', async () => {
        const identity = {
            apiBaseUrl: 'https://app.faramace.com/api',
            branchId: 'branch-1',
            authHeaders: { 'x-user-id': 'user-1' },
        };

        await fetchProductSyncSnapshotWithCache(
            identity,
            async () => response(200, snapshot(), 'W/"cached"'),
        );
        await fetchProductSyncSnapshotWithCache(
            identity,
            async () => response(200, snapshot(), null),
        );

        const calls: Array<Record<string, string>> = [];
        await fetchProductSyncSnapshotWithCache(
            identity,
            async (headers) => {
                calls.push(headers);
                return response(200, snapshot(), 'W/"recached"');
            },
        );

        expect(calls).toEqual([{}]);
    });

    it('rejects complete snapshots for a different branch than requested', async () => {
        const identity = {
            apiBaseUrl: 'https://app.faramace.com/api',
            branchId: 'branch-1',
            authHeaders: { 'x-user-id': 'user-1' },
        };

        await expect(fetchProductSyncSnapshotWithCache(
            identity,
            async () => response(200, snapshot('branch-2'), 'W/"wrong-branch"'),
        )).rejects.toThrow('branch mismatch');

        const calls: Array<Record<string, string>> = [];
        await fetchProductSyncSnapshotWithCache(
            identity,
            async (headers) => {
                calls.push(headers);
                return response(200, snapshot('branch-1'), 'W/"right-branch"');
            },
        );

        expect(calls).toEqual([{}]);
    });

    it('bounds the in-memory etag cache to the latest three identities', async () => {
        for (const branchId of ['branch-1', 'branch-2', 'branch-3', 'branch-4']) {
            await fetchProductSyncSnapshotWithCache(
                {
                    apiBaseUrl: 'https://app.faramace.com/api',
                    branchId,
                    authHeaders: { 'x-user-id': 'user-1' },
                },
                async () => response(200, snapshot(branchId), `W/"${branchId}"`),
            );
        }

        const evictedCalls: Array<Record<string, string>> = [];
        await fetchProductSyncSnapshotWithCache(
            {
                apiBaseUrl: 'https://app.faramace.com/api',
                branchId: 'branch-1',
                authHeaders: { 'x-user-id': 'user-1' },
            },
            async (headers) => {
                evictedCalls.push(headers);
                return response(200, snapshot('branch-1'), 'W/"branch-1-new"');
            },
        );

        const retainedCalls: Array<Record<string, string>> = [];
        await fetchProductSyncSnapshotWithCache(
            {
                apiBaseUrl: 'https://app.faramace.com/api',
                branchId: 'branch-4',
                authHeaders: { 'x-user-id': 'user-1' },
            },
            async (headers) => {
                retainedCalls.push(headers);
                return response(304, null, 'W/"branch-4"');
            },
        );

        expect(evictedCalls).toEqual([{}]);
        expect(retainedCalls).toEqual([{ 'If-None-Match': 'W/"branch-4"' }]);
    });

    it('keeps cache keys stable while preserving identity differences', () => {
        const a = buildProductSnapshotCacheKey({
            apiBaseUrl: 'https://app.faramace.com/api/',
            branchId: 'branch-1',
            authHeaders: { 'x-sync-token': 'token-1', 'x-user-id': 'user-1' },
        });
        const b = buildProductSnapshotCacheKey({
            apiBaseUrl: 'https://app.faramace.com/api',
            branchId: 'branch-1',
            authHeaders: { 'x-user-id': 'user-1', 'x-sync-token': 'token-1' },
        });
        const c = buildProductSnapshotCacheKey({
            apiBaseUrl: 'https://app.faramace.com/api',
            branchId: 'branch-1',
            authHeaders: { 'x-user-id': 'user-2', 'x-sync-token': 'token-1' },
        });

        expect(a).toBe(b);
        expect(c).not.toBe(a);
    });

    it('validates only complete product snapshots', () => {
        expect(isValidProductSyncSnapshot(snapshot())).toBe(true);
        expect(isValidProductSyncSnapshot({ drugs: [{ id: 'drug-1' }] })).toBe(true);
        expect(isValidProductSyncSnapshot({ drugs: [{ barcode: 'missing-id' }] })).toBe(false);
        expect(isCacheableProductSyncSnapshot(snapshot(), 'branch-1')).toBe(true);
        expect(isCacheableProductSyncSnapshot({ drugs: [{ id: 'drug-1' }] }, 'branch-1')).toBe(false);
        expect(isCacheableProductSyncSnapshot(snapshot('branch-2'), 'branch-1')).toBe(false);
        expect(isCacheableProductSyncSnapshot({
            drugs: [{ id: 'drug-1' }],
            meta: { branchId: 'branch-1', inventoryIds: ['inv-1'], drugIds: [1 as any] },
        }, 'branch-1')).toBe(false);
    });
});
