// Round 2026-09-23 (N17): desktop sync of shifts, safe transactions and loyalty
// points must stay inside the syncing branch's organisation. A record naming
// another organisation's shift, safe, user or patient is a review conflict and
// writes nothing; genuine desktop payloads keep syncing.
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

beforeAll(async () => {
    const key = randomUUID();
    const mkOrg = async (name: string) => {
        const org = await db.organization.create({ data: { name: name + key, loyaltyEnabled: true } });
        const branch = await db.branch.create({ data: { name: name + ' branch ' + key, organizationId: org.id } });
        const admin = await db.user.create({ data: { email: `${name}-admin-${randomUUID()}@test.invalid`, password: 'unused', role: 'ADMIN', branchId: branch.id } });
        const safe = await db.safe.create({ data: { name: 'الصندوق الرئيسي', type: 'CASH_DRAWER', balance: 1000, branchId: branch.id } });
        const patient = await db.patient.create({ data: { name: name + ' patient', phone: randomUUID(), branchId: branch.id } });
        return { org, branch, admin, safe, patient };
    };
    const A = await mkOrg('A'), B = await mkOrg('B');
    const foreignShift = await db.shift.create({ data: { userId: B.admin.id, branchId: B.branch.id, safeId: B.safe.id, startTime: new Date(), status: 'OPEN', expectedCash: 50 } });
    const foreignAccount = await db.loyaltyAccount.create({ data: { patientId: B.patient.id, totalPoints: 900, lifetimePoints: 900 } });
    const foreignLoyaltyTx = await db.loyaltyTransaction.create({ data: { accountId: foreignAccount.id, type: 'EARN', points: 900 } });
    // Points move only against a sale of the same branch and patient (N02-R).
    // Paid 1000 at the default 0.01 points per dinar: up to 10 points may be earned.
    const patientSale = await db.sale.create({ data: { branchId: A.branch.id, patientId: A.patient.id, total: 1000 } });
    f = { A, B, foreignShift, foreignAccount, foreignLoyaltyTx, patientSale };
});
afterAll(() => db.$disconnect());
// The desktop session is organisation A's admin.
beforeEach(() => { state.session = { user: { id: f.A.admin.id } }; });

const shift = (over: object = {}) => ({
    id: randomUUID(), userId: f.A.admin.id, branchId: f.A.branch.id, safeId: f.A.safe.id,
    startTime: now(), status: 'OPEN', expectedCash: 0, createdAt: now(), updatedAt: now(), ...over,
});
const txn = (over: object = {}) => ({
    id: randomUUID(), safeId: f.A.safe.id, type: 'IN', amount: 25, referenceType: 'SALE',
    userId: f.A.admin.id, createdAt: now(), updatedAt: now(), ...over,
});
const points = (over: object = {}) => ({ id: randomUUID(), patientId: f.A.patient.id, type: 'EARN', points: 10, saleId: f.patientSale.id, createdAt: now(), ...over });

describe('sync/shifts stays inside the organisation', () => {
    it('accepts a genuine desktop shift', async () => {
        const s = shift();
        const body = await (await syncShifts(post('/api/sync/shifts', { branchId: f.A.branch.id, shifts: [s] }))).json();
        expect(body.syncedIds).toEqual([s.id]);
        expect(body.conflicts).toEqual([]);
    });

    it('refuses a shift for another branch, an update of a foreign shift, and a foreign user (by id or email)', async () => {
        const otherBranch = shift({ branchId: f.B.branch.id, safeId: f.B.safe.id, userId: f.B.admin.id });
        const hijack = shift({ id: f.foreignShift.id, status: 'CLOSED', actualCash: 0, expectedCash: 0 });
        const foreignUser = shift({ userId: f.B.admin.id });
        const foreignEmail = shift({ userId: randomUUID(), userEmail: f.B.admin.email });
        const cases = [otherBranch, hijack, foreignUser, foreignEmail];
        const body = await (await syncShifts(post('/api/sync/shifts', { branchId: f.A.branch.id, shifts: cases }))).json();
        expect(body.syncedIds).toEqual([]);
        expect(body.conflicts.map((c: any) => c.id).sort()).toEqual(cases.map(c => c.id).sort());
        const untouched = await db.shift.findUnique({ where: { id: f.foreignShift.id } });
        expect(untouched).toMatchObject({ status: 'OPEN', expectedCash: 50 });
        expect(await db.shift.count({ where: { id: { in: [otherBranch.id, foreignUser.id, foreignEmail.id] } } })).toBe(0);
    });

    it('never attaches a shift to another branch\'s safe', async () => {
        const s = shift({ safeId: f.B.safe.id });
        const body = await (await syncShifts(post('/api/sync/shifts', { branchId: f.A.branch.id, shifts: [s] }))).json();
        expect(body.syncedIds).toEqual([s.id]);
        expect((await db.shift.findUnique({ where: { id: s.id } }))?.safeId).toBe(f.A.safe.id);
    });
});

describe('sync/transactions stays inside the organisation', () => {
    const fundedTxn = async (extra: object = {}) => {
        const s = await db.sale.create({ data: { branchId: f.A.branch.id, total: 25 } });
        await db.payment.create({ data: { saleId: s.id, method: 'CASH', amount: 25 } });
        return txn({ referenceId: s.id, ...extra });
    };
    it('accepts a documented cash sale and moves this branch\'s safe', async () => {
        const before = (await db.safe.findUnique({ where: { id: f.A.safe.id } }))!.balance;
        const cases = [await fundedTxn()];
        const body = await (await syncTransactions(post('/api/sync/transactions', { branchId: f.A.branch.id, transactions: cases }))).json();
        expect(body.syncedIds.sort()).toEqual(cases.map(c => c.id).sort());
        expect((await db.safe.findUnique({ where: { id: f.A.safe.id } }))!.balance).toBe(before + 25);
    });

    it('never moves another branch\'s safe, even when its id is named', async () => {
        const beforeB = (await db.safe.findUnique({ where: { id: f.B.safe.id } }))!.balance;
        const t = await fundedTxn({ safeId: f.B.safe.id });
        const body = await (await syncTransactions(post('/api/sync/transactions', { branchId: f.A.branch.id, transactions: [t] }))).json();
        expect(body.syncedIds).toEqual([t.id]);
        expect((await db.safe.findUnique({ where: { id: f.B.safe.id } }))!.balance).toBe(beforeB);
        expect((await db.transaction.findUnique({ where: { id: t.id } }))?.safeId).toBe(f.A.safe.id);
    });

    it('refuses invalid or foreign-attributed movements and keeps the rest of the batch', async () => {
        const bad = [txn({ type: 'STEAL' }), txn({ amount: -50 }), txn({ userId: f.B.admin.id })];
        const good = await fundedTxn();
        const body = await (await syncTransactions(post('/api/sync/transactions', { branchId: f.A.branch.id, transactions: [...bad, good] }))).json();
        expect(body.syncedIds).toEqual([good.id]);
        expect(body.conflicts.map((c: any) => c.id).sort()).toEqual(bad.map(c => c.id).sort());
        expect(await db.transaction.count({ where: { id: { in: bad.map(c => c.id) } } })).toBe(0);
    });

    it('acknowledges an already-synced movement once, without moving the safe again', async () => {
        const t = await fundedTxn();
        await syncTransactions(post('/api/sync/transactions', { branchId: f.A.branch.id, transactions: [t] }));
        const mid = (await db.safe.findUnique({ where: { id: f.A.safe.id } }))!.balance;
        const body = await (await syncTransactions(post('/api/sync/transactions', { branchId: f.A.branch.id, transactions: [t] }))).json();
        expect(body.syncedIds).toEqual([t.id]);
        expect((await db.safe.findUnique({ where: { id: f.A.safe.id } }))!.balance).toBe(mid);
    });
});

describe('sync/transactions: sale cash follows the sale (N02-R2)', () => {
    const sync = async (transactions: unknown[]) => (await syncTransactions(post('/api/sync/transactions', { branchId: f.A.branch.id, transactions }))).json();
    const balance = async () => (await db.safe.findUnique({ where: { id: f.A.safe.id } }))!.balance;
    const cashSale = async (total: number, branchId = f.A.branch.id) => {
        const s = await db.sale.create({ data: { branchId, total } });
        await db.payment.create({ data: { saleId: s.id, amount: total, method: 'CASH' } });
        return s;
    };

    it('posts a synced sale cash once; a second movement for it (another id) has no second effect', async () => {
        const sale = await cashSale(30);
        const before = await balance();
        const first = txn({ amount: 30, referenceId: sale.id });
        const second = txn({ amount: 30, referenceId: sale.id });
        expect((await sync([first])).syncedIds).toEqual([first.id]);
        expect((await sync([second])).syncedIds).toEqual([second.id]);
        expect(await balance()).toBe(before + 30);
        expect(await db.transaction.count({ where: { referenceId: sale.id } })).toBe(1);
    });

    it('serializes simultaneous movements for one cash invoice', async () => {
        const sale = await cashSale(30);
        const before = await balance();
        const movements = [txn({ amount: 30, referenceId: sale.id }), txn({ amount: 30, referenceId: sale.id })];
        const results = await Promise.all(movements.map(m => sync([m])));
        expect(results.flatMap(r => r.syncedIds).sort()).toEqual(movements.map(m => m.id).sort());
        expect(await balance()).toBe(before + 30);
        expect(await db.transaction.count({ where: { referenceId: sale.id } })).toBe(1);
    });

    it('refuses a movement whose amount or direction does not match its document, or a foreign document', async () => {
        const sale = await cashSale(30);
        const foreignSale = await cashSale(30, f.B.branch.id);
        const before = await balance();
        const cases = [txn({ amount: 300, referenceId: sale.id }), txn({ type: 'OUT', amount: 30, referenceId: sale.id }), txn({ amount: 30, referenceId: foreignSale.id })];
        const body = await sync(cases);
        expect(body.syncedIds).toEqual([]);
        expect(body.conflicts.map((c: any) => c.id).sort()).toEqual(cases.map(c => c.id).sort());
        expect(await balance()).toBe(before);
    });

    it('does not refund twice when the return sync already posted the refund', async () => {
        const sale = await cashSale(40);
        const ret = await db.saleReturn.create({ data: { saleId: sale.id, branchId: f.A.branch.id, total: 15 } as any });
        await db.transaction.create({ data: { safeId: f.A.safe.id, type: 'OUT', amount: 15, referenceType: 'SALE_RETURN', referenceId: ret.id } });
        const before = await balance();
        const desktopCopy = txn({ type: 'OUT', amount: 15, referenceType: 'SALE_RETURN', referenceId: ret.id });
        expect((await sync([desktopCopy])).syncedIds).toEqual([desktopCopy.id]);
        expect(await balance()).toBe(before);
    });

    it('refuses cash for a credit return and for a sale without a payment method', async () => {
        const credit = await db.sale.create({ data: { branchId: f.A.branch.id, total: 30, patientId: f.A.patient.id } });
        await db.payment.create({ data: { saleId: credit.id, method: 'CREDIT', amount: 30 } });
        const ret = await db.saleReturn.create({ data: { saleId: credit.id, branchId: f.A.branch.id, total: 10 } });
        const unknown = await db.sale.create({ data: { branchId: f.A.branch.id, total: 20 } });
        const cases = [txn({ type: 'OUT', amount: 10, referenceType: 'SALE_RETURN', referenceId: ret.id }), txn({ amount: 20, referenceId: unknown.id })];
        const before = await balance();
        const debtBefore = (await db.patient.findUnique({ where: { id: f.A.patient.id } }))!.balance;
        const result = await sync(cases);
        expect(result.syncedIds).toEqual([]);
        expect(result.conflicts.map((c: any) => c.id).sort()).toEqual(cases.map(c => c.id).sort());
        expect(await balance()).toBe(before);
        expect((await db.patient.findUnique({ where: { id: f.A.patient.id } }))!.balance).toBe(debtBefore);
        expect(await db.transaction.count({ where: { id: { in: cases.map(c => c.id) } } })).toBe(0);
    });

    it('does not create a refund settlement merely from a cash return total', async () => {
        const sale = await cashSale(40);
        const ret = await db.saleReturn.create({ data: { saleId: sale.id, branchId: f.A.branch.id, total: 15 } });
        const movement = txn({ type: 'OUT', amount: 15, referenceType: 'SALE_RETURN', referenceId: ret.id });
        const before = await balance();
        expect((await sync([movement])).conflicts.map((c: any) => c.id)).toEqual([movement.id]);
        expect(await balance()).toBe(before);
        expect(await db.transaction.count({ where: { referenceId: ret.id } })).toBe(0);
    });

    it('waits for a missing document by the server clock, not the device clock, then sends it to review', async () => {
        const before = await balance();
        const waiting = txn({ amount: 40, referenceId: randomUUID(), createdAt: new Date(Date.now() - 5 * 86400000).toISOString() });
        const first = await sync([waiting]);
        expect(first.syncedIds).toEqual([]);
        expect(first.conflicts).toEqual([]); // an old device date does not skip the wait
        await db.syncMovementWait.update({ where: { transactionId: waiting.id }, data: { firstSeenAt: new Date(Date.now() - 2 * 86400000) } });
        const later = await sync([waiting]);
        expect(later.conflicts.map((c: any) => c.id)).toEqual([waiting.id]);
        expect(await balance()).toBe(before);
    });

    it('refuses unknown movement kinds and unreferenced document cash even with legacy enforcement disabled', async () => {
        const unknown = txn({ referenceType: 'MANUAL_GIFT' });
        expect((await sync([unknown])).conflicts.map((c: any) => c.id)).toEqual([unknown.id]);
        const legacy = txn({ amount: 1 });
        expect((await sync([legacy])).conflicts.map((c: any) => c.id)).toEqual([legacy.id]);
        process.env.REQUIRE_MOVEMENT_REFERENCE = 'false';
        try {
            const unreferenced = txn({ amount: 1 });
            expect((await sync([unreferenced])).conflicts.map((c: any) => c.id)).toEqual([unreferenced.id]);
        } finally { delete process.env.REQUIRE_MOVEMENT_REFERENCE; }
    });
});

describe('sync/loyalty stays inside the organisation', () => {
    it('accepts points for this organisation\'s patient', async () => {
        const p = points();
        const body = await (await syncLoyalty(post('/api/sync/loyalty', { branchId: f.A.branch.id, transactions: [p] }))).json();
        expect(body.syncedIds).toEqual([p.id]);
        expect(body.accountBalances.map((a: any) => a.patientId)).toEqual([f.A.patient.id]);
    });

    it('refuses points for a foreign patient, a replayed foreign entry, and invalid values; leaks no foreign balance', async () => {
        const cases = [
            points({ patientId: f.B.patient.id, type: 'REDEEM', points: 900 }),
            points({ id: f.foreignLoyaltyTx.id }),
            points({ type: 'GIFT' }),
            points({ points: -100 }),
        ];
        const body = await (await syncLoyalty(post('/api/sync/loyalty', { branchId: f.A.branch.id, transactions: cases }))).json();
        expect(body.syncedIds).toEqual([]);
        expect(body.conflicts.map((c: any) => c.id).sort()).toEqual(cases.map(c => c.id).sort());
        expect(body.accountBalances.find((a: any) => a.patientId === f.B.patient.id)).toBeUndefined();
        expect((await db.loyaltyAccount.findUnique({ where: { id: f.foreignAccount.id } }))!.totalPoints).toBe(900);
    });

    it('retries (does not refuse) a patient that has not reached the cloud yet', async () => {
        const p = points({ patientId: randomUUID() });
        const body = await (await syncLoyalty(post('/api/sync/loyalty', { branchId: f.A.branch.id, transactions: [p] }))).json();
        expect(body.syncedIds).toEqual([]);
        expect(body.conflicts).toEqual([]);
    });
});
