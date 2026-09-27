// Permission matrix (2026-09-27), against the isolated PostgreSQL. Only the session
// identity is mocked; getTenantContext reads the user's role and permission
// overrides from the database, so each case flips exactly one flag on the same
// user and sends the same request: allowed, then 403. Denied writes must leave
// the rows unchanged, and another organisation's records must never leak.
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

import { GET as supplierPayments, POST as paySupplier } from '../app/api/suppliers/[id]/payments/route';
import { GET as supplierLedger } from '../app/api/suppliers/[id]/ledger/route';
import { PATCH as editBatch } from '../app/api/batches/[id]/route';
import { GET as profitExport } from '../app/api/reports/profit/export/route';
import { GET as loyaltyAccount, POST as openLoyaltyAccount } from '../app/api/loyalty/account/route';
import { POST as posAlerts } from '../app/api/pos/alerts/route';
import { GET as debtDetail } from '../app/api/debts/[id]/route';
import { getSupplierLedger, getSupplierSummary, getSuppliersWithBalances, recordSupplierPayment,
    setSupplierOpeningBalance, recalculateSupplierBalance } from '../app/lib/actions/supplier-ledger-actions';
import { GET as backupList } from '../app/api/backup/list/route';
import { GET as auditLog } from '../app/api/audit-log/route';
import { GET as debts } from '../app/api/debts/route';
import { GET as employeesReport } from '../app/api/reports/employees/route';
import { GET as expenses } from '../app/api/expenses/route';
import { GET as inventory } from '../app/api/inventory/route';
import { GET as profitReport } from '../app/api/reports/profit/route';
import { GET as salesReport } from '../app/api/reports/sales/route';
import { GET as purchases } from '../app/api/purchases/route';
import { GET as suppliers } from '../app/api/suppliers/route';
import { GET as stocktakes } from '../app/api/inventory/stocktake/route';
import { GET as patients } from '../app/api/patients/route';
import { GET as warehouseDirectory } from '../app/api/warehouses/directory/route';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
const key = randomUUID();
const MARK = 'FOREIGN-' + key;
let f: any;

const url = (path: string) => `http://localhost${path}`;
const get = (path: string) => new NextRequest(url(path));
const send = (path: string, method: string, body: unknown) =>
    new NextRequest(url(path), { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const leaks = async (response: Response) => (await response.clone().text()).includes(MARK);

/** Sign in as `user` with its role defaults, plus these permission overrides. */
async function as(user: any, overrides: Record<string, boolean> = {}) {
    await db.user.update({ where: { id: user.id }, data: { permissions: Object.keys(overrides).length ? JSON.stringify(overrides) : null } });
    state.session = { user: { id: user.id, role: user.role, branchId: user.branchId } };
}

beforeAll(async () => {
    const orgA = await db.organization.create({ data: { name: 'PM-A ' + key } });
    const orgB = await db.organization.create({ data: { name: 'PM-B ' + key } });
    const a1 = await db.branch.create({ data: { name: 'A1 ' + key, organizationId: orgA.id } });
    const a2 = await db.branch.create({ data: { name: 'A2 sister ' + key, organizationId: orgA.id } });
    const b1 = await db.branch.create({ data: { name: 'B1 ' + MARK, organizationId: orgB.id } });
    const mk = (role: string, branchId: string) => db.user.create({ data: { email: `pm-${role}-${randomUUID()}@test.invalid`, password: 'unused', role, branchId } });
    const admin = await mk('ADMIN', a1.id), pharmacist = await mk('PHARMACIST', a1.id), cashier = await mk('CASHIER', a1.id);
    const supplierA = await db.supplier.create({ data: { name: 'Own supplier ' + key, organizationId: orgA.id } });
    const supplierB = await db.supplier.create({ data: { name: 'Supplier ' + MARK, organizationId: orgB.id } });
    await db.supplierPayment.create({ data: { supplierId: supplierB.id, branchId: b1.id, amount: 999, notes: MARK } });
    const drug = await db.globalDrug.create({ data: { barcode: 'PM-' + key, tradeName: 'PM drug', scientificName: 'Pmol', alternatives: [] } });
    const mkBatch = async (branchId: string, label: string) => {
        const inv = await db.inventory.create({ data: { branchId, drugId: drug.id, price: 10, cost: 5 } });
        return db.batch.create({ data: { inventoryId: inv.id, batchNumber: label, quantity: 10, initialQuantity: 10, costPrice: 5, expiryDate: new Date('2030-01-01') } });
    };
    const batchA1 = await mkBatch(a1.id, 'A1'), batchA2 = await mkBatch(a2.id, 'A2'), batchB1 = await mkBatch(b1.id, MARK);
    const patientB = await db.patient.create({ data: { name: 'Patient ' + MARK, phone: 'PHONE-' + MARK, branchId: b1.id, allergies: ['pmol'] } });
    await db.loyaltyAccount.create({ data: { patientId: patientB.id, totalPoints: 7 } });
    const patientA2 = await db.patient.create({ data: { name: 'Sister patient ' + key, phone: randomUUID(), branchId: a2.id, allergies: ['pmol'] } });
    const patientA1 = await db.patient.create({ data: { name: 'Own debtor ' + key, phone: randomUUID(), branchId: a1.id, balance: 50 } });
    f = { orgA, a1, a2, b1, admin, pharmacist, cashier, supplierA, supplierB, batchA1, batchA2, batchB1, patientB, patientA1, patientA2 };
});
afterAll(() => db.$disconnect());
beforeEach(() => as(f.admin));

describe('supplier payments and ledger', () => {
    it('never returns another organisation\'s supplier payments', async () => {
        const response = await supplierPayments(get(`/api/suppliers/${f.supplierB.id}/payments`), params(f.supplierB.id));
        expect(await leaks(response)).toBe(false);
    });

    it('requires canViewSuppliers to read payments and the ledger', async () => {
        await as(f.pharmacist, { canViewSuppliers: true });
        expect((await supplierPayments(get('/x'), params(f.supplierA.id))).status).toBe(200);
        expect((await supplierLedger(get('/x'), params(f.supplierA.id))).status).toBe(200);
        await as(f.pharmacist, { canViewSuppliers: false });
        expect((await supplierPayments(get('/x'), params(f.supplierA.id))).status).toBe(403);
        expect((await supplierLedger(get('/x'), params(f.supplierA.id))).status).toBe(403);
    });

    it('requires canCreatePurchase to record a payment, and leaves the balance unchanged when refused', async () => {
        const count = () => db.supplierPayment.count({ where: { supplierId: f.supplierA.id } });
        const before = await count();
        await as(f.pharmacist, { canCreatePurchase: false });
        expect((await paySupplier(send('/x', 'POST', { branchId: f.a1.id, amount: 5 }), params(f.supplierA.id))).status).toBe(403);
        expect(await count()).toBe(before);
        await as(f.pharmacist, { canCreatePurchase: true });
        expect((await paySupplier(send('/x', 'POST', { branchId: f.a1.id, amount: 5 }), params(f.supplierA.id))).status).toBe(200);
        expect(await count()).toBe(before + 1);
    });

    it('records a payment only against a branch in the caller\'s scope', async () => {
        const count = () => db.supplierPayment.count({ where: { supplierId: f.supplierA.id } });
        const before = await count();
        expect((await paySupplier(send('/x', 'POST', { branchId: f.b1.id, amount: 5 }), params(f.supplierA.id))).status).not.toBe(200);
        await as(f.pharmacist, { canCreatePurchase: true });
        expect((await paySupplier(send('/x', 'POST', { branchId: f.a2.id, amount: 5 }), params(f.supplierA.id))).status).not.toBe(200);
        expect(await count()).toBe(before);
    });

    it('enforces the same rules when the server actions are called directly', async () => {
        await as(f.pharmacist, { canViewSuppliers: false, canCreatePurchase: false });
        expect(await getSupplierLedger(f.supplierA.id)).toEqual([]);
        expect(await getSupplierSummary(f.supplierA.id)).toBeNull();
        expect(await getSuppliersWithBalances()).toEqual([]);
        const balance = (await db.supplier.findUnique({ where: { id: f.supplierA.id } }))!.balance;
        expect((await recordSupplierPayment({ supplierId: f.supplierA.id, branchId: f.a1.id, amount: 5, method: 'CASH' })).success).toBe(false);
        expect((await setSupplierOpeningBalance({ supplierId: f.supplierA.id, branchId: f.a1.id, amount: 5 })).success).toBe(false);
        await recalculateSupplierBalance(f.supplierA.id);
        expect((await db.supplier.findUnique({ where: { id: f.supplierA.id } }))!.balance).toBe(balance);
        await as(f.admin);
        expect((await setSupplierOpeningBalance({ supplierId: f.supplierA.id, branchId: f.b1.id, amount: 5 })).success).toBe(false);
        expect(await db.purchase.count({ where: { supplierId: f.supplierA.id, branchId: f.b1.id } })).toBe(0);
    });
});

describe('batch edits', () => {
    const qty = async (id: string) => (await db.batch.findUnique({ where: { id } }))!.quantity;
    it('requires canEditDrug and leaves the batch unchanged when refused', async () => {
        await as(f.pharmacist, { canEditDrug: false });
        expect((await editBatch(send('/x', 'PATCH', { quantity: 3 }), params(f.batchA1.id))).status).toBe(403);
        expect(await qty(f.batchA1.id)).toBe(10);
        await as(f.pharmacist, { canEditDrug: true });
        expect((await editBatch(send('/x', 'PATCH', { quantity: 9 }), params(f.batchA1.id))).status).toBe(200);
        expect(await qty(f.batchA1.id)).toBe(9);
    });

    it('keeps a branch employee to their own branch, and an admin to their organisation', async () => {
        await as(f.pharmacist, { canEditDrug: true });
        expect((await editBatch(send('/x', 'PATCH', { quantity: 1 }), params(f.batchA2.id))).status).not.toBe(200);
        expect(await qty(f.batchA2.id)).toBe(10);
        await as(f.admin);
        expect((await editBatch(send('/x', 'PATCH', { quantity: 1 }), params(f.batchB1.id))).status).not.toBe(200);
        expect(await qty(f.batchB1.id)).toBe(10);
    });
});

describe('patients, loyalty, allergies and debts', () => {
    it('never returns or opens a loyalty account for another organisation\'s patient', async () => {
        const response = await loyaltyAccount(get(`/api/loyalty/account?patientId=${f.patientB.id}`));
        expect(await leaks(response)).toBe(false);
        const before = await db.loyaltyAccount.count();
        await openLoyaltyAccount(send('/x', 'POST', { patientId: f.patientB.id }));
        await openLoyaltyAccount(send('/x', 'POST', { patientId: f.patientA1.id }));
        expect(await db.loyaltyAccount.count({ where: { patientId: f.patientA1.id } })).toBe(1);
        expect(await db.loyaltyAccount.count()).toBe(before + 1);
    });

    it('requires canViewPatients for loyalty accounts', async () => {
        await as(f.pharmacist, { canViewPatients: false });
        expect((await loyaltyAccount(get(`/api/loyalty/account?patientId=${f.patientA1.id}`))).status).toBe(403);
    });

    it('checks allergies of the organisation\'s patients only, including a sister branch', async () => {
        const warnings = async (patientId: string) => (await (await posAlerts(send('/x', 'POST', { scientificNames: ['Pmol'], patientId }))).json()).allergyWarnings;
        expect(await warnings(f.patientB.id)).toEqual([]);
        await as(f.pharmacist);
        expect(await warnings(f.patientA2.id)).toEqual(['Pmol']);
    });

    it('requires canViewDebts for a debtor\'s statement', async () => {
        await as(f.pharmacist, { canViewDebts: true });
        expect((await debtDetail(get('/x'), params(f.patientA1.id))).status).toBe(200);
        await as(f.pharmacist, { canViewDebts: false });
        expect((await debtDetail(get('/x'), params(f.patientA1.id))).status).toBe(403);
    });
});

it('requires canViewProfitReport for the profit export', async () => {
    await as(f.admin, { canViewProfitReport: true });
    expect((await profitExport(get('/api/reports/profit/export'))).status).not.toBe(403);
    await as(f.admin, { canViewProfitReport: false });
    expect((await profitExport(get('/api/reports/profit/export'))).status).toBe(403);
});

// Routes that already name a permission: flip it on the same user and request.
describe.each([
    ['backup/list', 'canBackup', () => backupList(get('/api/backup/list'))],
    ['audit-log', 'canViewAuditLog', () => auditLog(get('/api/audit-log'))],
    ['debts', 'canViewDebts', () => debts(get('/api/debts'))],
    ['reports/employees', 'canViewEmployeeReport', () => employeesReport(get('/api/reports/employees'))],
    ['expenses', 'canViewExpenses', () => expenses(get('/api/expenses'))],
    ['inventory', 'canViewInventory', () => inventory(get('/api/inventory'))],
    ['reports/profit', 'canViewProfitReport', () => profitReport(get('/api/reports/profit'))],
    ['reports/sales', 'canViewReports', () => salesReport(get('/api/reports/sales'))],
    ['purchases', 'canViewSuppliers', () => purchases(get('/api/purchases'))],
    ['suppliers', 'canViewSuppliers', () => suppliers(get('/api/suppliers'))],
    ['inventory/stocktake', 'canDoStocktake', () => stocktakes(get('/api/inventory/stocktake'))],
    ['patients', 'canViewPatients', () => patients(get('/api/patients'))],
    ['warehouses/directory', 'canViewWarehouseOrders', () => warehouseDirectory(get('/api/warehouses/directory'))],
] as const)('%s', (_route, flag, call) => {
    it(`is allowed with ${flag} and refused (403) without it`, async () => {
        // canViewSuppliers gates warehouse flags too; keep it on for that route.
        const base = flag === 'canViewWarehouseOrders' ? { canViewSuppliers: true } : {};
        await as(f.admin, { ...base, [flag]: true });
        expect((await call()).status).not.toBe(403);
        await as(f.admin, { ...base, [flag]: false });
        expect((await call()).status).toBe(403);
    });
});
