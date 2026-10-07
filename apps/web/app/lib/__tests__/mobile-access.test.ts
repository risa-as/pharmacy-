import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ tenant: vi.fn(), features: vi.fn() }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: mocks.tenant }));
vi.mock('@/app/lib/saas-guards', () => ({ getPlanFeatures: mocks.features }));
import { GET } from '../../api/mobile/access/route';
import { NextResponse } from 'next/server';
beforeEach(() => vi.clearAllMocks());
it('reads all feature flags once while preserving independent grants and fresh permissions', async () => {
    mocks.tenant.mockResolvedValue({ organizationId: 'org', user: { role: 'ADMIN', branchId: 'branch' }, userPermissions: { canSell: false } });
    mocks.features.mockResolvedValue({ warehouseManagement: true, interBranchTransfers: false, supplierManagement: true });
    const response = await GET();
    expect(await response.json()).toEqual({ permissions: { canSell: false }, features: { warehouseManagement: true, interBranchTransfers: false, supplierManagement: true }, branchId: 'branch', role: 'ADMIN' });
    expect(mocks.features).toHaveBeenCalledOnce();
    expect(mocks.features).toHaveBeenCalledWith('org');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
it('does not read plan data after access is denied', async () => {
    mocks.tenant.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    expect((await GET()).status).toBe(403);
    expect(mocks.features).not.toHaveBeenCalled();
});
it('preserves the super-admin exception without a plan query', async () => {
    mocks.tenant.mockResolvedValue({ user: { role: 'SUPER_ADMIN' }, userPermissions: {} });
    expect((await (await GET()).json()).features).toEqual({ warehouseManagement: true, interBranchTransfers: true, supplierManagement: true });
    expect(mocks.features).not.toHaveBeenCalled();
});
