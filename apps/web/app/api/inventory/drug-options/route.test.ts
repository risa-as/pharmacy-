import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ ctx: vi.fn(), drugs: vi.fn(), branch: vi.fn(), inventory: vi.fn() }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: mocks.ctx }));
vi.mock('@/app/lib/prisma', () => ({ prisma: {
    globalDrug: { findMany: mocks.drugs },
    branch: { findFirst: mocks.branch },
    inventory: { findMany: mocks.inventory },
} }));
import { GET } from './route';

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/inventory/drug-options?${qs}`));
const drug = (id: string, tradeName: string) => ({ id, tradeName, scientificName: '', barcode: id, origin: null });
const ctx = (canAddDrug = true) => ({ organizationId: 'o1', branchModelWhere: { organizationId: 'o1' }, userPermissions: { canAddDrug } });

describe('inventory drug-options', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.ctx.mockResolvedValue(ctx());
        mocks.drugs.mockResolvedValue([]);
        mocks.inventory.mockResolvedValue([]);
    });

    it('refuses users who may not add drugs', async () => {
        mocks.ctx.mockResolvedValue(ctx(false));
        expect((await get('query=pan')).status).toBe(403);
        expect(mocks.drugs).not.toHaveBeenCalled();
    });

    it('does not search for fewer than two characters', async () => {
        expect(await (await get('query=p')).json()).toEqual({ items: [] });
        expect(mocks.drugs).not.toHaveBeenCalled();
    });

    it('puts the exact barcode, then name prefixes, first and drops duplicates', async () => {
        mocks.drugs
            .mockResolvedValueOnce([drug('b', 'Zinc')])
            .mockResolvedValueOnce([drug('a', 'Panadol')])
            .mockResolvedValueOnce([drug('c', 'Apanol'), drug('a', 'Panadol'), drug('b', 'Zinc')]);
        const { items } = await (await get('query=pan')).json();
        expect(items.map((d: { id: string }) => d.id)).toEqual(['b', 'a', 'c']);
    });

    it('marks stock only for a branch inside the caller scope', async () => {
        mocks.drugs.mockResolvedValue([drug('a', 'Panadol')]);
        mocks.branch.mockResolvedValue(null);
        const foreign = await (await get('query=pan&branchId=other')).json();
        expect(foreign.items[0].inBranch).toBe(false);
        expect(mocks.inventory).not.toHaveBeenCalled();
        expect(mocks.branch.mock.calls[0][0].where.AND).toContainEqual({ organizationId: 'o1' });

        mocks.branch.mockResolvedValue({ id: 'b1' });
        mocks.inventory.mockResolvedValue([{ drugId: 'a' }]);
        const own = await (await get('query=pan&branchId=b1')).json();
        expect(own.items[0].inBranch).toBe(true);
    });
});
