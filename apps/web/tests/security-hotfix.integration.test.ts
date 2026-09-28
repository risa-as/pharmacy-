// Security hotfix (2026-09-28), against the isolated PostgreSQL. The seven gaps found by
// calling server actions directly (reference section 42) and the functions next to them.
// Only the session identity is mocked; getTenantContext reads role and overrides from the
// database. Every refusal is checked in the database (the row is unchanged, nothing
// created), and every refused case has an allowed twin that must still work.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const state = vi.hoisted(() => ({ db: null as any, session: null as any }));
vi.mock('@/app/lib/audit', () => ({ logAudit: async () => {} }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
// A successful form action ends with redirect(); here it is a recognisable throw.
vi.mock('next/navigation', () => ({
    redirect: (to: string) => { throw Object.assign(new Error('REDIRECT ' + to), { redirected: to }); },
    notFound: () => { throw Object.assign(new Error('NOT_FOUND'), { notFound: true }); },
}));
vi.mock('@/app/lib/saas-guards', () => ({ checkFeatureAccess: async () => ({ allowed: true }), checkPlanLimit: async () => ({ allowed: true, current: 0, max: 99 }) }));

import { createBackup } from '../app/lib/actions/settings';
import { createUser as createUserForm } from '../app/lib/actions/create-user-safe';
import { createUser, updateUser, deleteUser, getUserById, getUsers } from '../app/lib/actions/user';
import { createPurchase as createInvoice, deletePurchase as deleteInvoice } from '../app/lib/actions/invoice';
import { updateBatchQuantity, deleteInventory, deleteBatch, createInventory } from '../app/lib/actions/inventory';
import CreateUserPage from '../app/dashboard/users/create/page';
import EditUserPage from '../app/dashboard/users/[id]/edit/page';
import { Role } from '@prisma/client';

/** The `branches` prop handed to the form inside a rendered server page. */
function branchesProp(node: any): any[] | undefined {
    if (!node || typeof node !== 'object') return undefined;
    if (node.props?.branches) return node.props.branches;
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
        const found = branchesProp(child);
        if (found) return found;
    }
    return undefined;
}

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
const key = randomUUID().slice(0, 8);
const MARK = 'FOREIGN-' + key;
let f: any;

async function as(user: any, overrides: Record<string, boolean> = {}) {
    await db.user.update({ where: { id: user.id }, data: { permissions: Object.keys(overrides).length ? JSON.stringify(overrides) : null } });
    state.session = { user: { id: user.id, role: user.role, branchId: user.branchId } };
}
const form = (fields: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); return fd; };
/** Runs a form action: its answer, or 'redirect' when it succeeded and redirected. */
async function submit(run: () => Promise<any>) {
    try { return await run(); } catch (e: any) { if (e?.redirected) return 'redirect'; throw e; }
}
const userRow = (id: string) => db.user.findUnique({ where: { id }, select: { name: true, email: true, role: true, branchId: true, password: true } });
const newEmail = () => `sh-${randomUUID().slice(0, 8)}@test.invalid`;
const userFields = (extra: Record<string, string>) => ({ name: 'New ' + key, email: newEmail(), password: 'Secret-' + key, role: 'CASHIER', ...extra });

beforeAll(async () => {
    const orgA = await db.organization.create({ data: { name: 'SH-A ' + key } });
    const orgB = await db.organization.create({ data: { name: 'SH-B ' + key } });
    const a1 = await db.branch.create({ data: { name: 'A1 ' + key, organizationId: orgA.id } });
    const b1 = await db.branch.create({ data: { name: 'B1 ' + MARK, organizationId: orgB.id } });
    const mk = (role: string, branchId: string | null, tag: string) => db.user.create({ data: { email: `sh-${tag}-${key}@test.invalid`, name: tag + ' ' + key, password: 'hash-' + tag, role, branchId } });
    const users = {
        owner: await mk('SUPER_ADMIN', null, 'owner'), adminA: await mk('ADMIN', a1.id, 'admina'), pharmacistA: await mk('PHARMACIST', a1.id, 'pharma'),
        cashierA: await mk('CASHIER', a1.id, 'casha'), adminB: await mk('ADMIN', b1.id, 'adminb'), cashierB: await mk('CASHIER', b1.id, 'cashb'),
    };
    const drug = await db.globalDrug.create({ data: { barcode: 'SH-' + key, tradeName: 'SH drug', scientificName: 'Shol', alternatives: [] } });
    const stock = async (branchId: string) => {
        const inv = await db.inventory.create({ data: { branchId, drugId: drug.id, price: 10, cost: 5 } });
        return { inv, batch: await db.batch.create({ data: { inventoryId: inv.id, batchNumber: 'B', quantity: 10, initialQuantity: 10, costPrice: 5, expiryDate: new Date('2030-01-01') } }) };
    };
    const supplierA = await db.supplier.create({ data: { name: 'Supplier A ' + key, organizationId: orgA.id } });
    const supplierB = await db.supplier.create({ data: { name: 'Supplier ' + MARK, organizationId: orgB.id } });
    await db.patient.create({ data: { name: 'Patient ' + MARK, phone: 'P-' + MARK, branchId: b1.id } });
    await db.patient.create({ data: { name: 'Own patient ' + key, phone: 'P-A-' + key, branchId: a1.id } });
    f = { orgA, orgB, a1, b1, ...users, drug, supplierA, supplierB, stockA: await stock(a1.id), stockB: await stock(b1.id) };
});
beforeEach(() => { state.session = null; });
afterAll(async () => { await db.$disconnect(); });

describe('backup (F1)', () => {
    it('is refused without canBackup, and to the platform owner (no organisation)', async () => {
        await as(f.cashierA);
        expect(await createBackup()).toMatchObject({ success: false });
        await as(f.owner);
        expect(await createBackup()).toMatchObject({ success: false });
    });
    it('holds only the caller organisation, and never a stored password', async () => {
        await as(f.adminA);
        const result: any = await createBackup();
        expect(result.success).toBe(true);
        expect(result.data).not.toContain(MARK);
        expect(result.data).not.toContain('"password"');
        expect(result.data).not.toContain('hash-');
        const data = JSON.parse(result.data).data;
        expect(data.users.map((u: any) => u.email).sort()).toEqual([f.adminA.email, f.cashierA.email, f.pharmacistA.email].sort());
        expect(data.patients.map((p: any) => p.name)).toEqual(['Own patient ' + key]);
        expect(data.suppliers.map((s: any) => s.id)).toEqual([f.supplierA.id]);
    });
});

describe('creating users (F2)', () => {
    it('create-user-safe stops without a session or without canManageUsers, creating nothing', async () => {
        const fields = userFields({ role: 'ADMIN', branchId: f.a1.id });
        state.session = null;
        expect(await submit(() => createUserForm(null, form(fields)))).toMatchObject({ message: expect.any(String) });
        await as(f.cashierA);
        expect(await submit(() => createUserForm(null, form(fields)))).toMatchObject({ message: expect.any(String) });
        expect(await db.user.count({ where: { email: fields.email } })).toBe(0);
    });
    it('refuses a branch of another organisation, in both create actions', async () => {
        await as(f.adminB);
        for (const action of [createUserForm, createUser]) {
            const fields = userFields({ role: 'ADMIN', branchId: f.a1.id });
            expect(await submit(() => action(null, form(fields)))).toMatchObject({ message: expect.any(String) });
            expect(await db.user.count({ where: { email: fields.email } })).toBe(0);
        }
    });
    it('a delegated manager cannot grant ADMIN; an ADMIN creates users in own branch', async () => {
        await as(f.pharmacistA, { canManageUsers: true });
        const promoted = userFields({ role: 'ADMIN', branchId: f.a1.id });
        expect(await submit(() => createUserForm(null, form(promoted)))).toMatchObject({ message: expect.any(String) });
        expect(await db.user.count({ where: { email: promoted.email } })).toBe(0);
        await as(f.adminA);
        const ok = userFields({ role: 'CASHIER', branchId: f.a1.id });
        expect(await submit(() => createUserForm(null, form(ok)))).toBe('redirect');
        expect(await db.user.findUnique({ where: { email: ok.email }, select: { role: true, branchId: true } })).toEqual({ role: 'CASHIER', branchId: f.a1.id });
    });
});

describe('editing, deleting and reading users (F3 and neighbours)', () => {
    it('never reaches the platform owner: no edit (with or without a branch), no delete, no read', async () => {
        await as(f.adminA);
        const before = await userRow(f.owner.id);
        for (const branchId of [f.a1.id, '']) {
            const r = await submit(() => updateUser(f.owner.id, null, form({ name: 'Taken', email: f.owner.email, password: 'NewSecret-1', role: 'ADMIN', branchId })));
            expect(r).not.toBe('redirect');
        }
        expect(await submit(() => deleteUser(f.owner.id))).toMatchObject({ message: expect.any(String) });
        expect(await getUserById(f.owner.id)).toBeNull();
        expect(await userRow(f.owner.id)).toEqual(before);
    });
    it('cannot move an own user into another organisation, nor touch a user of another organisation', async () => {
        await as(f.adminA);
        const cashier = await userRow(f.cashierA.id);
        expect(await submit(() => updateUser(f.cashierA.id, null, form({ name: 'Moved', email: f.cashierA.email, role: 'ADMIN', branchId: f.b1.id })))).not.toBe('redirect');
        expect(await userRow(f.cashierA.id)).toEqual(cashier);
        const foreign = await userRow(f.cashierB.id);
        expect(await submit(() => updateUser(f.cashierB.id, null, form({ name: 'X', email: f.cashierB.email, role: 'ADMIN', branchId: f.b1.id })))).not.toBe('redirect');
        expect(await submit(() => deleteUser(f.cashierB.id))).toMatchObject({ message: expect.any(String) });
        expect(await getUserById(f.cashierB.id)).toBeNull();
        expect(await userRow(f.cashierB.id)).toEqual(foreign);
    });
    it('a delegated manager cannot edit an ADMIN (e.g. reset its password)', async () => {
        await as(f.pharmacistA, { canManageUsers: true });
        const admin = await userRow(f.adminA.id);
        expect(await submit(() => updateUser(f.adminA.id, null, form({ name: 'X', email: f.adminA.email, password: 'NewSecret-2', role: 'ADMIN', branchId: f.a1.id })))).not.toBe('redirect');
        expect(await userRow(f.adminA.id)).toEqual(admin);
    });
    it('an ADMIN still edits and deletes own users; reads return no password', async () => {
        await as(f.adminA);
        expect(await submit(() => updateUser(f.pharmacistA.id, null, form({ name: 'Edited ' + key, email: f.pharmacistA.email, role: 'PHARMACIST', branchId: f.a1.id })))).toBe('redirect');
        expect((await userRow(f.pharmacistA.id))!.name).toBe('Edited ' + key);
        const read: any = await getUserById(f.pharmacistA.id);
        expect(read.email).toBe(f.pharmacistA.email);
        expect(read).not.toHaveProperty('password');
        expect((await getUsers()).every((u: any) => !('password' in u))).toBe(true);
        const temp = await db.user.create({ data: { email: newEmail(), password: 'x', role: 'CASHIER', branchId: f.a1.id } });
        expect(await submit(() => deleteUser(temp.id))).toBeUndefined();
        expect(await db.user.count({ where: { id: temp.id } })).toBe(0);
    });
});

describe('user pages', () => {
    it('open for a delegated manager with only its own branch, and for an ADMIN with its organisation branches', async () => {
        await as(f.pharmacistA, { canManageUsers: true });
        expect(branchesProp(await CreateUserPage())!.map((b: any) => b.id)).toEqual([f.a1.id]);
        const edit = await EditUserPage({ params: Promise.resolve({ id: f.cashierA.id }) });
        expect(branchesProp(edit)!.map((b: any) => b.id)).toEqual([f.a1.id]);
        expect((edit as any)).toBeTruthy();
        await as(f.adminA);
        const ids = branchesProp(await CreateUserPage())!.map((b: any) => b.id);
        expect(ids).toContain(f.a1.id);
        expect(ids).not.toContain(f.b1.id);
    });
    it('the edit page hands no password to the browser form, and hides users outside the scope', async () => {
        await as(f.adminA);
        const page: any = await EditUserPage({ params: Promise.resolve({ id: f.cashierA.id }) });
        const form = (function find(n: any): any { if (!n || typeof n !== 'object') return; if (n.props?.user) return n; for (const c of [].concat(n.props?.children ?? [])) { const r = find(c); if (r) return r; } })(page);
        expect(form.props.user.id).toBe(f.cashierA.id);
        expect(form.props.user).not.toHaveProperty('password');
        await expect(EditUserPage({ params: Promise.resolve({ id: f.owner.id }) })).rejects.toMatchObject({ notFound: true });
        await expect(EditUserPage({ params: Promise.resolve({ id: f.cashierB.id }) })).rejects.toMatchObject({ notFound: true });
    });
    it('user roles are ADMIN, SUPER_ADMIN, PHARMACIST, CASHIER, WAREHOUSE: there is no MANAGER user role to exclude', () => {
        // MANAGER exists only as a warehouse user type (WarehouseUserType), on WAREHOUSE users with no branch.
        expect(Object.keys(Role).sort()).toEqual(['ADMIN', 'CASHIER', 'PHARMACIST', 'SUPER_ADMIN', 'WAREHOUSE']);
    });
});

describe('legacy purchase invoices (F4, F5)', () => {
    const invoice = (branchId: string, status = 'PENDING') => db.purchase.create({ data: { branchId, supplierId: branchId === f.a1.id ? f.supplierA.id : f.supplierB.id, total: 100, status, items: { create: [{ drugId: f.drug.id, quantity: 2, cost: 50 }] } } });
    it('delete: another organisation and a received invoice are refused and kept; own pending one is deleted', async () => {
        const foreign = await invoice(f.a1.id);
        await as(f.adminB);
        expect(await deleteInvoice(foreign.id)).toMatchObject({ message: expect.any(String) });
        await as(f.cashierB);
        expect(await deleteInvoice(foreign.id)).toMatchObject({ message: expect.any(String) });
        expect(await db.purchase.count({ where: { id: foreign.id } })).toBe(1);
        await as(f.adminA);
        const received = await invoice(f.a1.id, 'COMPLETED');
        expect(await deleteInvoice(received.id)).toMatchObject({ message: expect.any(String) });
        expect(await db.purchase.count({ where: { id: received.id } })).toBe(1);
        expect(await deleteInvoice(foreign.id)).toBeUndefined();
        expect(await db.purchase.count({ where: { id: foreign.id } })).toBe(0);
    });
    it('create: refused without permission or outside the organisation, with no stock or price change', async () => {
        const items = (batchNumber: string) => JSON.stringify([{ drugId: f.drug.id, quantity: 500, cost: 1, sellingPrice: 0.5, expiryDate: '2031-01-01', batchNumber }]);
        const priceA = async () => (await db.inventory.findUnique({ where: { id: f.stockA.inv.id } }))!.price;
        await as(f.cashierB);
        expect(await submit(() => createInvoice(null, form({ supplierId: f.supplierA.id, branchId: f.a1.id, itemsData: items('X1-' + key) })))).toMatchObject({ message: expect.any(String) });
        await as(f.adminB);
        expect(await submit(() => createInvoice(null, form({ supplierId: f.supplierB.id, branchId: f.a1.id, itemsData: items('X2-' + key) })))).toMatchObject({ message: expect.any(String) });
        await as(f.adminA);
        expect(await submit(() => createInvoice(null, form({ supplierId: f.supplierB.id, branchId: f.a1.id, itemsData: items('X3-' + key) })))).toMatchObject({ message: expect.any(String) });
        expect(await db.batch.count({ where: { batchNumber: { in: ['X1', 'X2', 'X3'].map(x => x + '-' + key) } } })).toBe(0);
        expect(await priceA()).toBe(10);
        expect(await submit(() => createInvoice(null, form({ supplierId: f.supplierA.id, branchId: f.a1.id, itemsData: items('OK-' + key) })))).toBe('redirect');
        expect(await db.batch.count({ where: { batchNumber: 'OK-' + key, inventory: { branchId: f.a1.id } } })).toBe(1);
    });
});

describe('inventory (F6, F7 and neighbours)', () => {
    const qty = async (id: string) => (await db.batch.findUnique({ where: { id } }))?.quantity;
    it('batch quantity: refused without canEditDrug and for another organisation; allowed for own batch', async () => {
        await as(f.cashierA);
        expect(await updateBatchQuantity(f.stockA.batch.id, 1)).toMatchObject({ message: expect.any(String) });
        await as(f.adminA);
        expect(await updateBatchQuantity(f.stockB.batch.id, 1)).toMatchObject({ message: expect.any(String) });
        expect(await updateBatchQuantity(f.stockA.batch.id, -3)).toMatchObject({ message: expect.any(String) });
        expect([await qty(f.stockA.batch.id), await qty(f.stockB.batch.id)]).toEqual([10, 10]);
        expect(await updateBatchQuantity(f.stockA.batch.id, 9)).toBeUndefined();
        expect(await qty(f.stockA.batch.id)).toBe(9);
    });
    it('deleting a batch or an inventory row of another organisation is refused and keeps them', async () => {
        await as(f.adminA);
        expect(await deleteBatch(f.stockB.batch.id)).toMatchObject({ message: expect.any(String) });
        expect(await deleteInventory(f.stockB.inv.id)).toMatchObject({ message: expect.any(String) });
        expect(await db.batch.count({ where: { id: f.stockB.batch.id } })).toBe(1);
        expect(await db.inventory.count({ where: { id: f.stockB.inv.id } })).toBe(1);
    });
    it('own inventory row is still deleted with its batches', async () => {
        const inv = await db.inventory.create({ data: { branchId: f.a1.id, drugId: (await db.globalDrug.create({ data: { barcode: 'SH2-' + key, tradeName: 'x', scientificName: 'x', alternatives: [] } })).id, price: 1, cost: 1 } });
        await db.batch.create({ data: { inventoryId: inv.id, batchNumber: 'D', quantity: 1, initialQuantity: 1, costPrice: 1, expiryDate: new Date('2030-01-01') } });
        await as(f.adminA);
        expect(await deleteInventory(inv.id)).toBeUndefined();
        expect(await db.inventory.count({ where: { id: inv.id } })).toBe(0);
    });
    it('creating an inventory row in another organisation branch is refused', async () => {
        await as(f.adminA);
        const drug = await db.globalDrug.create({ data: { barcode: 'SH3-' + key, tradeName: 'y', scientificName: 'y', alternatives: [] } });
        expect(await submit(() => createInventory(null, form({ branchId: f.b1.id, drugId: drug.id, price: '1', cost: '1' })))).toMatchObject({ message: expect.any(String) });
        expect(await db.inventory.count({ where: { drugId: drug.id } })).toBe(0);
        expect(await submit(() => createInventory(null, form({ branchId: f.a1.id, drugId: drug.id, price: '1', cost: '1' })))).toBe('redirect');
        expect(await db.inventory.count({ where: { drugId: drug.id, branchId: f.a1.id } })).toBe(1);
    });
});
