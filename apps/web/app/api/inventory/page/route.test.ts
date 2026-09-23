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

    it('hydrates only selected ids with tenant intersection and preserves database order', async () => {
        mocks.query.mockResolvedValue([{ ids: ['b', 'a'], total: 51, totalValue: 900, counts }]);
        mocks.inventory.mockResolvedValue(['a', 'b'].map(id => ({
            id, drugId: `drug-${id}`, price: 10, minStock: 5, branchId: 'own',
            drug: { tradeName: id, barcode: id, scientificName: null, isQuickSale: false },
            batches: [{ quantity: 2, expiryDate: new Date('2027-01-01') }, { quantity: 0, expiryDate: new Date('2020-01-01') }],
        })));
        const response = await GET(new Request('http://localhost/api/inventory/page?branchId=other'));
        const body = await response.json();
        expect(mocks.inventory.mock.calls[0][0].where).toEqual({
            AND: [{ branchId: 'own' }, { branchId: 'other' }, { id: { in: ['b', 'a'] } }],
        });
        expect(body.items.map((item: { id: string }) => item.id)).toEqual(['b', 'a']);
        expect(body.items[0]).toMatchObject({ quantity: 2, expiryDate: '2027-01-01T00:00:00.000Z' });
        expect(body).toMatchObject({ hasMore: true, total: 51, totalValue: 900, counts });
    });

    it('returns summary on an empty last page without a hydration query', async () => {
        mocks.query.mockResolvedValue([{ ids: [], total: 51, totalValue: 900, counts }]);
        const body = await (await GET(new Request('http://localhost/api/inventory/page?page=3'))).json();
        expect(body).toMatchObject({ items: [], hasMore: false, page: 3, total: 51 });
        expect(mocks.inventory).not.toHaveBeenCalled();
    });
});
