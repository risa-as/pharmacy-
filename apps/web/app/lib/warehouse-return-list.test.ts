import { beforeEach, expect, it, vi } from 'vitest';
const query = vi.hoisted(() => vi.fn());
vi.mock('./prisma', () => ({ prisma: { $queryRaw: query } }));
import { listPharmacyReturns } from './warehouse-return-list';
beforeEach(() => { query.mockReset(); query.mockResolvedValue([]); });
it.each([{ role: 'WAREHOUSE', branchId: 'b1' }, { role: 'ADMIN' }, { role: 'PHARMACIST' }])('fails closed for invalid identity %j', async identity => {
    await expect(listPharmacyReturns(identity, new URLSearchParams())).rejects.toThrow('Forbidden');
    expect(query).not.toHaveBeenCalled();
});
it('keeps both queries scoped to the staff branch even with another branch requested', async () => {
    await listPharmacyReturns({ role: 'PHARMACIST', branchId: 'mine' }, new URLSearchParams({ branchId: 'other', returnStatus: 'REJECTED', page: '2' }));
    for (const [sql] of query.mock.calls) {
        expect(sql.sql).toContain('o."branchId" = ?');
        expect(sql.values).toEqual(expect.arrayContaining(['mine', 'other']));
    }
    expect(query.mock.calls[0][0].values).toEqual(expect.arrayContaining(['REJECTED', 25]));
    expect(query.mock.calls[1][0].values).not.toContain('REJECTED');
});
it('uses organization scope for managers and binds escaped search as data', async () => {
    await listPharmacyReturns({ role: 'MANAGER', organizationId: 'org1' }, new URLSearchParams({ search: "50%_' OR TRUE--" }));
    for (const [sql] of query.mock.calls) {
        expect(sql.sql).toContain('b."organizationId" = ?');
        expect(sql.values).toContain('org1');
        expect(sql.values).toContain("%50\\%\\_' OR TRUE--%");
        expect(sql.sql).not.toContain('OR TRUE--');
    }
});
it('paginates return records, not original orders, and supplies status totals', async () => {
    query.mockResolvedValueOnce(Array.from({ length: 26 }, (_, id) => ({ id }))).mockResolvedValueOnce([{ status: 'PENDING', count: 30 }]);
    const result = await listPharmacyReturns({ role: 'SUPER_ADMIN' }, new URLSearchParams());
    expect(result.returns).toHaveLength(25);
    expect(result.hasMore).toBe(true);
    expect(result.counts).toEqual({ PENDING: 30 });
    expect(query.mock.calls[0][0].sql).toContain('FROM "WarehouseReturn" r JOIN "WarehouseOrder"');
});
it('rejects invalid status before querying', async () => {
    await expect(listPharmacyReturns({ role: 'SUPER_ADMIN' }, new URLSearchParams({ returnStatus: 'SHIPPED' }))).rejects.toThrow('INVALID_STATUS');
    expect(query).not.toHaveBeenCalled();
});
