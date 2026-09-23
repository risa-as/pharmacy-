import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sync: vi.fn(), scope: vi.fn(), find: vi.fn(), update: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/lib/sync-auth', async (importActual) => ({
    ...(await importActual<typeof import('@/app/lib/sync-auth')>()),
    validateSyncUser: mocks.sync,
    isBranchInSyncScope: mocks.scope,
}));
vi.mock('@/app/lib/audit', () => ({ logAudit: vi.fn(), resolveUserName: vi.fn() }));
vi.mock('@/app/lib/prisma', () => {
    const tx = { inventory: { findUnique: mocks.find, findFirst: vi.fn(), update: mocks.update } };
    return { prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } };
});
import { POST } from './route';

// PHARMACIST defaults: canEditDrug true, canEditPrice false.
const pharmacist = { id: 'u1', role: 'PHARMACIST', branchId: 'b1', organizationId: 'o', permissions: null };
const update = (body: object) => POST(new Request('http://localhost/api/inventory/update-item', { method: 'POST', body: JSON.stringify({ inventoryId: 'i1', ...body }) }));

describe('desktop inventory update permissions (N02)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.sync.mockResolvedValue(pharmacist);
        mocks.scope.mockResolvedValue(true);
        mocks.find.mockResolvedValue({ id: 'i1', branchId: 'b1', price: 1000, cost: 700, minStock: 5 });
        mocks.update.mockImplementation(async ({ data }: any) => ({ id: 'i1', branchId: 'b1', ...data }));
    });

    it('lets a pharmacist change min stock while the desktop resends the unchanged price', async () => {
        const res = await update({ price: 1000, costPrice: 700, minStock: 10 });
        expect(res.status).toBe(200);
        expect(mocks.update).toHaveBeenCalled();
    });

    it('rejects an actual price change without canEditPrice', async () => {
        expect((await update({ price: 1200, costPrice: 700, minStock: 5 })).status).toBe(403);
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('rejects any edit without canEditDrug', async () => {
        mocks.sync.mockResolvedValue({ ...pharmacist, role: 'CASHIER' });
        expect((await update({ minStock: 10 })).status).toBe(403);
        expect(mocks.find).not.toHaveBeenCalled();
    });
});
