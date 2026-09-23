import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

const state = vi.hoisted(() => ({ db: null as any, session: null as any, headers: new Headers() }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('next/headers', () => ({ headers: async () => state.headers }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app/lib/audit', () => ({ logAudit: vi.fn() }));
import { GET as patients } from '../app/api/sync/patients/route';
import { POST as loyalty } from '../app/api/sync/loyalty/route';
import { getTenantContext } from '../app/lib/tenant-utils';
import { REQUEST_METHOD_HEADER, REQUEST_PATH_HEADER } from '../app/lib/subscription-request-policy';
import { getSafes, createTransaction, transferFunds } from '../app/lib/actions/finance-actions';
import { cancelPrescription, dispensePrescription, getPrescriptionById } from '../app/lib/actions/prescription';
import { createPayment } from '../app/lib/actions/payment';
import { clockIn } from '../app/lib/actions/shifts';
import { getPatientById } from '../app/lib/actions/patient';

process.env.AUTH_SECRET ||= 'isolated-subscription-test';
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
let f: any;
beforeAll(async () => {
    const mk = async () => {
        const org = await db.organization.create({ data: { name: randomUUID(), loyaltyEnabled: true } });
        const branch = await db.branch.create({ data: { name: 'test', organizationId: org.id } });
        const user = await db.user.create({ data: { email: `${randomUUID()}@test.invalid`, password: 'unused', role: 'ADMIN', branchId: branch.id } });
        const patient = await db.patient.create({ data: { name: 'test', phone: randomUUID(), branchId: branch.id } });
        return { org, branch, user, patient };
    };
    f = { A: await mk(), B: await mk(), orphan: await db.patient.create({ data: { name: 'unassigned', phone: randomUUID() } }) };
    for (const side of [f.A, f.B]) {
        side.safe = await db.safe.create({ data: { name: 'test safe', type: 'CASH_DRAWER', branchId: side.branch.id, balance: 100 } });
        side.sale = await db.sale.create({ data: { branchId: side.branch.id, total: 100 } });
        side.prescription = await db.prescription.create({ data: { patientId: side.patient.id } });
    }
});
beforeEach(async () => {
    state.session = { user: { id: f.A.user.id } };
    state.headers = new Headers({ [REQUEST_METHOD_HEADER]: 'POST', [REQUEST_PATH_HEADER]: '/api/patients' });
    await db.organization.update({ where: { id: f.A.org.id }, data: { isSuspended: false, subscriptionEndsAt: null } });
});
afterAll(() => db.$disconnect());
const contextStatus = async () => (await getTenantContext() as any).status ?? 200;

describe('patient scope', () => {
    it('missing branch defaults to the authenticated branch and never includes unassigned or foreign patients', async () => {
        const response = await patients(new Request('http://localhost/api/sync/patients'));
        expect(response.status).toBe(200);
        expect((await response.json()).patients.map((p: any) => p.id)).toEqual([f.A.patient.id]);
    });
    it('rejects a foreign branch', async () => {
        expect((await patients(new Request(`http://localhost/api/sync/patients?branchId=${f.B.branch.id}`))).status).toBe(403);
    });
    it('quarantines loyalty for an unassigned patient without assigning or changing them', async () => {
        const id = randomUUID();
        const response = await loyalty(new NextRequest('http://localhost/api/sync/loyalty', { method: 'POST', body: JSON.stringify({ branchId: f.A.branch.id, transactions: [{ id, patientId: f.orphan.id, type: 'EARN', points: 10, createdAt: new Date().toISOString() }] }) }));
        const body = await response.json();
        expect(body.syncedIds).toEqual([]);
        expect(body.conflicts.map((c: any) => c.id)).toEqual([id]);
        expect(await db.loyaltyAccount.count({ where: { patientId: f.orphan.id } })).toBe(0);
        expect((await db.patient.findUnique({ where: { id: f.orphan.id } }))!.branchId).toBeNull();
    });
});
describe('fresh subscription authorization', () => {
    it('blocks cookie writes and Server Actions, preserves explicit read actions', async () => {
        await db.organization.update({ where: { id: f.A.org.id }, data: { isSuspended: true } });
        expect(await contextStatus()).toBe(403);
        state.headers.set(REQUEST_PATH_HEADER, '/dashboard/suppliers');
        expect(await contextStatus()).toBe(403);
        expect((await getTenantContext('read') as any).status ?? 200).toBe(200);
        state.headers.set(REQUEST_METHOD_HEADER, 'GET');
        expect(await contextStatus()).toBe(200);
        state.headers.set(REQUEST_METHOD_HEADER, 'POST');
        state.headers.set(REQUEST_PATH_HEADER, '/api/payments/stripe');
        expect(await contextStatus()).toBe(403);
    });
    it('mobile uses current state and resumes with the same token after renewal', async () => {
        state.session = null;
        const token = await new SignJWT({ userId: f.A.user.id, sessionVersion: 0 }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
        state.headers.set('authorization', `Bearer ${token}`);
        expect(await contextStatus()).toBe(200);
        await db.organization.update({ where: { id: f.A.org.id }, data: { subscriptionEndsAt: new Date(Date.now() - 10 * 86400000) } });
        expect(await contextStatus()).toBe(403);
        await db.organization.update({ where: { id: f.A.org.id }, data: { subscriptionEndsAt: new Date(Date.now() + 30 * 86400000) } });
        expect(await contextStatus()).toBe(200);
    });
});

describe('Server Actions cannot bypass tenant scope or subscription', () => {
    it('keeps read actions available over POST while suspended', async () => {
        state.headers.set(REQUEST_PATH_HEADER, '/dashboard/patients');
        await db.organization.update({ where: { id: f.A.org.id }, data: { isSuspended: true } });
        expect((await getPatientById(f.A.patient.id))?.id).toBe(f.A.patient.id);
        expect(await getSafes(f.B.branch.id)).toEqual([]);
        expect(await getPrescriptionById(f.B.prescription.id)).toBeNull();
    });
    it('rejects finance, prescription, payment and shift writes for suspended accounts', async () => {
        state.headers.set(REQUEST_PATH_HEADER, '/dashboard/patients');
        await db.organization.update({ where: { id: f.A.org.id }, data: { isSuspended: true } });
        const before = await db.safe.findUnique({ where: { id: f.A.safe.id } });
        expect((await createTransaction({ safeId: f.A.safe.id, type: 'IN', amount: 10, referenceType: 'VOUCHER' })).success).toBe(false);
        expect((await cancelPrescription(f.A.prescription.id))?.message).toBeTruthy();
        expect((await createPayment(f.A.sale.id, 10, 'CASH')).success).not.toBe(true);
        expect((await clockIn(f.A.user.id, f.A.branch.id)).success).toBe(false);
        expect((await db.safe.findUnique({ where: { id: f.A.safe.id } }))!.balance).toBe(before!.balance);
        expect((await db.prescription.findUnique({ where: { id: f.A.prescription.id } }))!.status).toBe('PENDING');
        expect(await db.payment.count({ where: { saleId: f.A.sale.id } })).toBe(0);
        expect(await db.shift.count({ where: { userId: f.A.user.id } })).toBe(0);
    });
    it('refuses cross-tenant mutations with an active subscription', async () => {
        expect((await createTransaction({ safeId: f.B.safe.id, type: 'OUT', amount: 10, referenceType: 'VOUCHER' })).success).toBe(false);
        expect((await transferFunds({ fromSafeId: f.A.safe.id, toSafeId: f.B.safe.id, amount: 10 })).success).toBe(false);
        expect((await createPayment(f.B.sale.id, 10, 'CASH')).success).not.toBe(true);
        expect((await cancelPrescription(f.B.prescription.id))?.message).toBeTruthy();
        expect((await db.safe.findUnique({ where: { id: f.B.safe.id } }))!.balance).toBe(100);
        expect((await db.prescription.findUnique({ where: { id: f.B.prescription.id } }))!.status).toBe('PENDING');
    });
    it('valid finance writes still work; concurrent vouchers do not lose increments', async () => {
        const before = (await db.safe.findUnique({ where: { id: f.A.safe.id } }))!.balance;
        const outcomes = await Promise.all([10, 20].map(amount => createTransaction({ safeId: f.A.safe.id, type: 'IN', amount, referenceType: 'VOUCHER' })));
        expect(outcomes.every(o => o.success)).toBe(true);
        expect((await db.safe.findUnique({ where: { id: f.A.safe.id } }))!.balance).toBe(before + 30);
    });
    it('refuses negative transfers and dispensing items belonging to another prescription', async () => {
        expect((await transferFunds({ fromSafeId: f.A.safe.id, toSafeId: f.B.safe.id, amount: -10 })).success).toBe(false);
        const drug = await db.globalDrug.create({ data: { barcode: randomUUID(), tradeName: 'test', scientificName: 'test', alternatives: [] } });
        const item = await db.prescriptionItem.create({ data: { prescriptionId: f.B.prescription.id, drugId: drug.id, quantity: 1 } });
        await dispensePrescription(f.A.prescription.id, [item.id]);
        expect((await db.prescriptionItem.findUnique({ where: { id: item.id } }))!.isDispensed).toBe(false);
    });
});
