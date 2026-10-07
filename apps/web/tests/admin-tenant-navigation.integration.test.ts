import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ db: null as any, session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
import { GET, DELETE } from '../app/api/admin/tenants/[id]/route';
import { compactTenants } from '../app/lib/admin-tenant-data';
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } }); state.db = db;
let org: any, other: any, branch: any, otherBranch: any, admin: any, owner: any, otherOwner: any, drug: any, disposable: any, disposableBranch: any, disposableOwner: any;
const marker = randomUUID();
const get = (tab: string, id = org.id) => GET(new NextRequest(`http://localhost/api/admin/tenants/${id}?tab=${tab}`), { params: Promise.resolve({ id }) });
beforeAll(async () => {
  org = await db.organization.create({ data: { name: `NAV-A-${marker}` } }); other = await db.organization.create({ data: { name: `NAV-B-${marker}` } });
  disposable = await db.organization.create({ data: { name: `NAV-EMPTY-${marker}` } });
  disposableBranch = await db.branch.create({ data: { name: 'disposable', organizationId: disposable.id } });
  disposableOwner = await db.user.create({ data: { email: `disposable-${marker}@test.invalid`, password: 'unused', role: 'ADMIN', branchId: disposableBranch.id } });
  branch = await db.branch.create({ data: { name: 'A', organizationId: org.id } }); otherBranch = await db.branch.create({ data: { name: 'B', organizationId: other.id } });
  admin = await db.user.create({ data: { email: `platform-${marker}@test.invalid`, password: 'not-used', role: 'SUPER_ADMIN' } });
  owner = await db.user.create({ data: { email: `owner-${marker}@test.invalid`, password: 'private-fixture-password', role: 'ADMIN', branchId: branch.id } });
  otherOwner = await db.user.create({ data: { email: `other-${marker}@test.invalid`, password: 'not-used', role: 'ADMIN', branchId: otherBranch.id } });
  drug = await db.globalDrug.create({ data: { barcode: `nav-${marker}`, tradeName: 'NAV stock', scientificName: 'test', origin: 'test' } });
  await db.inventory.create({ data: { branchId: branch.id, drugId: drug.id, price: 100, cost: 60 } });
  await db.inventory.create({ data: { branchId: otherBranch.id, drugId: drug.id, price: 900, cost: 600 } });
  await db.sale.create({ data: { branchId: branch.id, userId: owner.id, total: 100 } });
  await db.sale.create({ data: { branchId: otherBranch.id, userId: otherOwner.id, total: 900 } });
  await db.paymentTransaction.create({ data: { organizationId: org.id, amount: 10000, gateway: 'MANUAL', status: 'COMPLETED', metadata: { private: 'must-not-be-returned' } } });
  await db.paymentTransaction.create({ data: { organizationId: other.id, amount: 99999, gateway: 'MANUAL', status: 'COMPLETED' } });
  state.session = { user: { id: admin.id, role: 'SUPER_ADMIN' } };
});
afterAll(async () => {
  const ids = [org?.id, other?.id, disposable?.id].filter(Boolean), branches = [branch?.id, otherBranch?.id, disposableBranch?.id].filter(Boolean);
  await db.paymentTransaction.deleteMany({ where: { organizationId: { in: ids } } });
  await db.sale.deleteMany({ where: { branchId: { in: branches } } });
  await db.inventory.deleteMany({ where: { branchId: { in: branches } } });
  await db.user.deleteMany({ where: { id: { in: [admin?.id, owner?.id, otherOwner?.id, disposableOwner?.id].filter(Boolean) } } });
  await db.branch.deleteMany({ where: { id: { in: branches } } });
  await db.organization.deleteMany({ where: { id: { in: ids } } });
  if (drug) await db.globalDrug.delete({ where: { id: drug.id } }); await db.$disconnect();
});
it('compact directory returns no passwords, user objects or aggregate fields', async () => {
  const rows = await compactTenants(), t = rows.find(t => t.id === org.id)!;
  expect(t.ownerEmail).toBe(owner.email); expect(t).not.toHaveProperty('stats'); expect(JSON.stringify(rows)).not.toContain('private-fixture-password'); expect(t).not.toHaveProperty('branches');
});
it('overview excludes foreign sales and inventory', async () => {
  const r = await get('overview'); expect(r.status).toBe(200); const data = await r.json();
  expect(data.stats).toMatchObject({ branchCount: 1, userCount: 1, productCount: 1, salesCount: 1, salesTotal: 100 }); expect(data).not.toHaveProperty('payments');
});
it('subscription reads only its payments and does not expose metadata', async () => {
  const data = await (await get('subscription')).json(); expect(data.payments).toHaveLength(1); expect(data.payments[0].amount).toBe(10000);
  expect(JSON.stringify(data)).not.toContain('must-not-be-returned'); expect(data).not.toHaveProperty('stats');
});
it('whatsapp details do not eagerly load activity, payments or plans', async () => {
  const data = await (await get('whatsapp')).json(); expect(Object.keys(data)).toEqual(['tenant']);
});
it('revoked admin claims are rejected using the current database role', async () => {
  await db.user.update({ where: { id: admin.id }, data: { isActive: false } });
  expect((await get('overview')).status).toBe(403);
  await db.user.update({ where: { id: admin.id }, data: { isActive: true } });
});
it('wrong delete confirmation leaves the organization and balances intact', async () => {
  const r = await DELETE(new NextRequest(`http://localhost/api/admin/tenants/${org.id}`, { method: 'DELETE', body: JSON.stringify({ confirmationName: 'wrong' }) }), { params: Promise.resolve({ id: org.id }) });
  expect(r.status).toBe(409); expect(await db.organization.count({ where: { id: org.id } })).toBe(1); expect(await db.sale.count({ where: { branchId: branch.id } })).toBe(1);
});
it('rename after confirmation rolls back related deletions', async () => {
  const original = db.organization.findUnique.bind(db.organization);
  const spy = vi.spyOn(db.organization, 'findUnique').mockImplementation(async (args: any) => {
    const row = await original(args);
    if (args.where.id === disposable.id && args.include?.branches) {
      await db.organization.update({ where: { id: disposable.id }, data: { name: `${disposable.name}-renamed` } });
    }
    return row as any;
  });
  try {
    const r = await DELETE(new NextRequest(`http://localhost/api/admin/tenants/${disposable.id}`, { method: 'DELETE', body: JSON.stringify({ confirmationName: disposable.name }) }), { params: Promise.resolve({ id: disposable.id }) });
    expect(r.status).toBe(409);
    expect(await db.organization.count({ where: { id: disposable.id } })).toBe(1);
    expect(await db.user.count({ where: { id: disposableOwner.id } })).toBe(1);
    expect(await db.branch.count({ where: { id: disposableBranch.id } })).toBe(1);
  } finally {
    spy.mockRestore();
    await db.organization.update({ where: { id: disposable.id }, data: { name: disposable.name } });
  }
});
it('exact confirmation permits deleting only the disposable empty fixture', async () => {
  const r = await DELETE(new NextRequest(`http://localhost/api/admin/tenants/${disposable.id}`, { method: 'DELETE', body: JSON.stringify({ confirmationName: disposable.name }) }), { params: Promise.resolve({ id: disposable.id }) });
  expect(r.status).toBe(200); expect(await db.organization.count({ where: { id: disposable.id } })).toBe(0); expect(await db.organization.count({ where: { id: org.id } })).toBe(1);
});
