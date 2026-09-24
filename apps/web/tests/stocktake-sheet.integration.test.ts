// The desktop count sheet in one request (GET /api/inventory/stocktake/:id?type=sheet):
// every batch of the stocktake's branch that holds stock plus the ones already
// counted, never another branch's batches; drafts are deleted (cancelled) only
// while PENDING.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

const state = vi.hoisted(() => ({ db: null as any, session: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { GET, DELETE } from '../app/api/inventory/stocktake/[id]/route';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
let f: any;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (id: string, qs = '') => GET(new NextRequest(`http://localhost/api/inventory/stocktake/${id}${qs}`), params(id));

beforeAll(async () => {
    const org = await db.organization.create({ data: { name: 'ST ' + randomUUID() } });
    const branch = await db.branch.create({ data: { name: 'ST1', organizationId: org.id } });
    const other = await db.branch.create({ data: { name: 'ST2', organizationId: org.id } });
    const user = await db.user.create({ data: { email: `st-${randomUUID()}@test.invalid`, password: 'unused', role: 'PHARMACIST', branchId: branch.id } });
    const drug = await db.globalDrug.create({ data: { barcode: 'ST-' + randomUUID(), tradeName: 'SheetDrug', scientificName: 'S', alternatives: [] } });
    const inv = await db.inventory.create({ data: { branchId: branch.id, drugId: drug.id, price: 10, cost: 5 } });
    const invOther = await db.inventory.create({ data: { branchId: other.id, drugId: drug.id, price: 10, cost: 5 } });
    const exp = new Date(Date.now() + 90 * 86400000);
    const inStock = await db.batch.create({ data: { inventoryId: inv.id, batchNumber: 'A', quantity: 7, initialQuantity: 7, costPrice: 5, expiryDate: exp } });
    const empty = await db.batch.create({ data: { inventoryId: inv.id, batchNumber: 'B', quantity: 0, initialQuantity: 3, costPrice: 5, expiryDate: exp } });
    const countedEmpty = await db.batch.create({ data: { inventoryId: inv.id, batchNumber: 'C', quantity: 0, initialQuantity: 3, costPrice: 5, expiryDate: exp } });
    const foreign = await db.batch.create({ data: { inventoryId: invOther.id, batchNumber: 'D', quantity: 9, initialQuantity: 9, costPrice: 5, expiryDate: exp } });
    const draft = await db.stocktake.create({ data: { branchId: branch.id, userId: user.id, items: { create: { batchId: countedEmpty.id, systemQuantity: 3, actualQuantity: 1, difference: -2, costPrice: 5 } } } });
    const done = await db.stocktake.create({ data: { branchId: branch.id, userId: user.id, status: 'COMPLETED' } });
    f = { user, inStock, empty, countedEmpty, foreign, draft, done };
});
afterAll(() => db.$disconnect());
beforeEach(() => { state.session = { user: { id: f.user.id } }; });

describe('stocktake count sheet', () => {
    it('returns the branch batches in stock plus counted ones, in one response', async () => {
        const body = await (await get(f.draft.id, '?type=sheet')).json();
        const ids = body.sheet.map((b: any) => b.id);
        expect(ids).toContain(f.inStock.id);
        expect(ids).toContain(f.countedEmpty.id);
        expect(ids).not.toContain(f.empty.id);
        expect(ids).not.toContain(f.foreign.id);
        expect(body.sheet[0]).toMatchObject({ quantity: expect.any(Number), costPrice: 5, inventory: { drug: { tradeName: 'SheetDrug' } } });
        expect(body.stocktake.items).toHaveLength(1);
    });

    it('without type=sheet keeps the previous response', async () => {
        const body = await (await get(f.draft.id)).json();
        expect(body.sheet).toBeUndefined();
        expect(body.stocktake.id).toBe(f.draft.id);
    });

    it('deletes (cancels) a draft, and refuses a finished stocktake', async () => {
        const del = (id: string) => DELETE(new NextRequest(`http://localhost/api/inventory/stocktake/${id}`, { method: 'DELETE' }), params(id));
        expect((await del(f.draft.id)).status).toBe(200);
        expect((await db.stocktake.findUnique({ where: { id: f.draft.id } }))?.status).toBe('CANCELLED');
        expect((await del(f.done.id)).status).not.toBe(200);
        expect((await db.stocktake.findUnique({ where: { id: f.done.id } }))?.status).toBe('COMPLETED');
    });
});
