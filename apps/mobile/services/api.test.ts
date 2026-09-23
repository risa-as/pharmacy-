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

import { apiService, request, setCachedToken, rotateCachedToken, getSessionGeneration } from './api';

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


describe('mobile smart planning request', () => {
 const settings = { from:'2026-09-01', to:'2026-09-20', coverageDays:7, leadDays:2, safetyDays:1, fromArrival:true };
 beforeEach(() => { vi.restoreAllMocks(); setCachedToken(`planning-${Math.random()}`); });
 it('sends the full selected period and coverage, and refresh bypasses cache', async () => {
  const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({rows:[]}));
  vi.stubGlobal('fetch',fetchMock);
  await apiService.getSmartPlanning(settings,'branch-a');
  await apiService.getSmartPlanning(settings,'branch-a');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const url = new URL(String(fetchMock.mock.calls[0][0]));
  expect(Object.fromEntries(url.searchParams)).toEqual({ format:'planning', branchId:'branch-a', ...Object.fromEntries(Object.entries(settings).map(([k,v]) => [k,String(v)])) });
  await apiService.getSmartPlanning(settings,'branch-a',true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
 });
 it('does not turn an analysis failure into an empty inventory result', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(jsonResponse({error:'invalid period'},400)));
  await expect(apiService.getSmartPlanning(settings)).rejects.toThrow();
 });
});

it('keeps in-flight reads valid after same-scope credential renewal',async()=>{setCachedToken('old');const generation=getSessionGeneration();let resolve!:(v:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>resolve=r)));const pending=request('/inventory?branchId=rotate');await vi.waitFor(()=>expect(resolve).toBeDefined());expect(rotateCachedToken('new','old',generation)).toBe(true);expect(getSessionGeneration()).toBe(generation);resolve(jsonResponse([{id:'allowed'}]));await expect(pending).resolves.toEqual([{id:'allowed'}]);});
it('does not let a stale refresh replace a different login',()=>{setCachedToken('old');const generation=getSessionGeneration();setCachedToken('other-account');expect(rotateCachedToken('stale-refresh','old',generation)).toBe(false);});

it.each(['error','message'])('preserves server validation text from %s',async(key)=>{setCachedToken('validation-'+key);vi.stubGlobal('fetch',vi.fn().mockResolvedValue(jsonResponse({[key]:'اكتب سبب فرق الجرد'},409)));await expect(request('/inventory/stocktake/test',{method:'PUT',body:'{}'})).rejects.toThrow('اكتب سبب فرق الجرد');});
it('uses a safe HTTP fallback for non-JSON error pages',async()=>{setCachedToken('html-error');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>internal diagnostics</html>',{status:409})));await expect(request('/inventory/stocktake/test',{method:'PUT',body:'{}'})).rejects.toThrow('HTTP 409');});
