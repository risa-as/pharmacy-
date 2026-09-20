import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), removeItem: vi.fn().mockResolvedValue(null) },
}));
vi.mock('expo-secure-store', () => ({
    getItemAsync: vi.fn(), deleteItemAsync: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'test' } }));
vi.mock('expo-router', () => ({ router: { replace: vi.fn() } }));
vi.mock('./polling', () => ({ pollingService: { unregisterAll: vi.fn() } }));

import { apiService, request, setCachedToken } from './api';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
});

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

describe('mobile inventory response cache', () => {
    it('deduplicates simultaneous GETs before asynchronous token preparation completes', async () => {
        const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([{ id: 'shared' }]));
        vi.stubGlobal('fetch', fetchMock);
        const results = await Promise.all([apiService.getInventory('a'), apiService.getInventory('a')]);
        expect(results[0]).toEqual(results[1]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('bounds cached page/search responses to 100 entries', async () => {
        const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([]));
        vi.stubGlobal('fetch', fetchMock);
        for (let page = 1; page <= 101; page++) await request(`/inventory/page?page=${page}`);
        await request('/inventory/page?page=101');
        expect(fetchMock).toHaveBeenCalledTimes(101);
        await request('/inventory/page?page=1');
        expect(fetchMock).toHaveBeenCalledTimes(102);
    });
    it.each(['/sales', '/purchases/order-1/receive'])(
        'invalidates paginated inventory after successful %s', async endpoint => {
            const fetchMock = vi.fn()
                .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'before' }] }))
                .mockResolvedValueOnce(jsonResponse({ success: true }))
                .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'after' }] }));
            vi.stubGlobal('fetch', fetchMock);
            const options = { page: 1, search: '', status: 'all', sort: 'name', direction: 'asc' as const };
            await apiService.getInventoryPage(options);
            await request(endpoint, { method: 'POST', body: '{}' });
            expect((await apiService.getInventoryPage(options)).items[0].id).toBe('after');
            expect(fetchMock).toHaveBeenCalledTimes(3);
        },
    );
    beforeEach(() => {
        vi.restoreAllMocks();
        (globalThis as { __DEV__?: boolean }).__DEV__ = false;
        setCachedToken(`token-${Math.random()}`);
    });

    it('invalidates every branch/query inventory entry after a successful inventory mutation', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse([{ id: 'before' }]))
            .mockResolvedValueOnce(jsonResponse({ success: true }))
            .mockResolvedValueOnce(jsonResponse([{ id: 'after' }]));
        vi.stubGlobal('fetch', fetchMock);

        await apiService.getInventory('branch-a');
        await request('/inventory/add-batch', { method: 'POST', body: '{}' });
        await apiService.getInventory('branch-a');

        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('starts a fresh GET instead of reusing an invalidated in-flight inventory request', async () => {
        let resolveOldGet: ((response: Response) => void) | undefined;
        const oldGet = new Promise<Response>(resolve => { resolveOldGet = resolve; });
        const fetchMock = vi.fn()
            .mockReturnValueOnce(oldGet)
            .mockResolvedValueOnce(jsonResponse({ success: true }))
            .mockResolvedValueOnce(jsonResponse([{ id: 'fresh' }]));
        vi.stubGlobal('fetch', fetchMock);

        const pending = apiService.getInventory('branch-a');
        await flush();
        await request('/inventory/add-batch', { method: 'POST', body: '{}' });
        const fresh = apiService.getInventory('branch-a');
        await flush();
        resolveOldGet?.(jsonResponse([{ id: 'stale' }]));
        await expect(pending).resolves.toEqual([{ id: 'stale' }]);
        await expect(fresh).resolves.toEqual([{ id: 'fresh' }]);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('clears cached dashboard data derived from inventory after a stock mutation', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ inventory: 1 }))
            .mockResolvedValueOnce(jsonResponse({ success: true }))
            .mockResolvedValueOnce(jsonResponse({ inventory: 2 }));
        vi.stubGlobal('fetch', fetchMock);

        await request('/stats');
        await request('/inventory/add-batch', { method: 'POST', body: '{}' });
        await expect(request('/stats')).resolves.toEqual({ inventory: 2 });

        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('clears cached nested report routes after a stock mutation', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ sales: 1 }))
            .mockResolvedValueOnce(jsonResponse({ success: true }))
            .mockResolvedValueOnce(jsonResponse({ sales: 2 }));
        vi.stubGlobal('fetch', fetchMock);

        await request('/reports/sales?period=daily');
        await request('/inventory/add-batch', { method: 'POST', body: '{}' });
        await expect(request('/reports/sales?period=daily')).resolves.toEqual({ sales: 2 });

        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('forces a server request for manual inventory refresh', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse([{ id: 'cached' }]))
            .mockResolvedValueOnce(jsonResponse([{ id: 'refreshed' }]));
        vi.stubGlobal('fetch', fetchMock);

        await apiService.getInventory('branch-a');
        await apiService.getInventory('branch-a');
        await expect(apiService.getInventory('branch-a', true)).resolves.toEqual([{ id: 'refreshed' }]);

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not expire a newer session when an old request returns 401', async () => {
        let resolveOldRequest: ((response: Response) => void) | undefined;
        const oldRequest = new Promise<Response>(resolve => { resolveOldRequest = resolve; });
        const fetchMock = vi.fn()
            .mockReturnValueOnce(oldRequest)
            .mockResolvedValueOnce(jsonResponse([{ id: 'new-session' }]));
        vi.stubGlobal('fetch', fetchMock);

        const pending = apiService.getInventory('branch-a');
        await flush();
        setCachedToken('new-session-token');
        resolveOldRequest?.(jsonResponse({ message: 'expired' }, 401));

        await expect(pending).rejects.toThrow('Session changed');
        await expect(apiService.getInventory('branch-a')).resolves.toEqual([{ id: 'new-session' }]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
