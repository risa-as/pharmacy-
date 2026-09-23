import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock('../store', () => ({ default: { set: h.set, get: vi.fn() } }));
import { recordSyncConflicts } from '../sync-conflicts';

// In-memory stand-in for the local SQLite tables touched by the helper.
function fakeDb() {
    const failures: any[] = [];
    const synced = new Set<string>();
    const tx = {
        syncFailure: {
            findFirst: async ({ where }: any) => failures.find(f => f.entityType === where.entityType && f.entityId === where.entityId) ?? null,
            create: async ({ data }: any) => { failures.push(data); return data; },
        },
    };
    return { failures, synced, db: { $transaction: async (fn: any) => fn(tx) }, mark: async (_tx: any, id: string) => { synced.add(id); } };
}

beforeEach(() => vi.clearAllMocks());

it('moves each refused record to the failures list once and marks it synced so it stops blocking the batch', async () => {
    const f = fakeDb();
    const locals = [{ id: 't1', amount: 5 }, { id: 't2', amount: 7 }];
    const conflicts = [{ id: 't1', message: 'foreign safe' }];
    expect(await recordSyncConflicts(f.db, 'TRANSACTION', locals, conflicts, f.mark)).toBe(1);
    expect(await recordSyncConflicts(f.db, 'TRANSACTION', locals, conflicts, f.mark)).toBe(1);
    expect(f.failures).toEqual([{ entityType: 'TRANSACTION', entityId: 't1', payload: JSON.stringify(locals[0]), errorMessage: 'foreign safe' }]);
    expect([...f.synced]).toEqual(['t1']);
    expect(h.set).toHaveBeenCalledWith('syncFailureFlag', expect.any(Number));
});

it('ignores conflicts for records it did not send and does nothing without conflicts', async () => {
    const f = fakeDb();
    expect(await recordSyncConflicts(f.db, 'SHIFT', [{ id: 's1' }], [{ id: 'other', message: 'x' }], f.mark)).toBe(0);
    expect(await recordSyncConflicts(f.db, 'LOYALTY', [{ id: 'l1' }], undefined, f.mark)).toBe(0);
    expect(f.failures).toEqual([]);
    expect(h.set).not.toHaveBeenCalled();
});
