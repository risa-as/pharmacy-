// The pending-aware stock snapshot (POST /api/sync/products): quantities and the
// pending operations already applied come from one read, and only this branch's
// operations count as applied.
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

const state = vi.hoisted(() => ({ db: null as any, session: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));

import { GET, POST } from '../app/api/sync/products/route';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
let f: any;

beforeAll(async () => {
    const key = randomUUID();
    const org = await db.organization.create({ data: { name: 'Stock ' + key } });
    const branch = await db.branch.create({ data: { name: 'S ' + key, organizationId: org.id } });
    const other = await db.branch.create({ data: { name: 'O ' + key, organizationId: org.id } });
    const admin = await db.user.create({ data: { email: `stock-${key}@test.invalid`, password: 'unused', role: 'ADMIN', branchId: branch.id } });
    const drug = await db.globalDrug.create({ data: { barcode: 'STK-' + key, tradeName: 'Stock drug', scientificName: 'S', alternatives: [] } });
    const inv = await db.inventory.create({ data: { branchId: branch.id, drugId: drug.id, price: 10, cost: 5 } });
    const batch = await db.batch.create({ data: { inventoryId: inv.id, batchNumber: 'B', quantity: 20, initialQuantity: 20, costPrice: 5, expiryDate: new Date('2030-01-01') } });
    const saved = await db.sale.create({ data: { branchId: branch.id, total: 10 } });
    const foreign = await db.sale.create({ data: { branchId: other.id, total: 10 } });
    f = { branch, admin, drug, batch, saved, foreign };
});
afterAll(() => db.$disconnect());
beforeEach(() => { state.session = { user: { id: f.admin.id } }; });

const post = (body: unknown) => POST(new NextRequest('http://localhost/api/sync/products', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
}));

it('returns the quantities and which pending sales this branch already applied, in one response', async () => {
    const unknown = randomUUID();
    const body = await (await post({ branchId: f.branch.id, pendingSaleIds: [f.saved.id, f.foreign.id, unknown], pendingReturnIds: [] })).json();
    expect(body.applied.saleIds).toEqual([f.saved.id]); // another branch's sale is never "applied" here
    expect(body.applied.returnIds).toEqual([]);
    const drug = body.drugs.find((d: any) => d.id === f.drug.id);
    expect(drug.batches.find((b: any) => b.id === f.batch.id).quantity).toBe(20);
});

it('keeps GET unchanged for older desktops', async () => {
    const response = await GET(new NextRequest(`http://localhost/api/sync/products?branchId=${f.branch.id}`));
    const body = await response.json();
    expect(body.applied).toBeUndefined();
    expect(body.drugs.find((d: any) => d.id === f.drug.id).stock).toBe(20);
    expect(response.headers.get('etag')).toBeTruthy();
});

it('refuses another organisation\'s branch and an oversized id list', async () => {
    const outsider = await db.organization.create({ data: { name: 'X ' + randomUUID() } });
    const foreignBranch = await db.branch.create({ data: { name: 'X', organizationId: outsider.id } });
    expect((await post({ branchId: foreignBranch.id, pendingSaleIds: [] })).status).toBe(403);
    expect((await post({ branchId: f.branch.id, pendingSaleIds: Array.from({ length: 2001 }, () => randomUUID()) })).status).toBe(400);
});
