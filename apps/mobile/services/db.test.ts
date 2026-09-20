import { beforeEach, describe, expect, it, vi } from 'vitest';

const product = (overrides: Record<string, unknown> = {}) => ({
    id: 'p1',
    drugName: 'Drug',
    tradeName: 'Trade',
    scientificName: 'Scientific',
    quantity: 4,
    price: 10,
    reorderLevel: 2,
    branchId: 'b1',
    barcode: '111',
    ...overrides,
});

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
    await new Promise(resolve => setTimeout(resolve, 0));
};

async function loadDbService(fakeDb: Record<string, any>) {
    vi.resetModules();
    vi.doMock('expo-sqlite', () => ({
        openDatabaseAsync: vi.fn().mockResolvedValue(fakeDb),
    }));
    return import('./db');
}

describe('dbService.saveProducts', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('serializes overlapping product saves instead of skipping the second snapshot', async () => {
        const firstTransaction = deferred();
        const events: string[] = [];
        const fakeDb = {
            execAsync: vi.fn().mockResolvedValue(undefined),
            getAllAsync: vi.fn()
                .mockImplementationOnce(async () => {
                    events.push('read:first');
                    return [];
                })
                .mockImplementationOnce(async () => {
                    events.push('read:second');
                    return [];
                }),
            runAsync: vi.fn().mockResolvedValue(undefined),
            withTransactionAsync: vi.fn()
                .mockImplementationOnce(async (callback: () => Promise<void>) => {
                    events.push('transaction:first:start');
                    await callback();
                    await firstTransaction.promise;
                    events.push('transaction:first:end');
                })
                .mockImplementationOnce(async (callback: () => Promise<void>) => {
                    events.push('transaction:second:start');
                    await callback();
                    events.push('transaction:second:end');
                }),
        };
        const { dbService } = await loadDbService(fakeDb);

        const first = dbService.saveProducts([product({ id: 'p1' })]);
        await flush();
        const second = dbService.saveProducts([product({ id: 'p2' })]);
        await flush();

        expect(fakeDb.getAllAsync).toHaveBeenCalledTimes(1);
        firstTransaction.resolve();
        await expect(first).resolves.toBeUndefined();
        await expect(second).resolves.toBeUndefined();

        expect(events).toEqual([
            'read:first',
            'transaction:first:start',
            'transaction:first:end',
            'read:second',
            'transaction:second:start',
            'transaction:second:end',
        ]);
        expect(fakeDb.runAsync).toHaveBeenCalledTimes(2);
    });

    it('does not write when the incoming snapshot matches local products', async () => {
        const fakeDb = {
            execAsync: vi.fn().mockResolvedValue(undefined),
            getAllAsync: vi.fn().mockResolvedValue([product()]),
            runAsync: vi.fn().mockResolvedValue(undefined),
            withTransactionAsync: vi.fn(async (callback: () => Promise<void>) => callback()),
        };
        const { dbService } = await loadDbService(fakeDb);

        await dbService.saveProducts([product()]);

        expect(fakeDb.withTransactionAsync).not.toHaveBeenCalled();
        expect(fakeDb.runAsync).not.toHaveBeenCalled();
    });

    it('deletes local products for an authoritative empty snapshot', async () => {
        const fakeDb = {
            execAsync: vi.fn().mockResolvedValue(undefined),
            getAllAsync: vi.fn().mockResolvedValue([product(), product({ id: 'p2' })]),
            runAsync: vi.fn().mockResolvedValue(undefined),
            withTransactionAsync: vi.fn(async (callback: () => Promise<void>) => callback()),
        };
        const { dbService } = await loadDbService(fakeDb);

        await dbService.saveProducts([]);

        expect(fakeDb.runAsync).toHaveBeenCalledTimes(2);
        expect(fakeDb.runAsync).toHaveBeenNthCalledWith(1, 'DELETE FROM products WHERE id = ?', ['p1']);
        expect(fakeDb.runAsync).toHaveBeenNthCalledWith(2, 'DELETE FROM products WHERE id = ?', ['p2']);
    });

    it('rejects invalid snapshots without clearing the product cache', async () => {
        const fakeDb = {
            execAsync: vi.fn().mockResolvedValue(undefined),
            getAllAsync: vi.fn().mockResolvedValue([product()]),
            runAsync: vi.fn().mockResolvedValue(undefined),
            withTransactionAsync: vi.fn(async (callback: () => Promise<void>) => callback()),
        };
        const { dbService } = await loadDbService(fakeDb);

        await expect(dbService.saveProducts({} as any)).rejects.toThrow('Product snapshot must be an array');
        await expect(dbService.saveProducts([product({ id: '' })])).rejects.toThrow('Product snapshot row is missing a valid id');

        expect(fakeDb.withTransactionAsync).not.toHaveBeenCalled();
        expect(fakeDb.runAsync).not.toHaveBeenCalled();
    });

    it('lets a queued save run after the previous transaction fails', async () => {
        const fakeDb = {
            execAsync: vi.fn().mockResolvedValue(undefined),
            getAllAsync: vi.fn().mockResolvedValue([]),
            runAsync: vi.fn().mockResolvedValue(undefined),
            withTransactionAsync: vi.fn()
                .mockRejectedValueOnce(new Error('transaction failed'))
                .mockImplementationOnce(async (callback: () => Promise<void>) => callback()),
        };
        const { dbService } = await loadDbService(fakeDb);

        const first = dbService.saveProducts([product({ id: 'p1' })]);
        const second = dbService.saveProducts([product({ id: 'p2' })]);

        await expect(first).rejects.toThrow('transaction failed');
        await expect(second).resolves.toBeUndefined();
        expect(fakeDb.getAllAsync).toHaveBeenCalledTimes(2);
        expect(fakeDb.withTransactionAsync).toHaveBeenCalledTimes(2);
    });
});
