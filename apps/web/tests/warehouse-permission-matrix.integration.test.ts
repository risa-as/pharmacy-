// Warehouse-portal permission matrix (2026-09-27), against the isolated PostgreSQL.
// Only the session identity is mocked: getWarehouseContext and
// requireWarehousePermission run for real and read the account, its warehouse
// and its permission overrides from the database. Each case flips one flag on
// the same account and sends the same request (200 with content, then 403);
// another warehouse's records are requested by id and must not be returned or
// changed; pharmacy and warehouse accounts cannot cross into each other's API.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

const state = vi.hoisted(() => ({ db: null as any, session: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/app/lib/saas-guards', () => ({ checkFeatureAccess: async () => ({ allowed: true }) }));

import { GET as catalog } from '../app/api/warehouse-portal/catalog/route';
import { GET as stock } from '../app/api/warehouse-portal/stock/route';
import { GET as stockMoves } from '../app/api/warehouse-portal/stock/moves/route';
import { GET as customers } from '../app/api/warehouse-portal/customers/route';
import { GET as invoices } from '../app/api/warehouse-portal/invoices/route';
import { GET as purchases } from '../app/api/warehouse-portal/purchases/route';
import { GET as purchase } from '../app/api/warehouse-portal/purchases/[id]/route';
import { GET as suppliers } from '../app/api/warehouse-portal/suppliers/route';
import { PATCH as editSupplier, DELETE as deleteSupplier } from '../app/api/warehouse-portal/suppliers/[id]/route';
import { GET as reps } from '../app/api/warehouse-portal/reps/route';
import { GET as rep } from '../app/api/warehouse-portal/reps/[id]/route';
import { GET as salesReport } from '../app/api/warehouse-portal/reports/sales/route';
import { GET as users } from '../app/api/warehouse-portal/users/route';
import { GET as orders } from '../app/api/warehouse-portal/orders/route';
import { GET as settlements } from '../app/api/warehouse-portal/settlements/route';
import { GET as accountsSummary } from '../app/api/warehouse-portal/accounts/summary/route';
import { GET as pharmacyInventory } from '../app/api/inventory/route';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
const key = randomUUID();
const MARK = 'FOREIGN-WH-' + key;
let f: any;

const get = (path: string) => new NextRequest(`http://localhost${path}`);
const send = (method: string, body: unknown) => new NextRequest('http://localhost/x', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** Sign in as `user`, with these permission overrides saved on the account. */
async function as(user: any, overrides: Record<string, boolean> = {}) {
    await db.user.update({ where: { id: user.id }, data: { permissions: Object.keys(overrides).length ? JSON.stringify(overrides) : null } });
    state.session = { user: { id: user.id, role: user.role, email: user.email } };
}

beforeAll(async () => {
    const mkWarehouse = async (name: string) => {
        const warehouse = await db.warehouse.create({ data: { name, operatingMode: 'FULL' } });
        const owner = await db.user.create({ data: { email: `wh-owner-${randomUUID()}@test.invalid`, password: 'unused', role: 'WAREHOUSE', warehouseId: warehouse.id, warehouseUserType: 'OWNER' } });
        const supplier = await db.warehouseSupplier.create({ data: { warehouseId: warehouse.id, name: 'Supplier ' + name } });
        const purchaseRow = await db.warehousePurchase.create({ data: { warehouseId: warehouse.id, supplierId: supplier.id, invoiceNumber: 'INV-' + name, total: 100 } });
        const repRow = await db.warehouseRep.create({ data: { warehouseId: warehouse.id, name: 'Rep ' + name } });
        const drug = await db.globalDrug.create({ data: { barcode: 'WHPM-' + randomUUID(), tradeName: 'Drug ' + name, scientificName: 'X', alternatives: [] } });
        const item = await db.warehouseCatalogItem.create({ data: { warehouseId: warehouse.id, drugId: drug.id, barcode: drug.barcode, price: 10, costPrice: 5 } });
        return { warehouse, owner, supplier, purchase: purchaseRow, rep: repRow, item };
    };
    const own = await mkWarehouse('Own ' + key);
    const foreign = await mkWarehouse(MARK);
    const org = await db.organization.create({ data: { name: 'WH-PM org ' + key } });
    const branch = await db.branch.create({ data: { name: 'WH-PM branch ' + key, organizationId: org.id } });
    const pharmacyAdmin = await db.user.create({ data: { email: `wh-pm-admin-${randomUUID()}@test.invalid`, password: 'unused', role: 'ADMIN', branchId: branch.id } });
    f = { own, foreign, pharmacyAdmin };
});
afterAll(() => db.$disconnect());
beforeEach(() => as(f.own.owner));

describe.each([
    ['catalog', 'canViewCatalog', () => catalog(get('/api/warehouse-portal/catalog'))],
    ['stock', 'canViewStock', () => stock(get('/api/warehouse-portal/stock'))],
    ['stock/moves', 'canViewStock', () => stockMoves(get(`/api/warehouse-portal/stock/moves?catalogItemId=${f.own.item.id}`))],
    ['customers', 'canViewCustomers', () => customers(get('/api/warehouse-portal/customers'))],
    ['invoices', 'canViewFinance', () => invoices(get('/api/warehouse-portal/invoices'))],
    ['purchases', 'canViewPurchases', () => purchases(get('/api/warehouse-portal/purchases'))],
    ['suppliers', 'canViewPurchases', () => suppliers(get('/api/warehouse-portal/suppliers'))],
    ['reps', 'canViewReps', () => reps(get('/api/warehouse-portal/reps'))],
    ['reports/sales', 'canViewReports', () => salesReport(get('/api/warehouse-portal/reports/sales'))],
    ['users', 'canManageUsers', () => users(get('/api/warehouse-portal/users'))],
    ['orders', 'canViewOrders', () => orders(get('/api/warehouse-portal/orders'))],
    ['settlements', 'canViewFinance', () => settlements(get('/api/warehouse-portal/settlements'))],
    ['accounts/summary', 'canViewFinance', () => accountsSummary(get('/api/warehouse-portal/accounts/summary'))],
] as const)('%s', (_route, flag, call) => {
    it(`is allowed with ${flag} (200, content) and refused (403) without it, never showing another warehouse`, async () => {
        await as(f.own.owner, { [flag]: true });
        const allowed = await call();
        expect(allowed.status).toBe(200);
        const text = await allowed.text();
        expect(text).not.toBe('');
        expect(text).not.toContain(MARK);
        await as(f.own.owner, { [flag]: false });
        expect((await call()).status).toBe(403);
    });
});

describe('records of another warehouse, requested by id', () => {
    it('are not returned', async () => {
        for (const response of [
            await purchase(get('/x'), params(f.foreign.purchase.id)),
            await rep(get('/x'), params(f.foreign.rep.id)),
            await stockMoves(get(`/api/warehouse-portal/stock/moves?catalogItemId=${f.foreign.item.id}`)),
        ]) {
            expect(response.status).toBe(404);
            expect(await response.text()).not.toContain(MARK);
        }
        const ownPurchase = await purchase(get('/x'), params(f.own.purchase.id));
        expect(ownPurchase.status).toBe(200);
        expect(await ownPurchase.text()).toContain('INV-Own ' + key);
    });

    it('are not changed or deleted', async () => {
        expect((await editSupplier(send('PATCH', { name: 'Taken' }), params(f.foreign.supplier.id))).status).toBe(404);
        expect((await deleteSupplier(send('DELETE', {}), params(f.foreign.supplier.id))).status).toBe(404);
        const row = await db.warehouseSupplier.findUnique({ where: { id: f.foreign.supplier.id } });
        expect(row?.name).toBe('Supplier ' + MARK);
    });
});

describe('account boundaries', () => {
    it('refuses a pharmacy account on the warehouse portal, and a warehouse account on the pharmacy API', async () => {
        await as(f.pharmacyAdmin);
        expect((await catalog(get('/api/warehouse-portal/catalog'))).status).toBe(403);
        await as(f.own.owner);
        expect((await pharmacyInventory(get('/api/inventory'))).status).toBe(403);
    });

    it('refuses a deactivated account and an inactive warehouse at once', async () => {
        await db.user.update({ where: { id: f.own.owner.id }, data: { isActive: false } });
        expect((await catalog(get('/api/warehouse-portal/catalog'))).status).toBe(403);
        await db.user.update({ where: { id: f.own.owner.id }, data: { isActive: true } });
        await db.warehouse.update({ where: { id: f.own.warehouse.id }, data: { isActive: false } });
        expect((await catalog(get('/api/warehouse-portal/catalog'))).status).toBe(403);
        await db.warehouse.update({ where: { id: f.own.warehouse.id }, data: { isActive: true } });
        expect((await catalog(get('/api/warehouse-portal/catalog'))).status).toBe(200);
    });
});
