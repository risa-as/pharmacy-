import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
    tenant: vi.fn(), scope: vi.fn(), findInventory: vi.fn(), updateDrugs: vi.fn(), audit: vi.fn(),
    findInventories: vi.fn(), groupSales: vi.fn(), findBatches: vi.fn(),
}));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: m.tenant }));
vi.mock('@/app/lib/supplier-price-history', () => ({ resolveHistoryScope: m.scope }));
vi.mock('@/app/lib/audit', () => ({ logAudit: m.audit }));
vi.mock('@/app/lib/prisma', () => ({
    prisma: {
        inventory: { findFirst: m.findInventory, findMany: m.findInventories },
        saleItem: { groupBy: m.groupSales },
        batch: { findMany: m.findBatches },
        globalDrug: { updateMany: m.updateDrugs },
    },
}));
import { GET, PATCH } from './route';

function tenant(role: string, permissions: Record<string, boolean> = {}) {
    return { user: { id: 'u1', name: 'User', role }, organizationId: 'o1', userPermissions: permissions };
}

function patch(body: unknown) {
    return new NextRequest('http://localhost/api/inventory/pack-units', {
        method: 'PATCH',
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    m.scope.mockResolvedValue({ organizationId: 'o1', branchIds: ['b1'] });
    m.findInventory.mockResolvedValue({
        branchId: 'b1',
        drug: { tradeName: 'Panadol', unitsPerPackConfirmedAt: new Date('2026-09-01T00:00:00Z') },
    });
    m.updateDrugs.mockResolvedValue({ count: 1 });
});

describe('PATCH /api/inventory/pack-units (correct a confirmed pack count)', () => {
    it.each(['PHARMACIST', 'CASHIER', 'SUPER_ADMIN'])('refuses %s, even with canAddDrug granted', async (role) => {
        m.tenant.mockResolvedValue(tenant(role, { canAddDrug: true, canEditDrug: true }));
        const res = await PATCH(patch({ drugId: 'd1', unitsPerPack: 3, expected: 2 }));
        expect(res.status).toBe(403);
        expect(m.updateDrugs).not.toHaveBeenCalled();
    });

    it('lets the pharmacy manager correct, guarded on the value they saw, and audits it', async () => {
        m.tenant.mockResolvedValue(tenant('ADMIN'));
        const res = await PATCH(patch({ drugId: 'd1', unitsPerPack: 3, expected: 2 }));
        expect(res.status).toBe(200);
        expect(m.updateDrugs).toHaveBeenCalledWith({
            where: { id: 'd1', unitsPerPackConfirmedAt: { not: null }, unitsPerPack: 2 },
            data: { unitsPerPack: 3, unitsPerPackConfirmedAt: expect.any(Date) },
        });
        expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'PACK_UNITS_CORRECTION', entityId: 'd1', branchId: 'b1',
        }));
        expect(JSON.parse(m.audit.mock.calls[0][0].details)).toMatchObject({ from: 2, to: 3 });
    });

    it('returns 409 without auditing when the count changed since the page loaded', async () => {
        m.tenant.mockResolvedValue(tenant('ADMIN'));
        m.updateDrugs.mockResolvedValue({ count: 0 });
        const res = await PATCH(patch({ drugId: 'd1', unitsPerPack: 3, expected: 2 }));
        expect(res.status).toBe(409);
        expect(m.audit).not.toHaveBeenCalled();
    });

    it('refuses a drug outside the manager\'s branches', async () => {
        m.tenant.mockResolvedValue(tenant('ADMIN'));
        m.findInventory.mockResolvedValue(null);
        const res = await PATCH(patch({ drugId: 'd9', unitsPerPack: 3, expected: 2 }));
        expect(res.status).toBe(404);
        expect(m.updateDrugs).not.toHaveBeenCalled();
    });

    it.each([
        [{ drugId: 'd1', unitsPerPack: 0, expected: 2 }],
        [{ drugId: 'd1', unitsPerPack: 2.5, expected: 2 }],
        [{ drugId: 'd1', unitsPerPack: 2, expected: 2 }],
        [{ unitsPerPack: 3, expected: 2 }],
    ])('rejects invalid input %j', async (body) => {
        m.tenant.mockResolvedValue(tenant('ADMIN'));
        const res = await PATCH(patch(body));
        expect(res.status).toBe(400);
        expect(m.updateDrugs).not.toHaveBeenCalled();
    });
});

describe('GET /api/inventory/pack-units paging', () => {
    // 250 unconfirmed drugs, drug i sold 1000 - i times, so the order is d0, d1, … d249.
    const inventories = Array.from({ length: 250 }, (_, i) => ({
        price: 1000,
        drug: { id: `d${i}`, barcode: `b${i}`, tradeName: `Drug ${i}`, unitsPerPack: null, unitsPerPackConfirmedAt: null },
        batches: [{ quantity: 1 }],
    }));

    beforeEach(() => {
        m.tenant.mockResolvedValue(tenant('ADMIN'));
        // The list query selects drug rows; the two tab counts select drugId only.
        m.findInventories.mockImplementation(async (args: { select: Record<string, unknown> }) =>
            'drugId' in args.select ? inventories.map((inv) => ({ drugId: inv.drug.id })) : inventories);
        m.groupSales.mockResolvedValue(inventories.map((inv, i) => ({ drugId: inv.drug.id, _sum: { quantity: 1000 - i } })));
        m.findBatches.mockResolvedValue([]);
    });

    it('returns the first 200 by default and the rest from an offset', async () => {
        const first = await (await GET(new NextRequest('http://localhost/api/inventory/pack-units'))).json();
        expect(first.items).toHaveLength(200);
        expect(first.items[0].drugId).toBe('d0');
        expect(first).toMatchObject({ total: 250, offset: 0, pageSize: 200, canCorrect: true });

        const next = await (await GET(new NextRequest('http://localhost/api/inventory/pack-units?offset=200'))).json();
        expect(next.items.map((r: { drugId: string }) => r.drugId)).toEqual(
            Array.from({ length: 50 }, (_, i) => `d${200 + i}`),
        );
        expect(next).toMatchObject({ total: 250, offset: 200 });
    });

    it('treats a bad offset as zero', async () => {
        const res = await (await GET(new NextRequest('http://localhost/api/inventory/pack-units?offset=-5'))).json();
        expect(res.offset).toBe(0);
        expect(res.items[0].drugId).toBe('d0');
    });
});
