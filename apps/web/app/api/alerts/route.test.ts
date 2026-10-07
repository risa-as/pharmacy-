import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ tenant: vi.fn(), batches: vi.fn(), inventories: vi.fn() }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: mocks.tenant }));
vi.mock('@/app/lib/prisma', () => ({ prisma: { batch: { findMany: mocks.batches }, inventory: { findMany: mocks.inventories } } }));
import { GET } from './route';
describe('mobile stock alerts', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.tenant.mockResolvedValue({ tenantBranchWhere: { branchId: 'own' } });
        mocks.batches.mockResolvedValue([]); mocks.inventories.mockResolvedValue([]);
    });
    it('starts both independent reads before waiting for either and preserves all alert types', async () => {
        let finish!: (rows: unknown[]) => void;
        mocks.batches.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        mocks.inventories.mockResolvedValue([
            { id: 'empty', drugId: 'empty-drug', minStock: 5, batches: [], drug: { tradeName: 'empty' }, branch: { name: 'own' } },
            { id: 'low', drugId: 'low-drug', minStock: 5, batches: [{ quantity: 2 }], drug: { tradeName: 'low' }, branch: { name: 'own' } },
            { id: 'equal', minStock: 5, batches: [{ quantity: 5 }], drug: { tradeName: 'equal' }, branch: { name: 'own' } },
        ]);
        const pending = GET(new Request('http://localhost/api/alerts'));
        await vi.waitFor(() => expect(mocks.inventories).toHaveBeenCalledOnce());
        finish([{ id: 'expired', quantity: 3, expiryDate: new Date('2020-01-01'), inventory: { drugId: 'expired-drug', drug: { tradeName: 'expired' }, branch: { name: 'own' } } }]);
        const response = await pending;
        expect(response.status).toBe(200);
        const alerts = await response.json();
        expect(alerts.map((a: { type: string }) => a.type)).toEqual(['OUT_OF_STOCK', 'EXPIRED', 'LOW_STOCK']);
        expect(alerts.find((a: { type: string }) => a.type === 'LOW_STOCK').description).toContain('2');
    });
    it('intersects a requested foreign branch with the tenant in both reads', async () => {
        await GET(new Request('http://localhost/api/alerts?branchId=foreign'));
        const scope = { AND: [{ branchId: 'own' }, { branchId: 'foreign' }] };
        expect(mocks.batches.mock.calls[0][0].where.inventory).toEqual(scope);
        expect(mocks.inventories.mock.calls[0][0].where).toEqual(scope);
    });
    it('rejects unauthenticated callers before any database query', async () => {
        mocks.tenant.mockResolvedValue(NextResponse.json({}, { status: 401 }));
        expect((await GET(new Request('http://localhost/api/alerts'))).status).toBe(401);
        expect(mocks.batches).not.toHaveBeenCalled(); expect(mocks.inventories).not.toHaveBeenCalled();
    });
});
