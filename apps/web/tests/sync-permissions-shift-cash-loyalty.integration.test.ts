// Round 2026-09-24 (N02-R): shifts, shift cash drops and loyalty points synced
// from the desktop need the same granular permissions as on the web, for the
// employee and the signed-in session, as of now. Refusals are review conflicts
// and write nothing.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

const state = vi.hoisted(() => ({ db: null as any, session: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('@/app/lib/audit', () => ({ logAudit: vi.fn(), resolveUserName: vi.fn() }));

import { POST as syncShifts } from '../app/api/sync/shifts/route';
import { POST as syncTransactions } from '../app/api/sync/transactions/route';
import { POST as syncLoyalty } from '../app/api/sync/loyalty/route';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
let f: any;
const post = (path: string, body: unknown) => new NextRequest(`http://localhost${path}`, {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-idempotency-key': randomUUID() },
});
const now = () => new Date().toISOString();
const as = (user: any) => { state.session = { user: { id: user.id } }; };

beforeAll(async () => {
    const key = randomUUID();
    // One point per dinar paid; a redeemed point is worth 2 of discount.
    const org = await db.organization.create({ data: { name: 'P ' + key, loyaltyEnabled: true, loyaltyPointsPerDinar: 1, loyaltyRedemptionValue: 2 } });
    const branch = await db.branch.create({ data: { name: 'P1 ' + key, organizationId: org.id } });
    const mk = (role: string, permissions: object | null = null) => db.user.create({ data: {
        email: `${role}-${randomUUID()}@test.invalid`, password: 'unused', role, branchId: branch.id,
        permissions: permissions ? JSON.stringify(permissions) : null } });
    const admin = await mk('ADMIN');
    const cashier = await mk('CASHIER');
    const noSell = await mk('CASHIER', { canSell: false, canPayDebt: true });
    const neither = await mk('CASHIER', { canSell: false, canPayDebt: false });
    const safe = await db.safe.create({ data: { name: 'الصندوق الرئيسي', type: 'CASH_DRAWER', balance: 1000, branchId: branch.id } });
    const patient = await db.patient.create({ data: { name: 'P', phone: randomUUID(), branchId: branch.id } });
    const other = await db.patient.create({ data: { name: 'Q', phone: randomUUID(), branchId: branch.id } });
    const patientSale = await db.sale.create({ data: { branchId: branch.id, patientId: patient.id, total: 100 } });
    f = { branch, admin, cashier, noSell, neither, safe, patient, other, patientSale };
});
afterAll(() => db.$disconnect());
beforeEach(() => as(f.admin));

const shift = (userId: string, over: object = {}) => ({
    id: randomUUID(), userId, branchId: f.branch.id, safeId: f.safe.id,
    startTime: now(), status: 'OPEN', expectedCash: 0, createdAt: now(), updatedAt: now(), ...over,
});
const shifts = async (list: unknown[]) => (await syncShifts(post('/api/sync/shifts', { branchId: f.branch.id, shifts: list }))).json();
const drop = (over: object = {}) => ({
    id: randomUUID(), safeId: f.safe.id, type: 'OUT', amount: 40, referenceType: 'SHIFT_CASH_DROP',
    createdAt: now(), updatedAt: now(), ...over,
});
const txns = async (list: unknown[]) => (await syncTransactions(post('/api/sync/transactions', { branchId: f.branch.id, transactions: list }))).json();
const balance = async () => (await db.safe.findUnique({ where: { id: f.safe.id } }))!.balance;
const points = (over: object = {}) => ({ id: randomUUID(), patientId: f.patient.id, type: 'EARN', points: 5, saleId: f.patientSale.id, createdAt: now(), ...over });
const loyalty = async (list: unknown[]) => (await syncLoyalty(post('/api/sync/loyalty', { branchId: f.branch.id, transactions: list }))).json();

describe('sync/shifts: canSell, like clockIn/clockOut on the web', () => {
    it('accepts a shift of a cashier who may sell', async () => {
        as(f.cashier);
        const s = shift(f.cashier.id);
        expect((await shifts([s])).syncedIds).toEqual([s.id]);
    });

    it('refuses a shift when the employee or the session may not sell, and writes nothing', async () => {
        as(f.noSell);
        const own = shift(f.noSell.id);
        const borrowed = shift(f.cashier.id); // restricted session naming a permitted colleague
        const first = await shifts([own, borrowed]);
        as(f.admin);
        const named = shift(f.noSell.id); // permitted session naming a restricted employee
        const second = await shifts([named]);
        const all = [...first.conflicts, ...second.conflicts].map((c: any) => c.id).sort();
        expect(all).toEqual([own.id, borrowed.id, named.id].sort());
        expect(await db.shift.count({ where: { id: { in: [own.id, borrowed.id, named.id] } } })).toBe(0);
    });

    it('lets only the shift\'s own employee close it, recognised by id or by email', async () => {
        const s = shift(f.cashier.id);
        await shifts([s]);
        const hijack = await shifts([{ ...s, userId: f.admin.id, status: 'CLOSED', actualCash: 0, expectedCash: 999 }]);
        expect(hijack.conflicts.map((c: any) => c.id)).toEqual([s.id]);
        expect(await db.shift.findUnique({ where: { id: s.id } })).toMatchObject({ status: 'OPEN', expectedCash: 0 });

        const byEmail = await shifts([{ ...s, userId: randomUUID(), userEmail: f.cashier.email, status: 'CLOSED', actualCash: 10, expectedCash: 10 }]);
        expect(byEmail.syncedIds).toEqual([s.id]);
        expect(await db.shift.findUnique({ where: { id: s.id } })).toMatchObject({ status: 'CLOSED', actualCash: 10 });
    });

    it('refuses closing a shift once selling was revoked, leaving it open for review', async () => {
        const employee = await db.user.create({ data: { email: `rev-${randomUUID()}@test.invalid`, password: 'unused', role: 'CASHIER', branchId: f.branch.id } });
        const s = shift(employee.id);
        expect((await shifts([s])).syncedIds).toEqual([s.id]);
        await db.user.update({ where: { id: employee.id }, data: { permissions: JSON.stringify({ canSell: false }) } });
        const body = await shifts([{ ...s, status: 'CLOSED', actualCash: 5 }]);
        expect(body.conflicts.map((c: any) => c.id)).toEqual([s.id]);
        expect((await db.shift.findUnique({ where: { id: s.id } }))!.status).toBe('OPEN');
    });
});

describe('sync/transactions: shift cash drops need canSell; sale cash follows its sale', () => {
    it('posts a cash drop by a session that may sell', async () => {
        as(f.cashier);
        const before = await balance();
        const t = drop();
        expect((await txns([t])).syncedIds).toEqual([t.id]);
        expect(await balance()).toBe(before - 40);
    });

    it('refuses a cash drop by a session, or a named employee, that may not sell', async () => {
        const before = await balance();
        as(f.noSell);
        const own = drop();
        const first = await txns([own]);
        as(f.admin);
        const named = drop({ userId: f.noSell.id });
        const second = await txns([named]);
        expect([...first.conflicts, ...second.conflicts].map((c: any) => c.id).sort()).toEqual([own.id, named.id].sort());
        expect(await balance()).toBe(before);
        expect(await db.transaction.count({ where: { id: { in: [own.id, named.id] } } })).toBe(0);
    });

    it('still posts the cash of an accepted sale, whatever the session (N02-R2 stays whole)', async () => {
        const sale = await db.sale.create({ data: { branchId: f.branch.id, total: 30 } });
        await db.payment.create({ data: { saleId: sale.id, method: 'CASH', amount: 30 } });
        as(f.noSell);
        const before = await balance();
        const t = drop({ type: 'IN', amount: 30, referenceType: 'SALE', referenceId: sale.id });
        expect((await txns([t])).syncedIds).toEqual([t.id]);
        expect(await balance()).toBe(before + 30);
    });
});

describe('sync/loyalty: points only against a sale of the same patient, by a session that sells or collects', () => {
    it('applies points tied to the patient\'s sale', async () => {
        const p = points();
        const body = await loyalty([p]);
        expect(body.syncedIds).toEqual([p.id]);
        expect((await db.loyaltyAccount.findUnique({ where: { patientId: f.patient.id } }))!.totalPoints).toBeGreaterThanOrEqual(5);
    });

    it('refuses points without a sale, or on another patient\'s sale, and writes nothing', async () => {
        const otherSale = await db.sale.create({ data: { branchId: f.branch.id, patientId: f.other.id, total: 100 } });
        const cases = [points({ saleId: null }), points({ saleId: otherSale.id, points: 50000 })];
        const body = await loyalty(cases);
        expect(body.syncedIds).toEqual([]);
        expect(body.conflicts.map((c: any) => c.id).sort()).toEqual(cases.map(c => c.id).sort());
        expect(await db.loyaltyTransaction.count({ where: { id: { in: cases.map(c => c.id) } } })).toBe(0);
    });

    it('waits for a sale that has not synced yet, then refers it for review after a day', async () => {
        const p = points({ saleId: randomUUID() });
        const first = await loyalty([p]);
        expect(first.syncedIds).toEqual([]);
        expect(first.conflicts).toEqual([]);
        await db.syncMovementWait.update({ where: { transactionId: 'loyalty:' + p.id }, data: { firstSeenAt: new Date(Date.now() - 25 * 3600 * 1000) } });
        expect((await loyalty([p])).conflicts.map((c: any) => c.id)).toEqual([p.id]);
        expect(await db.loyaltyTransaction.count({ where: { id: p.id } })).toBe(0);
    });

    it('caps earned points at the rate times what the patient paid, counting debt payments', async () => {
        const buyer = await db.patient.create({ data: { name: 'R', phone: randomUUID(), branchId: f.branch.id } });
        const credit = await db.sale.create({ data: { branchId: f.branch.id, patientId: buyer.id, total: 50 } });
        await db.payment.create({ data: { saleId: credit.id, method: 'CREDIT', amount: 50 } });
        // Nothing paid yet: a credit sale earns nothing.
        const early = points({ patientId: buyer.id, saleId: credit.id, points: 5 });
        expect((await loyalty([early])).conflicts.map((c: any) => c.id)).toEqual([early.id]);
        // 30 paid on the debt: up to 30 points, in total.
        await db.debtPayment.create({ data: { saleId: credit.id, amount: 30 } });
        const within = points({ patientId: buyer.id, saleId: credit.id, points: 30 });
        const beyond = points({ patientId: buyer.id, saleId: credit.id, points: 5 });
        const body = await loyalty([within, beyond]);
        expect(body.syncedIds).toEqual([within.id]);
        expect(body.conflicts.map((c: any) => c.id)).toEqual([beyond.id]);
    });

    it('limits a redemption to the balance and to the sale\'s discount', async () => {
        const buyer = await db.patient.create({ data: { name: 'S', phone: randomUUID(), branchId: f.branch.id } });
        await db.loyaltyAccount.create({ data: { patientId: buyer.id, totalPoints: 20, lifetimePoints: 20 } });
        const s = await db.sale.create({ data: { branchId: f.branch.id, patientId: buyer.id, total: 60, discount: 20 } });
        const worthMore = points({ patientId: buyer.id, saleId: s.id, type: 'REDEEM', points: 15 }); // 30 > discount 20
        const overdrawn = points({ patientId: buyer.id, saleId: s.id, type: 'REDEEM', points: 10 });
        await db.loyaltyAccount.update({ where: { patientId: buyer.id }, data: { totalPoints: 5 } });
        const first = await loyalty([worthMore, overdrawn]);
        expect(first.conflicts.map((c: any) => c.id)).toEqual([worthMore.id]);
        expect(first.syncedIds).toEqual([]); // overdrawn waits: an earn may still be syncing
        await db.loyaltyAccount.update({ where: { patientId: buyer.id }, data: { totalPoints: 10 } });
        expect((await loyalty([overdrawn])).syncedIds).toEqual([overdrawn.id]);
        expect((await db.loyaltyAccount.findUnique({ where: { patientId: buyer.id } }))!.totalPoints).toBe(0);
    });

    it('accepts a session that collects debts, refuses one that neither sells nor collects', async () => {
        as(f.noSell);
        const collector = points();
        expect((await loyalty([collector])).syncedIds).toEqual([collector.id]);
        as(f.neither);
        const refused = points();
        const body = await loyalty([refused]);
        expect(body.conflicts.map((c: any) => c.id)).toEqual([refused.id]);
        expect(await db.loyaltyTransaction.count({ where: { id: refused.id } })).toBe(0);
    });
});
