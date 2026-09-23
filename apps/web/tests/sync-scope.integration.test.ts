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
    f = { A, B, foreignShift, foreignAccount, foreignLoyaltyTx };
});
afterAll(() => db.$disconnect());
// The desktop session is organisation A's admin.
// Production (e0c5e7f) sync-auth takes role/branch/org from the session claims
// instead of re-reading the user, so the session carries them here.
beforeEach(() => { state.session = { user: { id: f.A.admin.id, role: 'ADMIN', branchId: f.A.branch.id, organizationId: f.A.org.id } }; });

const shift = (over: object = {}) => ({
    id: randomUUID(), userId: f.A.admin.id, branchId: f.A.branch.id, safeId: f.A.safe.id,
    startTime: now(), status: 'OPEN', expectedCash: 0, createdAt: now(), updatedAt: now(), ...over,
});
const txn = (over: object = {}) => ({
    id: randomUUID(), safeId: f.A.safe.id, type: 'IN', amount: 25, referenceType: 'SALE',
    userId: f.A.admin.id, createdAt: now(), updatedAt: now(), ...over,
});
const points = (over: object = {}) => ({ id: randomUUID(), patientId: f.A.patient.id, type: 'EARN', points: 10, createdAt: now(), ...over });

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
    it('accepts genuine desktop movements (sale in, return out) and moves this branch\'s safe', async () => {
        const before = (await db.safe.findUnique({ where: { id: f.A.safe.id } }))!.balance;
        const cases = [txn(), txn({ type: 'OUT', amount: 5, referenceType: 'SALE_RETURN' })];
        const body = await (await syncTransactions(post('/api/sync/transactions', { branchId: f.A.branch.id, transactions: cases }))).json();
        expect(body.syncedIds.sort()).toEqual(cases.map(c => c.id).sort());
        expect((await db.safe.findUnique({ where: { id: f.A.safe.id } }))!.balance).toBe(before + 20);
    });

    it('never moves another branch\'s safe, even when its id is named', async () => {
        const beforeB = (await db.safe.findUnique({ where: { id: f.B.safe.id } }))!.balance;
        const t = txn({ safeId: f.B.safe.id, type: 'OUT', amount: 400 });
        const body = await (await syncTransactions(post('/api/sync/transactions', { branchId: f.A.branch.id, transactions: [t] }))).json();
        expect(body.syncedIds).toEqual([t.id]);
        expect((await db.safe.findUnique({ where: { id: f.B.safe.id } }))!.balance).toBe(beforeB);
        expect((await db.transaction.findUnique({ where: { id: t.id } }))?.safeId).toBe(f.A.safe.id);
    });

    it('refuses invalid or foreign-attributed movements and keeps the rest of the batch', async () => {
        const bad = [txn({ type: 'STEAL' }), txn({ amount: -50 }), txn({ userId: f.B.admin.id })];
        const good = txn();
        const body = await (await syncTransactions(post('/api/sync/transactions', { branchId: f.A.branch.id, transactions: [...bad, good] }))).json();
        expect(body.syncedIds).toEqual([good.id]);
        expect(body.conflicts.map((c: any) => c.id).sort()).toEqual(bad.map(c => c.id).sort());
        expect(await db.transaction.count({ where: { id: { in: bad.map(c => c.id) } } })).toBe(0);
    });

    it('acknowledges an already-synced movement once, without moving the safe again', async () => {
        const t = txn();
        await syncTransactions(post('/api/sync/transactions', { branchId: f.A.branch.id, transactions: [t] }));
        const mid = (await db.safe.findUnique({ where: { id: f.A.safe.id } }))!.balance;
        const body = await (await syncTransactions(post('/api/sync/transactions', { branchId: f.A.branch.id, transactions: [t] }))).json();
        expect(body.syncedIds).toEqual([t.id]);
        expect((await db.safe.findUnique({ where: { id: f.A.safe.id } }))!.balance).toBe(mid);
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
