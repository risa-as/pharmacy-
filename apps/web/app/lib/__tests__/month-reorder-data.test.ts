import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ branch: { findFirst: vi.fn() }, inventory: { findMany: vi.fn() }, saleItem: { groupBy: vi.fn() }, saleReturnItem: { groupBy: vi.fn() }, warehouseOrder: { findMany: vi.fn() }, purchase: { findMany: vi.fn() } }));
vi.mock('@/app/lib/prisma', () => ({ prisma: db }));
import { getPlanningData } from '../smart-purchasing-data';
const ctx = { branchModelWhere: { organizationId: 'org-a' }, tenantBranchWhere: { branch: { organizationId: 'org-a' } }, userPermissions: { canViewInventory: true, canViewSales: true } } as any;
beforeEach(() => {
    vi.clearAllMocks(); db.branch.findFirst.mockResolvedValue({ id: 'a' });
    for (const model of [db.inventory, db.warehouseOrder, db.purchase]) model.findMany.mockResolvedValue([]);
    db.saleItem.groupBy.mockResolvedValue([]); db.saleReturnItem.groupBy.mockResolvedValue([]);
});
it('queries only the current Baghdad month up to now and keeps tenant and branch scope', async () => {
    const now = new Date('2026-09-30T21:30:00Z');
    db.inventory.findMany.mockResolvedValue([{ id: 'i', branchId: 'a', drugId: 'd', createdAt: now, branch: { name: 'A' }, drug: {}, batches: [] }]);
    const data = await getPlanningData(ctx, 'a', undefined, undefined, { currentMonth: true, now });
    expect([data.from, data.to, data.days]).toEqual(['2026-10-01', '2026-10-01', 1]);
    const scope = { AND: [ctx.tenantBranchWhere, { branchId: 'a' }] };
    expect(db.saleItem.groupBy.mock.calls[0][0].where.sale).toEqual({ AND: [scope, { branchId: 'a', createdAt: { gte: new Date('2026-09-30T21:00:00Z'), lt: now } }] });
    expect(db.inventory.findMany.mock.calls[0][0].where).toEqual(scope);
    expect(db.saleReturnItem.groupBy.mock.calls[0][0].where.saleReturn.AND[0]).toEqual(scope);
});
it('uses actual sales and returns for a first-day item without a zero denominator', async () => {
    db.inventory.findMany.mockResolvedValue([{ id: 'i', branchId: 'a', drugId: 'd', createdAt: new Date('2026-09-30T21:00:00Z'), branch: { name: 'A' }, drug: { tradeName: 'D', barcode: '1', unitsPerPack: 12, unitsPerPackConfirmedAt: new Date() }, batches: [], cost: 5, minStock: 0, maxStock: 0 }]);
    db.saleItem.groupBy.mockResolvedValue([{ drugId: 'd', _sum: { quantity: 4 } }]);
    db.saleReturnItem.groupBy.mockResolvedValue([{ drugId: 'd', _sum: { quantity: 1 } }]);
    const data = await getPlanningData(ctx, 'a', undefined, undefined, { currentMonth: true, now: new Date('2026-09-30T21:30:00Z') });
    expect(data.rows[0]).toMatchObject({ sold: 4, returned: 1, observedDays: 1 });
});
it('rejects an out-of-scope branch before reading business data', async () => {
    db.branch.findFirst.mockResolvedValue(null);
    await expect(getPlanningData(ctx, 'foreign', undefined, undefined, { currentMonth: true })).rejects.toThrow('خارج نطاق');
    expect(db.inventory.findMany).not.toHaveBeenCalled();
});
it('leaves the existing default analysis at 30 completed days', async () => {
    const data = await getPlanningData(ctx, 'a', undefined, undefined, { now: new Date('2026-09-20T09:00:00Z') });
    expect(data.days).toBe(30); expect(data.to).toBe('2026-09-19');
});
