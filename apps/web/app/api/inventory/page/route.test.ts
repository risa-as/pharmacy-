import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ tenant: vi.fn(), query: vi.fn(), inventory: vi.fn() }));
vi.mock('@/app/lib/prisma', () => ({ prisma: { $queryRaw: mocks.query, inventory: { findMany: mocks.inventory } } }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: mocks.tenant }));
import { GET } from './route';

const counts = { all: 51, 'low-stock': 0, out: 0, 'near-expiry': 0, expired: 0 };
describe('paginated mobile inventory route', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.tenant.mockResolvedValue({ tenantBranchWhere: { branchId: 'own' }, userPermissions: { canViewInventory: true } });
    });

    it('returns authorization failures without querying inventory', async () => {
        mocks.tenant.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
        expect((await GET(new Request('http://localhost/api/inventory/page'))).status).toBe(401);
        expect(mocks.query).not.toHaveBeenCalled();
    });

    it('returns page items in database order from one tenant-scoped snapshot', async () => {
        const items = ['b', 'a'].map(id => ({ id, drugId: `drug-${id}`, price: 10, quantity: 2, expiryDate: '2027-01-01T00:00:00.000Z' }));
        mocks.query.mockResolvedValue([{ ids: ['b', 'a'], items, total: 51, totalValue: 900, counts }]);
        const response = await GET(new Request('http://localhost/api/inventory/page?branchId=other'));
        const body = await response.json();
        expect(mocks.query).toHaveBeenCalledTimes(1);
        expect(mocks.query.mock.calls[0][0].values).toEqual(expect.arrayContaining(['own', 'other']));
        expect(mocks.inventory).not.toHaveBeenCalled();
        expect(body.items.map((item: { id: string }) => item.id)).toEqual(['b', 'a']);
        expect(body.items[0]).toMatchObject({ quantity: 2, expiryDate: '2027-01-01T00:00:00.000Z' });
        expect(body).toMatchObject({ hasMore: true, total: 51, totalValue: 900, counts });
    });

    it('returns summary on an empty last page without a hydration query', async () => {
        mocks.query.mockResolvedValue([{ ids: [], items: [], total: 51, totalValue: 900, counts }]);
        const body = await (await GET(new Request('http://localhost/api/inventory/page?page=3'))).json();
        expect(body).toMatchObject({ items: [], hasMore: false, page: 3, total: 51 });
        expect(mocks.inventory).not.toHaveBeenCalled();
    });
});
