import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ tenant: vi.fn(), sync: vi.fn(), branches: vi.fn() }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: mocks.tenant }));
vi.mock('@/app/lib/sync-auth', () => ({ validateSyncUser: mocks.sync }));
vi.mock('@/app/lib/prisma', () => ({ prisma: { branch: { findMany: mocks.branches } } }));
import { GET } from './route';

const unauth = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const get = (qs = '') => GET(new NextRequest(`http://localhost/api/branches${qs}`));

describe('branches route (N04)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.branches.mockResolvedValue([{ id: 'b1', name: 'A', organizationId: 'orgA' }]);
    });

    it('rejects a caller who only knows a branch id', async () => {
        mocks.tenant.mockResolvedValue(unauth());
        mocks.sync.mockResolvedValue(unauth());
        expect((await get('?branchId=b1')).status).toBe(401);
        expect(mocks.branches).not.toHaveBeenCalled();
    });

    it('serves an authenticated desktop device from its own organization, ignoring the query branch', async () => {
        mocks.tenant.mockResolvedValue(unauth());
        mocks.sync.mockResolvedValue({ id: 'lic', role: 'DEVICE', branchId: 'b1', organizationId: 'orgA' });
        const res = await get('?branchId=other-org-branch');
        expect(res.status).toBe(200);
        expect(mocks.branches.mock.calls[0][0].where).toEqual({ organizationId: 'orgA' });
    });

    it('scopes web callers by tenant and never marks the response publicly cacheable', async () => {
        mocks.tenant.mockResolvedValue({ branchModelWhere: { organizationId: 'orgA' } });
        const res = await get();
        expect(mocks.branches.mock.calls[0][0].where).toEqual({ organizationId: 'orgA' });
        expect(res.headers.get('Cache-Control')).toBe('private, no-store');
        expect(mocks.sync).not.toHaveBeenCalled();
    });
});
