import { beforeEach, describe, expect, it, vi } from 'vitest';

const deferred = <T = void>() => {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

async function loadSyncService(overrides: {
    auth?: Record<string, any>;
    netInfo?: Record<string, any>;
    db?: Record<string, any>;
    api?: Record<string, any>;
} = {}) {
    vi.resetModules();

    const auth = {
        getCurrentUser: vi.fn().mockResolvedValue({ id: 'u1', branchId: 'b1' }),
        getToken: vi.fn().mockResolvedValue('a.b.c'),
        logout: vi.fn().mockResolvedValue(undefined),
        ...overrides.auth,
    };
    const netInfo = {
        fetch: vi.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
        ...overrides.netInfo,
    };
    const db = {
        getPendingSales: vi.fn().mockResolvedValue([]),
        deleteOfflineSale: vi.fn().mockResolvedValue(undefined),
        saveProducts: vi.fn().mockResolvedValue(undefined),
        saveDebts: vi.fn().mockResolvedValue(undefined),
        savePatients: vi.fn().mockResolvedValue(undefined),
        saveLoyalty: vi.fn().mockResolvedValue(undefined),
        ...overrides.db,
    };
    const api = {
        createSale: vi.fn().mockResolvedValue({ success: true }),
        getInventory: vi.fn().mockResolvedValue([]),
        getDebts: vi.fn().mockResolvedValue([]),
        getPatients: vi.fn().mockResolvedValue([]),
        getLoyaltySettings: vi.fn().mockResolvedValue(null),
        earnLoyaltyPoints: vi.fn().mockResolvedValue(undefined),
        ...overrides.api,
    };

    vi.doMock('@react-native-community/netinfo', () => ({ default: netInfo }));
    vi.doMock('./auth', () => ({ authService: auth }));
    vi.doMock('./db', () => ({ dbService: db }));
    vi.doMock('./api', () => ({ apiService: api }));
    vi.doMock('@react-native-async-storage/async-storage', () => ({
        default: {
            getItem: vi.fn().mockResolvedValue(null),
            setItem: vi.fn().mockResolvedValue(undefined),
            removeItem: vi.fn().mockResolvedValue(undefined),
        },
    }));

    const module = await import('./sync');
    return { syncService: module.syncService, auth, netInfo, db, api };
}

describe('syncService locking', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('holds the sync lock before auth preflight awaits resolve', async () => {
        const currentUser = deferred<{ id: string; branchId: string } | null>();
        const { syncService, auth } = await loadSyncService({
            auth: {
                getCurrentUser: vi.fn().mockReturnValue(currentUser.promise),
                getToken: vi.fn().mockResolvedValue(null),
            },
        });

        const first = syncService.syncData();
        await flush();
        const second = syncService.syncData();
        await flush();

        expect(auth.getCurrentUser).toHaveBeenCalledTimes(1);
        expect(syncService.isSyncing).toBe(true);

        currentUser.resolve(null);
        await expect(first).resolves.toBeUndefined();
        await expect(second).resolves.toBeUndefined();
        expect(syncService.isSyncing).toBe(false);
    });

    it('releases the sync lock when auth preflight rejects', async () => {
        const { syncService } = await loadSyncService({
            auth: {
                getCurrentUser: vi.fn().mockRejectedValue(new Error('secure store failed')),
            },
        });

        await syncService.syncData();

        expect(syncService.isSyncing).toBe(false);
    });

    it('releases the sync lock when network preflight rejects', async () => {
        const { syncService } = await loadSyncService({
            netInfo: {
                fetch: vi.fn().mockRejectedValue(new Error('netinfo failed')),
            },
        });

        await syncService.syncData();

        expect(syncService.isSyncing).toBe(false);
    });

    it('releases the sync lock when invalid-token logout rejects', async () => {
        const { syncService, auth } = await loadSyncService({
            auth: {
                getCurrentUser: vi.fn().mockResolvedValue({ id: 'u1', branchId: 'b1' }),
                getToken: vi.fn().mockResolvedValue('legacy-token'),
                logout: vi.fn().mockRejectedValue(new Error('logout failed')),
            },
        });

        await syncService.syncData();

        expect(auth.logout).toHaveBeenCalledTimes(1);
        expect(syncService.isSyncing).toBe(false);
    });

    it('does not wedge the sync lock when callbacks throw', async () => {
        const { syncService, db } = await loadSyncService();
        syncService.setCallbacks({
            onStart: vi.fn(() => { throw new Error('start failed'); }),
            onDone: vi.fn(() => { throw new Error('done failed'); }),
        });

        await syncService.syncData();

        expect(db.saveProducts).toHaveBeenCalledWith([]);
        expect(syncService.isSyncing).toBe(false);
    });
});
