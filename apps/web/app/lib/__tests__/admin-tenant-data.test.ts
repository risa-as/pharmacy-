import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ session: { user: { id: 'platform-user', role: 'SUPER_ADMIN' } } as any,
  db: { user: { findUnique: vi.fn(), count: vi.fn() }, organization: { findMany: vi.fn(), findUnique: vi.fn() }, branch: { findMany: vi.fn() },
    inventory: { count: vi.fn() }, sale: { aggregate: vi.fn(), groupBy: vi.fn() }, paymentTransaction: { findMany: vi.fn() }, subscriptionPlan: { findMany: vi.fn() }, $transaction: vi.fn() } }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('@/app/lib/prisma', () => ({ prisma: state.db }));
import { compactTenants, readTenantDetail } from '../admin-tenant-data';
import { GET, DELETE } from '@/app/api/admin/tenants/[id]/route';
import { GET as list } from '@/app/api/admin/tenants/route';
import { endingSoon, filterTenants, tenantTab, tenantHref } from '../admin-tenants';
const org = { id: 'org-a', name: 'صيدلية الاختبار', planId: 'basic', plan: { id: 'basic', name: 'BASIC', price: 10000, maxBranches: 1, maxUsers: 3, maxDevices: 1, maxMobileUsers: 1 },
  isSuspended: false, isTrial: false, subscriptionEndsAt: new Date('2026-10-10'), aiDailyLimit: 50, prescriptionScanDailyLimit: 20, branches: [{ users: [{ email: 'owner@test.invalid' }] }] };
const ctx = { params: Promise.resolve({ id: org.id }) };
beforeEach(() => {
  vi.resetAllMocks(); state.session = { user: { id: 'platform-user', role: 'SUPER_ADMIN' } };
  state.db.user.findUnique.mockResolvedValue({ isActive: true, role: 'SUPER_ADMIN' });
  state.db.organization.findUnique.mockResolvedValue(org); state.db.organization.findMany.mockResolvedValue([org]);
  state.db.branch.findMany.mockResolvedValue([{ id: 'branch-a' }]); state.db.sale.aggregate.mockResolvedValue({ _count: { _all: 2 }, _sum: { total: 100 }, _max: { createdAt: null } });
  state.db.inventory.count.mockResolvedValue(3); state.db.user.count.mockResolvedValue(1); state.db.paymentTransaction.findMany.mockResolvedValue([]); state.db.subscriptionPlan.findMany.mockResolvedValue([]);
});
describe('tenant directory and lazy detail reads', () => {
  it('directory reads only selected fields and never runs the activity queries', async () => {
    const response = await list(new NextRequest('http://localhost/api/admin/tenants?view=compact'));
    expect(response.status).toBe(200); const data = await response.json();
    expect(data.tenants[0].ownerEmail).toBe('owner@test.invalid'); expect(data.tenants[0]).not.toHaveProperty('branches'); expect(data.tenants[0]).not.toHaveProperty('stats');
    expect(state.db.sale.aggregate).not.toHaveBeenCalled(); expect(state.db.sale.groupBy).not.toHaveBeenCalled(); expect(state.db.inventory.count).not.toHaveBeenCalled(); expect(state.db.paymentTransaction.findMany).not.toHaveBeenCalled();
    expect(state.db.organization.findMany.mock.calls[0][0].select.branches.select.users.select).toEqual({ email: true });
  });
  it.each(['whatsapp', 'settings', 'limits', 'subscription'] as const)('%s does not fetch activity or inactive tab data', async tab => {
    const data = await readTenantDetail(org.id, tab);
    expect(data.tenant.id).toBe(org.id); expect(data.stats).toBeUndefined();
    expect(state.db.sale.aggregate).not.toHaveBeenCalled(); expect(state.db.inventory.count).not.toHaveBeenCalled();
    expect(state.db.paymentTransaction.findMany).toHaveBeenCalledTimes(tab === 'subscription' ? 1 : 0);
    expect(state.db.subscriptionPlan.findMany).toHaveBeenCalledTimes(tab === 'limits' || tab === 'settings' ? 1 : 0);
  });
  it('overview restricts all statistics to branches of the opened organization', async () => {
    const data = await readTenantDetail(org.id, 'overview'); expect(data.stats?.salesTotal).toBe(100);
    expect(state.db.branch.findMany).toHaveBeenCalledWith({ where: { organizationId: org.id }, select: { id: true } });
    for (const query of [state.db.sale.aggregate, state.db.inventory.count, state.db.user.count]) expect(query.mock.calls[0][0].where).toEqual({ branchId: { in: ['branch-a'] } });
    expect(state.db.paymentTransaction.findMany).not.toHaveBeenCalled();
  });
  it('subscription history omits metadata and is scoped and bounded', async () => {
    await readTenantDetail(org.id, 'subscription'); const q = state.db.paymentTransaction.findMany.mock.calls[0][0];
    expect(q.where).toEqual({ organizationId: org.id }); expect(q.take).toBe(50); expect(q.select).not.toHaveProperty('metadata');
  });
  it.each([null, { user: { id: 'platform-user', role: 'ADMIN' } }, { user: { id: 'platform-user', role: 'SUPER_ADMIN' }, error: 'revoked' }])('denies invalid session before reading the organization', async session => {
    state.session = session; expect((await GET(new NextRequest('http://localhost/api/admin/tenants/org-a?tab=whatsapp'), ctx)).status).toBe(session?.user?.role === 'ADMIN' ? 403 : 401);
    expect(state.db.organization.findUnique).not.toHaveBeenCalled();
  });
  it.each([{ isActive: false, role: 'SUPER_ADMIN' }, { isActive: true, role: 'ADMIN' }])('rechecks current admin activation and role', async user => {
    state.db.user.findUnique.mockResolvedValue(user); await expect(compactTenants()).rejects.toMatchObject({ status: 403 }); expect(state.db.organization.findMany).not.toHaveBeenCalled();
  });
  it('invalid tab is rejected and missing organization returns 404', async () => {
    expect((await GET(new NextRequest('http://localhost/api/admin/tenants/org-a?tab=invalid'), ctx)).status).toBe(400);
    state.db.organization.findUnique.mockResolvedValue(null); expect((await GET(new NextRequest('http://localhost/api/admin/tenants/org-a?tab=whatsapp'), ctx)).status).toBe(404);
  });
  it.each([undefined, 'wrong name'])('denies deletion before starting a transaction when name is absent or mismatched', async confirmationName => {
    const r = await DELETE(new NextRequest('http://localhost/api/admin/tenants/org-a', { method: 'DELETE', body: JSON.stringify({ confirmationName }) }), ctx);
    expect(r.status).toBe(409); expect(state.db.$transaction).not.toHaveBeenCalled();
  });
  it('malformed deletion body cannot cause a write', async () => {
    expect((await DELETE(new NextRequest('http://localhost/api/admin/tenants/org-a', { method: 'DELETE', body: '{' }), ctx)).status).toBe(400); expect(state.db.$transaction).not.toHaveBeenCalled();
    expect((await DELETE(new NextRequest('http://localhost/api/admin/tenants/org-a', { method: 'DELETE', body: 'null' }), ctx)).status).toBe(409); expect(state.db.$transaction).not.toHaveBeenCalled();
  });
  it('links, combined filters and seven-day count are deterministic', async () => {
    const [t] = await compactTenants(); expect(tenantHref(t.id, 'whatsapp')).toBe('/dashboard/admin/tenants/org-a?tab=whatsapp'); expect(tenantTab('bogus')).toBe('overview');
    expect(filterTenants([t], 'OWNER@', 'active', 'basic')).toEqual([t]); expect(filterTenants([t], '', 'suspended', 'all')).toEqual([]);
    expect(endingSoon(t, new Date('2026-10-07').getTime())).toBe(true); expect(endingSoon({ ...t, isActive: false }, new Date('2026-10-07').getTime())).toBe(false);
  });
});
