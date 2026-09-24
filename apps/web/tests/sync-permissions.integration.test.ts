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
    it('does not trust originalPrice when branch inventory is missing', async () => {
        const drug = await db.globalDrug.create({ data: { barcode: randomUUID(), tradeName: 'No branch inventory', scientificName: 'Test', alternatives: [] } });
        const s = sale(f.cashier.id, { items: [{ drugId: drug.id, quantity: 1, price: 100, originalPrice: 100 }] });
        const body = await (await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [s] }))).json();
        expect(body.syncedIds).toEqual([]);
        expect(body.conflicts).toHaveLength(1);
        expect(body.conflicts[0].message).toContain('سعر الصنف غير متاح');
        expect(await db.sale.count({ where: { id: s.id } })).toBe(0);
    });
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

    it('checks the price against the stored inventory price, not the originalPrice the device reports', async () => {
        // Stored price is 100. The device omits originalPrice, or reports a false one.
        const hidden = sale(f.cashier.id, { total: 150, items: [{ drugId: f.drug.id, quantity: 1, price: 150 }] });
        const spoofed = sale(f.cashier.id, { total: 150, items: [{ drugId: f.drug.id, quantity: 1, price: 150, originalPrice: 150 }] });
        const body = await (await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [hidden, spoofed] }))).json();
        expect(body.syncedIds).toEqual([]);
        expect(body.conflicts.map((c: any) => c.id).sort()).toEqual([hidden.id, spoofed.id].sort());
        expect(await db.sale.count({ where: { id: { in: [hidden.id, spoofed.id] } } })).toBe(0);
    });

    it('accepts the stored price from a cashier, and a changed price from someone allowed to edit prices', async () => {
        const atStored = sale(f.cashier.id);
        const byAdmin = sale(f.admin.id, { total: 150, items: [{ drugId: f.drug.id, quantity: 1, price: 150 }] });
        const body = await (await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [atStored, byAdmin] }))).json();
        expect(body.conflicts).toEqual([]);
        expect(body.syncedIds.sort()).toEqual([atStored.id, byAdmin.id].sort());
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

describe('N16: operator proofs', () => {
    const syncSecret = () => { process.env.SYNC_TOKEN_SECRET ||= 'isolated-operator-proof'; };
    it('records a proven cashier as verified and a merely named one as unverified (compatible default)', async () => {
        syncSecret();
        const { issueOperatorProof } = await import('../app/lib/operator-proof');
        const proven = sale(f.cashier.id);
        const claimed = sale(f.cashier.id);
        const forged = sale(f.cashier.id);
        const proofs = { [f.cashier.id]: issueOperatorProof(f.cashier.id, f.branch.id, 0) };
        await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [proven], operatorProofs: proofs }));
        await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [claimed] }));
        await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [forged], operatorProofs: { [f.cashier.id]: `${Date.now()}.forged` } }));
        const rows = await db.sale.findMany({ where: { id: { in: [proven.id, claimed.id, forged.id] } }, select: { id: true, operatorVerified: true } });
        expect(Object.fromEntries(rows.map(r => [r.id, r.operatorVerified]))).toEqual({ [proven.id]: false, [claimed.id]: false, [forged.id]: false });
    });

    it('a colleague proof cannot vouch for another cashier, and a password change revokes a proof', async () => {
        syncSecret();
        const { issueOperatorProof } = await import('../app/lib/operator-proof');
        const other = await db.user.create({ data: { email: `p-${randomUUID()}@test.invalid`, password: 'unused', role: 'CASHIER', branchId: f.branch.id } });
        const borrowed = sale(other.id);
        await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [borrowed], operatorProofs: { [other.id]: issueOperatorProof(f.cashier.id, f.branch.id, 0) } }));
        const oldProof = issueOperatorProof(other.id, f.branch.id, 0);
        await db.user.update({ where: { id: other.id }, data: { sessionVersion: 1 } });
        const revoked = sale(other.id);
        await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [revoked], operatorProofs: { [other.id]: oldProof } }));
        const rows = await db.sale.findMany({ where: { id: { in: [borrowed.id, revoked.id] } }, select: { operatorVerified: true } });
        expect(rows.map(r => r.operatorVerified)).toEqual([false, false]);
    });

    it('a proof bound to one licensed device does not verify from another, and enforcement needs a bound proof', async () => {
        syncSecret();
        const { issueOperatorProof } = await import('../app/lib/operator-proof');
        const devA = await db.deviceLicense.create({ data: { licenseKey: 'A-' + randomUUID(), branchId: f.branch.id } });
        const devB = await db.deviceLicense.create({ data: { licenseKey: 'B-' + randomUUID(), branchId: f.branch.id } });
        const proofs = { [f.cashier.id]: issueOperatorProof(f.cashier.id, f.branch.id, 0, devA.id) };
        const from = (key: string) => (path: string, body: unknown) => new NextRequest(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-device-license-key': key } });
        const onA = sale(f.cashier.id), onB = sale(f.cashier.id);
        await syncSales(from(devA.licenseKey)('/api/sync/sales', { branchId: f.branch.id, sales: [onA], operatorProofs: proofs }));
        await syncSales(from(devB.licenseKey)('/api/sync/sales', { branchId: f.branch.id, sales: [onB], operatorProofs: proofs }));
        const rows = await db.sale.findMany({ where: { id: { in: [onA.id, onB.id] } }, select: { id: true, operatorVerified: true } });
        expect(Object.fromEntries(rows.map(r => [r.id, r.operatorVerified]))).toEqual({ [onA.id]: true, [onB.id]: false });
        process.env.REQUIRE_OPERATOR_PROOF = 'true';
        try {
            const unbound = sale(f.cashier.id);
            const body = await (await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [unbound], operatorProofs: { [f.cashier.id]: issueOperatorProof(f.cashier.id, f.branch.id, 0) } }))).json();
            expect(body.conflicts.map((c: any) => c.id)).toEqual([unbound.id]);
        } finally { delete process.env.REQUIRE_OPERATOR_PROOF; }
    });

    it('with enforcement on, unproven sales and payments become review conflicts and write nothing', async () => {
        syncSecret();
        const { issueOperatorProof } = await import('../app/lib/operator-proof');
        process.env.REQUIRE_OPERATOR_PROOF = 'true';
        try {
            const unproven = sale(f.cashier.id);
            const proven = sale(f.cashier.id);
            const body = await (await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [unproven], operatorProofs: {} }))).json();
            expect(body.conflicts.map((c: any) => c.id)).toEqual([unproven.id]);
            const dev = await db.deviceLicense.create({ data: { licenseKey: 'E-' + randomUUID(), branchId: f.branch.id } });
            const onDevice = new NextRequest('http://localhost/api/sync/sales', { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-license-key': dev.licenseKey },
                body: JSON.stringify({ branchId: f.branch.id, sales: [proven], operatorProofs: { [f.cashier.id]: issueOperatorProof(f.cashier.id, f.branch.id, 0, dev.id) } }) });
            const ok = await (await syncSales(onDevice)).json();
            expect(ok.syncedIds).toEqual([proven.id]);
            const pay = { id: randomUUID(), saleId: f.creditSale.id, userId: f.admin.id, amount: 1, method: 'CASH', createdAt: new Date().toISOString() };
            const before = (await db.patient.findUnique({ where: { id: f.patient.id } }))!.balance;
            const refused = await (await syncDebts(post('/api/sync/debt-payments', { branchId: f.branch.id, payments: [pay] }))).json();
            expect(refused.conflicts.map((c: any) => c.id)).toEqual([pay.id]);
            expect((await db.patient.findUnique({ where: { id: f.patient.id } }))!.balance).toBe(before);
            expect(await db.sale.count({ where: { id: unproven.id } })).toBe(0);
        } finally {
            delete process.env.REQUIRE_OPERATOR_PROOF;
        }
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


describe('invoice numbering on synchronization', () => {
 const send = async (s: any) => (await syncSales(post('/api/sync/sales', {branchId:f.branch.id,sales:[s]}))).json();
 it('returns the original number after a lost response without consuming another', async () => {
  const s = sale(f.cashier.id);
  const first = await send(s);
  const second = await send(s);
  expect(first.syncedIds).toEqual([s.id]);
  expect(second.invoiceNumbers[s.id]).toBe(first.invoiceNumbers[s.id]);
  const next = sale(f.cashier.id);
  expect((await send(next)).invoiceNumbers[next.id]).toBe(first.invoiceNumbers[s.id]+1);
 });
 it('serializes concurrent retries and returns the same number to both', async () => {
  const s = sale(f.cashier.id);
  const [a,b] = await Promise.all([send(s),send(s)]);
  expect(a.syncedIds).toEqual([s.id]); expect(b.syncedIds).toEqual([s.id]);
  expect(a.invoiceNumbers[s.id]).toBeGreaterThan(0);
  expect(b.invoiceNumbers[s.id]).toBe(a.invoiceNumbers[s.id]);
  expect(await db.sale.count({where:{id:s.id}})).toBe(1);
 });
 it('does not expose or consume a rolled-back number for a rejected sale', async () => {
  const before = sale(f.cashier.id); const first = await send(before);
  const denied = sale(f.noSell.id); const rejected = await send(denied);
  expect(rejected.invoiceNumbers[denied.id]).toBeUndefined();
  const after = sale(f.cashier.id);
  expect((await send(after)).invoiceNumbers[after.id]).toBe(first.invoiceNumbers[before.id]+1);
 });
});

describe('sync/sales: a device never chooses the invoice number', () => {
    const send = async (s: object) => (await syncSales(post('/api/sync/sales', { branchId: f.branch.id, sales: [s] }))).json();
    it('keeps an issued, unused number from an older desktop; replaces an invented or reused one', async () => {
        const org = f.branch.organizationId;
        const issued = (await send(sale(f.cashier.id))).invoiceNumbers;
        const used = Number(Object.values(issued)[0]);
        // The counter has issued everything below nextNumber; reserve one unused number.
        const [c] = await db.$queryRaw<{ nextNumber: number }[]>`UPDATE "InvoiceCounter" SET "nextNumber" = "nextNumber" + 1 WHERE "organizationId" = ${org} RETURNING "nextNumber"`;
        const reserved = Number(c.nextNumber) - 1;

        const legacy = sale(f.cashier.id, { invoiceNumber: String(reserved) });
        expect((await send(legacy)).invoiceNumbers[legacy.id]).toBe(reserved);

        const future = sale(f.cashier.id, { invoiceNumber: String(reserved + 1000) });
        const reused = sale(f.cashier.id, { invoiceNumber: String(used) });
        const a = (await send(future)).invoiceNumbers[future.id];
        const b = (await send(reused)).invoiceNumbers[reused.id];
        expect([a, b]).not.toContain(reserved + 1000);
        expect(b).not.toBe(used);
        const all = await db.sale.findMany({ where: { branchId: f.branch.id, invoiceNumber: { not: null } }, select: { invoiceNumber: true } });
        expect(new Set(all.map(s => s.invoiceNumber)).size).toBe(all.length);
    });
});
