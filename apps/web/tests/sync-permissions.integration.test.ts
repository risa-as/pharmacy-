// Round 2026-09-23 (N02-R): desktop sync enforces the operator's CURRENT granular
// permissions; refusals come back as review conflicts and write nothing.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

const state = vi.hoisted(() => ({ db: null as any, session: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('@/app/lib/audit', () => ({ logAudit: vi.fn(), resolveUserName: vi.fn() }));

import { POST as syncSales } from '../app/api/sync/sales/route';
import { POST as syncDebts } from '../app/api/sync/debt-payments/route';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
let f: any;
const post = (path: string, body: unknown) => new NextRequest(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const sale = (userId: string, over: object = {}) => ({
    id: randomUUID(), total: 100, discount: 0, createdAt: new Date().toISOString(), userId, paymentMethod: 'CASH',
    items: [{ drugId: f.drug.id, quantity: 1, price: 100, originalPrice: 100 }], ...over,
});

beforeAll(async () => {
    const key = randomUUID();
    const org = await db.organization.create({ data: { name: 'S ' + key } });
    const branch = await db.branch.create({ data: { name: 'S1 ' + key, organizationId: org.id } });
    const mk = (role: string, permissions: object | null = null, isActive = true) => db.user.create({ data: {
        email: `${role}-${randomUUID()}@test.invalid`, password: 'unused', role, branchId: branch.id, isActive,
        permissions: permissions ? JSON.stringify(permissions) : null } });
    const admin = await mk('ADMIN');
    const cashier = await mk('CASHIER');
    const noSell = await mk('CASHIER', { canSell: false });
    const disabled = await mk('CASHIER', null, false);
    const noDebt = await mk('PHARMACIST', { canPayDebt: false });
    const drug = await db.globalDrug.create({ data: { barcode: 'SYNC-' + key, tradeName: 'SyncDrug', scientificName: 'S', alternatives: [] } });
    const inv = await db.inventory.create({ data: { branchId: branch.id, drugId: drug.id, price: 100, cost: 60 } });
    await db.batch.create({ data: { inventoryId: inv.id, batchNumber: 'S', quantity: 100, initialQuantity: 100, costPrice: 60, expiryDate: new Date(Date.now() + 365 * 86400000) } });
    const patient = await db.patient.create({ data: { name: 'P', phone: key, branchId: branch.id, balance: 500 } });
    const creditSale = await db.sale.create({ data: { branchId: branch.id, userId: admin.id, patientId: patient.id, total: 500 } });
    f = { branch, admin, cashier, noSell, disabled, noDebt, drug, patient, creditSale };
});
afterAll(() => db.$disconnect());
// The desktop session belongs to the branch admin; each sale names its own cashier.
beforeEach(() => { state.session = { user: { id: f.admin.id } }; });

describe('sync/sales: operator permissions at sync time', () => {
    it('accepts a sale rung by a cashier who may sell', async () => {
        const s = sale(f.cashier.id);
        const body = await (await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [s] }))).json();
        expect(body.syncedIds).toEqual([s.id]);
    });

    it('turns sales by a revoked, disabled, or foreign operator into conflicts and writes nothing', async () => {
        const cases = [sale(f.noSell.id), sale(f.disabled.id), sale(randomUUID())];
        const body = await (await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: cases }))).json();
        expect(body.syncedIds).toEqual([]);
        expect(body.conflicts.map((c: any) => c.id).sort()).toEqual(cases.map(c => c.id).sort());
        expect(await db.sale.count({ where: { id: { in: cases.map(c => c.id) } } })).toBe(0);
    });

    it('refuses a discount or an unauthorised price change by a plain cashier', async () => {
        const discounted = sale(f.cashier.id, { total: 90, discount: 10 });
        const repriced = sale(f.cashier.id, { total: 150, items: [{ drugId: f.drug.id, quantity: 1, price: 150, originalPrice: 100 }] });
        const body = await (await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [discounted, repriced] }))).json();
        expect(body.conflicts).toHaveLength(2);
        expect(await db.sale.count({ where: { id: { in: [discounted.id, repriced.id] } } })).toBe(0);
    });
});

describe('operator impersonation: a restricted session cannot borrow a permitted id', () => {
    it('a cashier session without canSell naming the admin as operator is refused', async () => {
        state.session = { user: { id: f.noSell.id } };
        const s = sale(f.admin.id);
        const body = await (await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [s] }))).json();
        expect(body.syncedIds).toEqual([]);
        expect(body.conflicts.map((c: any) => c.id)).toEqual([s.id]);
        expect(await db.sale.count({ where: { id: s.id } })).toBe(0);
    });

    it('a session without canPayDebt naming the admin as collector is refused', async () => {
        state.session = { user: { id: f.noDebt.id } };
        const p = { id: randomUUID(), saleId: f.creditSale.id, userId: f.admin.id, amount: 10, method: 'CASH', createdAt: new Date().toISOString() };
        const before = (await db.patient.findUnique({ where: { id: f.patient.id } }))!.balance;
        const body = await (await syncDebts(post('/api/sync/debt-payments', { branchId: f.branch.id, payments: [p] }))).json();
        expect(body.syncedIds).toEqual([]);
        expect(body.conflicts).toHaveLength(1);
        expect((await db.patient.findUnique({ where: { id: f.patient.id } }))!.balance).toBe(before);
    });

    it('a shared POS still works: a permitted session submits another permitted cashier\'s sale', async () => {
        state.session = { user: { id: f.cashier.id } };
        const other = await db.user.create({ data: { email: `c2-${randomUUID()}@test.invalid`, password: 'unused', role: 'CASHIER', branchId: f.branch.id } });
        const s = sale(other.id);
        const body = await (await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [s] }))).json();
        expect(body.syncedIds).toEqual([s.id]);
    });
});

describe('sync/debt-payments: canPayDebt and amount validation', () => {
    const payment = (userId: string, amount: number) => ({ id: randomUUID(), saleId: f.creditSale.id, userId, amount, method: 'CASH', createdAt: new Date().toISOString() });

    it('refuses a revoked collector and a non-positive amount without touching the balance', async () => {
        const revoked = payment(f.noDebt.id, 50);
        const negative = payment(f.admin.id, -200);
        const body = await (await syncDebts(post('/api/sync/debt-payments', { branchId: f.branch.id, payments: [revoked, negative] }))).json();
        expect(body.syncedIds).toEqual([]);
        expect(body.conflicts).toHaveLength(2);
        expect((await db.patient.findUnique({ where: { id: f.patient.id } }))!.balance).toBe(500);
    });

    it('applies a valid payment by a permitted collector', async () => {
        const ok = payment(f.admin.id, 50);
        const body = await (await syncDebts(post('/api/sync/debt-payments', { branchId: f.branch.id, payments: [ok] }))).json();
        expect(body.syncedIds).toEqual([ok.id]);
        expect((await db.patient.findUnique({ where: { id: f.patient.id } }))!.balance).toBe(450);
    });
});
