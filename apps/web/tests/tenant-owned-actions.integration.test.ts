// Round 2026-09-23 (N20): insurance companies, insurance policies, discounts and
// branches are changed only inside the caller's organisation. Legacy rows with
// no owner stay readable but only SUPER_ADMIN may change them.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const state = vi.hoisted(() => ({ db: null as any, session: null as any, headers: new Headers() }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('next/headers', () => ({ headers: async () => state.headers }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app/lib/saas-guards', () => ({ checkPlanLimit: async () => ({ allowed: true }), checkFeatureAccess: async () => ({ allowed: true }) }));

import { createInsuranceCompany, updateInsuranceCompany, deleteInsuranceCompany, createInsurancePolicy, deleteInsurancePolicy } from '../app/lib/actions/insurance';
import { createDiscount, updateDiscount, deleteDiscount } from '../app/lib/actions/discount';
import { createBranch, updateBranch } from '../app/lib/actions/branch';
import { sweepExpiredPendingTransactions } from '../app/lib/actions/billing';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
let f: any;
const form = (fields: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.set(k, v); return fd; };
// Successful create/update actions end with redirect(), which throws NEXT_REDIRECT.
const settle = async (p: Promise<unknown>) => { try { return await p; } catch (e: any) { if (String(e?.digest ?? e?.message).includes('NEXT_REDIRECT')) return 'redirect'; throw e; } };
const companyForm = (name: string) => form({ name, discountRate: '10', contactPhone: '', contactEmail: '' });
const discountForm = (name: string) => form({ name, type: 'PERCENTAGE', value: '5', startDate: '2026-01-01', endDate: '2030-01-01', isActive: 'on' });

beforeAll(async () => {
    const mk = async (tag: string) => {
        const org = await db.organization.create({ data: { name: tag + randomUUID() } });
        const branch = await db.branch.create({ data: { name: tag, organizationId: org.id } });
        const admin = await db.user.create({ data: { email: `${tag}-${randomUUID()}@test.invalid`, password: 'unused', role: 'ADMIN', branchId: branch.id } });
        const patient = await db.patient.create({ data: { name: tag + ' patient', phone: randomUUID(), branchId: branch.id } });
        return { org, branch, admin, patient };
    };
    const A = await mk('A'), B = await mk('B');
    const companyB = await db.insuranceCompany.create({ data: { name: 'B insurer', organizationId: B.org.id } });
    const legacyCompany = await db.insuranceCompany.create({ data: { name: 'legacy insurer ' + randomUUID() } });
    const policyB = await db.insurancePolicy.create({ data: { patientId: B.patient.id, companyId: companyB.id, policyNumber: 'B-1', expiryDate: new Date('2030-01-01') } });
    const discountB = await db.discount.create({ data: { name: 'B offer', type: 'PERCENTAGE', value: 50, startDate: new Date('2026-01-01'), endDate: new Date('2030-01-01'), organizationId: B.org.id } });
    const legacyDiscount = await db.discount.create({ data: { name: 'legacy offer', type: 'FIXED', value: 1, startDate: new Date('2026-01-01'), endDate: new Date('2030-01-01') } });
    const pendingB = await db.paymentTransaction.create({ data: { organizationId: B.org.id, status: 'PENDING', initiatedAt: new Date(Date.now() - 3600000), amount: 1 } });
    f = { A, B, companyB, legacyCompany, policyB, discountB, legacyDiscount, pendingB };
});
afterAll(() => db.$disconnect());
beforeEach(() => { state.session = { user: { id: f.A.admin.id } }; state.headers = new Headers(); });

describe('N20: insurance', () => {
    it('stamps a new company with the caller organisation', async () => {
        const name = 'A insurer ' + randomUUID();
        expect(await settle(createInsuranceCompany(null, companyForm(name)))).toBe('redirect');
        expect((await db.insuranceCompany.findFirst({ where: { name } }))?.organizationId).toBe(f.A.org.id);
    });

    it('refuses to change or delete another organisation company, or a legacy one', async () => {
        for (const id of [f.companyB.id, f.legacyCompany.id]) {
            expect(await settle(updateInsuranceCompany(id, null, companyForm('hijacked')))).toMatchObject({ message: expect.stringContaining('غير مصرح') });
            expect(await deleteInsuranceCompany(id)).toMatchObject({ message: expect.stringContaining('غير مصرح') });
        }
        expect((await db.insuranceCompany.findUnique({ where: { id: f.companyB.id } }))?.name).toBe('B insurer');
        expect(await db.insuranceCompany.count({ where: { id: f.legacyCompany.id } })).toBe(1);
    });

    it('creates policies only for own patients with a readable company, and deletes only own policies', async () => {
        const policy = (patientId: string, companyId: string) => form({ patientId, companyId, policyNumber: randomUUID(), expiryDate: '2030-01-01', coverageRate: '50' });
        expect(await createInsurancePolicy(null, policy(f.B.patient.id, f.legacyCompany.id))).toMatchObject({ message: expect.stringContaining('خارج نطاق') });
        expect(await createInsurancePolicy(null, policy(f.A.patient.id, f.companyB.id))).toMatchObject({ message: expect.stringContaining('خارج نطاق') });
        expect(await createInsurancePolicy(null, policy(f.A.patient.id, f.legacyCompany.id))).toEqual({ success: true });
        expect(await deleteInsurancePolicy(f.policyB.id, f.B.patient.id)).toMatchObject({ message: expect.stringContaining('ضمن نطاق') });
        expect(await db.insurancePolicy.count({ where: { id: f.policyB.id } })).toBe(1);
    });
});

describe('N20: discounts', () => {
    it('stamps a new discount and refuses changing another organisation or a legacy one', async () => {
        const name = 'A offer ' + randomUUID();
        expect(await settle(createDiscount(null, discountForm(name)))).toBe('redirect');
        expect((await db.discount.findFirst({ where: { name } }))?.organizationId).toBe(f.A.org.id);
        for (const id of [f.discountB.id, f.legacyDiscount.id]) {
            expect(await settle(updateDiscount(id, null, discountForm('hijacked')))).toMatchObject({ message: expect.stringContaining('غير مصرح') });
            expect(await deleteDiscount(id)).toMatchObject({ message: expect.stringContaining('غير مصرح') });
        }
        expect((await db.discount.findUnique({ where: { id: f.discountB.id } }))?.value).toBe(50);
    });

    it('a cashier without the discount permission cannot manage discounts', async () => {
        const cashier = await db.user.create({ data: { email: `c-${randomUUID()}@test.invalid`, password: 'unused', role: 'CASHIER', branchId: f.A.branch.id } });
        state.session = { user: { id: cashier.id } };
        expect(await settle(createDiscount(null, discountForm('cashier offer')))).toMatchObject({ message: expect.stringContaining('صلاحية') });
    });
});

describe('N20: branches and billing', () => {
    it('refuses creating a branch in another organisation or moving one there', async () => {
        const before = await db.branch.count({ where: { organizationId: f.B.org.id } });
        expect(await settle(createBranch(null, form({ name: 'planted', organizationId: f.B.org.id })))).toMatchObject({ message: expect.stringContaining('غير مصرح') });
        expect(await settle(updateBranch(f.A.branch.id, null, form({ name: 'moved', organizationId: f.B.org.id })))).toMatchObject({ message: expect.stringContaining('غير مصرح') });
        expect(await db.branch.count({ where: { organizationId: f.B.org.id } })).toBe(before);
        expect((await db.branch.findUnique({ where: { id: f.A.branch.id } }))?.organizationId).toBe(f.A.org.id);
    });

    it('does not sweep another organisation pending payments', async () => {
        await sweepExpiredPendingTransactions(f.B.org.id);
        expect((await db.paymentTransaction.findUnique({ where: { id: f.pendingB.id } }))?.status).toBe('PENDING');
    });
});
