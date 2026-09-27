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
    const mkSafe = (branchId: string, name: string) => db.safe.create({ data: { branchId, name, type: 'CASH_DRAWER', balance: 1000 } });
    const safeA1 = await mkSafe(a1.id, 'Drawer A1'), safeA2 = await mkSafe(a2.id, 'Drawer A2'), safeB1 = await mkSafe(b1.id, 'Drawer ' + MARK);
    const drug = await db.globalDrug.create({ data: { barcode: 'PM-' + key, tradeName: 'PM drug', scientificName: 'Pmol', alternatives: [] } });
    const mkBatch = async (branchId: string, label: string) => {
        const inv = await db.inventory.create({ data: { branchId, drugId: drug.id, price: 10, cost: 5 } });
        return db.batch.create({ data: { inventoryId: inv.id, batchNumber: label, quantity: 10, initialQuantity: 10, costPrice: 5, expiryDate: new Date('2030-01-01') } });
    };
    const batchA1 = await mkBatch(a1.id, 'A1'), batchA2 = await mkBatch(a2.id, 'A2'), batchB1 = await mkBatch(b1.id, MARK);
    const patientB = await db.patient.create({ data: { name: 'Patient ' + MARK, phone: 'PHONE-' + MARK, branchId: b1.id, allergies: ['pmol'] } });
    await db.loyaltyAccount.create({ data: { patientId: patientB.id, totalPoints: 7 } });
    // A foreign patient without an account: proves a refused POST creates nothing.
    const patientB2 = await db.patient.create({ data: { name: 'No account ' + MARK, phone: randomUUID(), branchId: b1.id } });
    const patientA2 = await db.patient.create({ data: { name: 'Sister patient ' + key, phone: randomUUID(), branchId: a2.id, allergies: ['pmol'] } });
    const patientA1 = await db.patient.create({ data: { name: 'Own debtor ' + key, phone: randomUUID(), branchId: a1.id, balance: 50 } });
    f = { orgA, a1, a2, b1, admin, pharmacist, cashier, safeA1, safeA2, safeB1, supplierA, supplierB, batchA1, batchA2, batchB1, patientB, patientB2, patientA1, patientA2 };
});
afterAll(() => db.$disconnect());
beforeEach(() => as(f.admin));

describe('supplier payments and ledger', () => {
    const payments = () => db.supplierPayment.count({ where: { supplierId: f.supplierA.id } });
    const supplierBalance = async () => (await db.supplier.findUnique({ where: { id: f.supplierA.id } }))!.balance;
    const safeBalance = async (id: string) => (await db.safe.findUnique({ where: { id } }))!.balance;
    const movements = (paymentId: string) => db.transaction.findMany({ where: { referenceType: 'SUPPLIER_PAYMENT', referenceId: paymentId } });
    const transfer = (extra: Record<string, unknown> = {}) => send('/x', 'POST', { branchId: f.a1.id, amount: 5, method: 'TRANSFER', ...extra });

    it('never returns another organisation\'s supplier payments', async () => {
        const response = await supplierPayments(get(`/api/suppliers/${f.supplierB.id}/payments`), params(f.supplierB.id));
        expect(response.status).toBe(404);
        expect(await leaks(response)).toBe(false);
    });

    it('requires canViewSuppliers to read payments and the ledger', async () => {
        await as(f.pharmacist, { canViewSuppliers: true });
        for (const response of [await supplierPayments(get('/x'), params(f.supplierA.id)), await supplierLedger(get('/x'), params(f.supplierA.id))]) {
            expect(response.status).toBe(200);
            expect(Array.isArray(await response.json())).toBe(true);
        }
        await as(f.pharmacist, { canViewSuppliers: false });
        expect((await supplierPayments(get('/x'), params(f.supplierA.id))).status).toBe(403);
        expect((await supplierLedger(get('/x'), params(f.supplierA.id))).status).toBe(403);
    });

    it('requires canPaySupplier to pay, and leaves the balance unchanged when refused', async () => {
        const before = await payments(), balance = await supplierBalance();
        await as(f.pharmacist, { canPaySupplier: false });
        expect((await paySupplier(transfer(), params(f.supplierA.id))).status).toBe(403);
        expect([await payments(), await supplierBalance()]).toEqual([before, balance]);
        await as(f.pharmacist, { canPaySupplier: true });
        const paid = await paySupplier(transfer(), params(f.supplierA.id));
        expect(paid.status).toBe(200);
        expect((await paid.json()).message).toBe('تم تسجيل الدفعة بنجاح');
        expect([await payments(), await supplierBalance()]).toEqual([before + 1, balance - 5]);
    });

    it('follows the agreed role defaults: the owner (ADMIN) pays; pharmacist and cashier only when granted', async () => {
        // Decision 2026-09-27: a separate canPaySupplier, off by default for pharmacist and cashier.
        // There is no MANAGER role in the database; ADMIN is the owner/manager.
        await as(f.admin);
        expect((await paySupplier(transfer({ amount: 1 }), params(f.supplierA.id))).status).toBe(200);
        for (const user of [f.pharmacist, f.cashier]) {
            await as(user);
            const before = await payments();
            expect((await paySupplier(transfer({ amount: 1 }), params(f.supplierA.id))).status).toBe(403);
            expect(await payments()).toBe(before);
        }
        // Creating purchases stays with the pharmacist; paying is separate.
        await as(f.pharmacist);
        expect((await db.user.findUnique({ where: { id: f.pharmacist.id } }))?.permissions).toBeNull();
    });

    it('pays only against a branch in the caller\'s scope', async () => {
        const before = await payments();
        expect((await paySupplier(transfer({ branchId: f.b1.id }), params(f.supplierA.id))).status).toBe(400);
        await as(f.pharmacist, { canPaySupplier: true });
        expect((await paySupplier(transfer({ branchId: f.a2.id }), params(f.supplierA.id))).status).toBe(400);
        expect(await payments()).toBe(before);
    });

    it('takes cash from the chosen drawer, in the same transaction, and records the movement', async () => {
        const requestId = randomUUID();
        const drawer = await safeBalance(f.safeA1.id), balance = await supplierBalance();
        const response = await paySupplier(send('/x', 'POST', { branchId: f.a1.id, amount: 40, method: 'CASH', safeId: f.safeA1.id, requestId }), params(f.supplierA.id));
        expect(response.status).toBe(200);
        const payment = await db.supplierPayment.findUnique({ where: { id: requestId } });
        expect(payment).toMatchObject({ safeId: f.safeA1.id, method: 'CASH', amount: 40 });
        expect(await safeBalance(f.safeA1.id)).toBe(drawer - 40);
        expect(await supplierBalance()).toBe(balance - 40);
        expect((await movements(requestId)).map(m => [m.type, m.amount, m.safeId])).toEqual([['OUT', 40, f.safeA1.id]]);
    });

    it('does not move any drawer for a cheque or a transfer', async () => {
        const drawer = await safeBalance(f.safeA1.id);
        for (const method of ['CHECK', 'TRANSFER']) {
            const requestId = randomUUID();
            expect((await paySupplier(send('/x', 'POST', { branchId: f.a1.id, amount: 7, method, safeId: f.safeA1.id, requestId }), params(f.supplierA.id))).status).toBe(200);
            expect((await db.supplierPayment.findUnique({ where: { id: requestId } }))?.safeId).toBeNull();
            expect(await movements(requestId)).toEqual([]);
        }
        expect(await safeBalance(f.safeA1.id)).toBe(drawer);
    });

    it('refuses cash beyond the drawer balance, writing nothing', async () => {
        const requestId = randomUUID();
        const before = await payments(), balance = await supplierBalance(), drawer = await safeBalance(f.safeA1.id);
        const response = await paySupplier(send('/x', 'POST', { branchId: f.a1.id, amount: drawer + 1, method: 'CASH', safeId: f.safeA1.id, requestId }), params(f.supplierA.id));
        expect(response.status).toBe(400);
        expect((await response.json()).message).toBe('رصيد الصندوق غير كافٍ لهذه الدفعة.');
        expect([await payments(), await supplierBalance(), await safeBalance(f.safeA1.id)]).toEqual([before, balance, drawer]);
        expect(await movements(requestId)).toEqual([]);
    });

    it('refuses a drawer of another branch or organisation, and cash without a drawer', async () => {
        const before = await payments(), a2 = await safeBalance(f.safeA2.id), b1 = await safeBalance(f.safeB1.id);
        for (const safeId of [f.safeA2.id, f.safeB1.id, null]) {
            expect((await paySupplier(send('/x', 'POST', { branchId: f.a1.id, amount: 1, method: 'CASH', safeId }), params(f.supplierA.id))).status).toBe(400);
        }
        expect([await payments(), await safeBalance(f.safeA2.id), await safeBalance(f.safeB1.id)]).toEqual([before, a2, b1]);
    });

    it('never pays twice for one request, whether retried after or during the first attempt', async () => {
        const drawer = await safeBalance(f.safeA1.id);
        const pay = (requestId: string, amount = 3) => paySupplier(send('/x', 'POST', { branchId: f.a1.id, amount, method: 'CASH', safeId: f.safeA1.id, requestId }), params(f.supplierA.id));
        const sequential = randomUUID();
        expect((await pay(sequential)).status).toBe(200);
        expect((await pay(sequential)).status).toBe(200);
        const concurrent = randomUUID();
        expect((await Promise.all([pay(concurrent), pay(concurrent)])).map(r => r.status)).toEqual([200, 200]);
        for (const id of [sequential, concurrent]) {
            expect(await db.supplierPayment.count({ where: { id } })).toBe(1);
            expect(await movements(id)).toHaveLength(1);
        }
        expect(await safeBalance(f.safeA1.id)).toBe(drawer - 6);
        // The same id with different details is a conflict, not a second payment.
        expect((await pay(sequential, 99)).status).toBe(400);
        expect(await safeBalance(f.safeA1.id)).toBe(drawer - 6);
    });

    it('keeps the opening balance and recalculation to the owner (ADMIN), and they never touch a drawer', async () => {
        const drawer = await safeBalance(f.safeA1.id), balance = await supplierBalance();
        await as(f.pharmacist, { canPaySupplier: true });
        expect((await setSupplierOpeningBalance({ supplierId: f.supplierA.id, branchId: f.a1.id, amount: 5 })).success).toBe(false);
        expect(await recalculateSupplierBalance(f.supplierA.id)).toBe(0);
        expect(await supplierBalance()).toBe(balance);
        await as(f.admin);
        expect((await setSupplierOpeningBalance({ supplierId: f.supplierA.id, branchId: f.a1.id, amount: 5 })).success).toBe(true);
        expect(await supplierBalance()).toBe(balance + 5);
        expect(await safeBalance(f.safeA1.id)).toBe(drawer);
        await as(f.admin);
        expect((await setSupplierOpeningBalance({ supplierId: f.supplierA.id, branchId: f.b1.id, amount: 5 })).success).toBe(false);
        expect(await db.purchase.count({ where: { supplierId: f.supplierA.id, branchId: f.b1.id } })).toBe(0);
    });

    it('enforces the same rules when the server actions are called directly', async () => {
        await as(f.pharmacist, { canViewSuppliers: false, canPaySupplier: true });
        expect(await getSupplierLedger(f.supplierA.id)).toEqual([]);
        expect(await getSupplierSummary(f.supplierA.id)).toBeNull();
        expect(await getSuppliersWithBalances()).toEqual([]);
        await as(f.pharmacist, { canPaySupplier: false });
        const balance = await supplierBalance();
        expect((await recordSupplierPayment({ supplierId: f.supplierA.id, branchId: f.a1.id, amount: 5, method: 'TRANSFER' })).success).toBe(false);
        expect(await supplierBalance()).toBe(balance);
        await as(f.pharmacist, { canPaySupplier: true });
        expect(await getSupplierSummary(f.supplierA.id)).not.toBeNull();
        expect((await recordSupplierPayment({ supplierId: f.supplierA.id, branchId: f.a1.id, amount: 5, method: 'BITCOIN' })).success).toBe(false);
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
        expect(response.status).toBe(404);
        expect(await leaks(response)).toBe(false);
        const refused = await openLoyaltyAccount(send('/x', 'POST', { patientId: f.patientB2.id }));
        expect(refused.status).toBe(404);
        expect(await db.loyaltyAccount.count({ where: { patientId: f.patientB2.id } })).toBe(0);
        const opened = await openLoyaltyAccount(send('/x', 'POST', { patientId: f.patientA1.id }));
        expect(opened.status).toBe(200);
        expect((await opened.json()).account.patientId).toBe(f.patientA1.id);
        const own = await loyaltyAccount(get(`/api/loyalty/account?patientId=${f.patientA1.id}`));
        expect(own.status).toBe(200);
        expect((await own.json()).account.patientId).toBe(f.patientA1.id);
    });

    it('requires canViewPatients for loyalty accounts', async () => {
        await as(f.pharmacist, { canViewPatients: false });
        expect((await loyaltyAccount(get(`/api/loyalty/account?patientId=${f.patientA1.id}`))).status).toBe(403);
    });

    it('checks allergies of the organisation\'s patients only, including a sister branch', async () => {
        const warnings = async (patientId: string) => {
            const response = await posAlerts(send('/x', 'POST', { scientificNames: ['Pmol'], patientId }));
            expect(response.status).toBe(200);
            return (await response.json()).allergyWarnings;
        };
        expect(await warnings(f.patientB.id)).toEqual([]);
        await as(f.pharmacist);
        expect(await warnings(f.patientA2.id)).toEqual(['Pmol']);
    });

    it('requires canViewDebts for a debtor\'s statement', async () => {
        await as(f.pharmacist, { canViewDebts: true });
        const allowed = await debtDetail(get('/x'), params(f.patientA1.id));
        expect(allowed.status).toBe(200);
        expect(await allowed.text()).toContain('Own debtor ' + key);
        await as(f.pharmacist, { canViewDebts: false });
        expect((await debtDetail(get('/x'), params(f.patientA1.id))).status).toBe(403);
    });
});

it('requires canViewProfitReport for the profit export', async () => {
    await as(f.admin, { canViewProfitReport: true });
    const allowed = await profitExport(get('/api/reports/profit/export'));
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('content-type')).toContain('spreadsheetml');
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
        const allowed = await call();
        expect(allowed.status).toBe(200);
        expect(await allowed.text()).not.toBe('');
        await as(f.admin, { ...base, [flag]: false });
        expect((await call()).status).toBe(403);
    });
});
