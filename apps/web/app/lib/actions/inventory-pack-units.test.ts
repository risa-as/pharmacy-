import { beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    tenant: vi.fn(), findInventory: vi.fn(), findBranch: vi.fn(), findDrug: vi.fn(),
    updateInventory: vi.fn(), updateDrug: vi.fn(), transaction: vi.fn(), revalidate: vi.fn(),
}));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: m.tenant }));
vi.mock('@/app/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('REDIRECT'); } }));
vi.mock('@/app/lib/prisma', () => ({ prisma: { $transaction: m.transaction } }));
import { updateInventory } from './inventory';

function form(count?: string, drugId = 'd1') {
    const data = new FormData();
    Object.entries({ branchId: 'b1', drugId, price: '1000', cost: '700', minStock: '5', maxStock: '1000' })
        .forEach(([key, value]) => data.set(key, value));
    if (count !== undefined) data.set('unitsPerPack', count);
    return data;
}

beforeEach(() => {
    vi.resetAllMocks();
    m.tenant.mockResolvedValue({ user: { id: 'u1', name: 'User' }, userPermissions: { canEditDrug: true },
        organizationId: 'o1', tenantBranchWhere: { branchId: 'b1' }, branchModelWhere: { id: 'b1' } });
    m.findInventory.mockResolvedValue({ id: 'i1', drugId: 'd1' });
    m.findBranch.mockResolvedValue({ id: 'b1' });
    m.findDrug.mockResolvedValue({ id: 'd2' });
    m.transaction.mockImplementation(fn => fn({
        inventory: { findFirst: m.findInventory, update: m.updateInventory },
        branch: { findFirst: m.findBranch }, globalDrug: { findFirst: m.findDrug, update: m.updateDrug },
    }));
});

it('confirms the existing inventory drug even when absent from the new-drug picker', async () => {
    await expect(updateInventory('i1', {}, form('4'))).rejects.toThrow('REDIRECT');
    expect(m.updateDrug).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { unitsPerPack: 4, unitsPerPackConfirmedAt: expect.any(Date) } });
    expect(m.findDrug).not.toHaveBeenCalled();
    expect(m.revalidate).toHaveBeenCalledWith('/dashboard/inventory/pack-units');
});

it.each([undefined, '', '  '])('preserves previous pack confirmation for blank value %s', async count => {
    await expect(updateInventory('i1', {}, form(count))).rejects.toThrow('REDIRECT');
    expect(m.updateInventory).toHaveBeenCalledOnce();
    expect(m.updateDrug).not.toHaveBeenCalled();
});

it.each(['0', '-1', '2.5', 'abc', '2147483648'])('rejects invalid count %s before writes', async count => {
    const result = await updateInventory('i1', {}, form(count));
    expect(result?.errors?.unitsPerPack).toBeDefined();
    expect(m.transaction).not.toHaveBeenCalled();
});

it('confirms the newly selected drug after checking its scope', async () => {
    await expect(updateInventory('i1', {}, form('3', 'd2'))).rejects.toThrow('REDIRECT');
    expect(m.findDrug).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [
        { warehouseId: null, OR: [{ organizationId: null }, { organizationId: 'o1' }] }, { id: 'd2' },
    ] } }));
    expect(m.updateDrug).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'd2' } }));
});

it.each(['inventory', 'branch', 'drug'])('rejects inaccessible %s before either write', async missing => {
    ({ inventory: m.findInventory, branch: m.findBranch, drug: m.findDrug })[missing].mockResolvedValue(null);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
        expect((await updateInventory('i1', {}, form('3', 'd2')))?.message).toBeTruthy();
        expect(m.updateInventory).not.toHaveBeenCalled();
        expect(m.updateDrug).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
});
