import { getDefaultPermissions } from '../app/lib/permissions';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ tenant: null as any, warehouse: null as any, db: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: async () => state.tenant }));
vi.mock('@/app/lib/warehouse-context', () => ({ getWarehouseContext: async () => state.warehouse }));
vi.mock('@/app/lib/notifications/notificationTriggers', () => ({ sendAndPersistNotification: vi.fn(), notifyWarehouseUsers: vi.fn() }));
import { POST as resolve } from '../app/api/warehouse-operations/resolve/route';
import { POST as paySupplier } from '../app/api/warehouse-portal/purchases/[id]/payments/route';
import { POST as payInvoice } from '../app/api/warehouse-portal/invoices/[id]/payments/route';
import { POST as requestReturn } from '../app/api/warehouses/orders/[id]/returns/route';

// Resolving an unconfirmed key answers «recorded» or voids it, atomically with the
// operation routes: a voided key is refused if its old request arrives later, so
// the client can safely use a new key. Answers only within the caller's scope.
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } }); state.db = db;
const post = (body: unknown) => new NextRequest('http://localhost/api/x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const ask = async (body: unknown) => { const r = await resolve(post(body)); return { code: r.status, body: await r.json() }; };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const newKey = () => randomUUID().replace(/-/g, '');
let f: any;
beforeEach(async () => {
    const tag = randomUUID();
    const org = await db.organization.create({ data: { name: `Resolve ${tag}` } });
    const branch = await db.branch.create({ data: { name: 'Branch', organizationId: org.id } });
    const otherOrg = await db.organization.create({ data: { name: `Other ${tag}` } });
    const otherBranch = await db.branch.create({ data: { name: 'Other', organizationId: otherOrg.id } });
    const warehouse = await db.warehouse.create({ data: { name: `W ${tag}`, operatingMode: 'FULL' } });
    const otherWarehouse = await db.warehouse.create({ data: { name: `W2 ${tag}` } });
    const owner = await db.user.create({ data: { email: `${tag}@test.invalid`, password: 'x', role: 'WAREHOUSE', warehouseId: warehouse.id, warehouseUserType: 'OWNER' } });
    const drug = await db.globalDrug.create({ data: { barcode: tag, tradeName: 'Medicine', scientificName: 'Test', alternatives: [] } });
    const order = await db.warehouseOrder.create({ data: { warehouseId: warehouse.id, branchId: branch.id, status: 'DELIVERED', totalAmount: 1000,
        items: { create: { drugId: drug.id, quantity: 10, unitPrice: 100, quotedPrice: 100, status: 'AVAILABLE', unitsPerPack: 2 } } } });
    const foreignOrder = await db.warehouseOrder.create({ data: { warehouseId: warehouse.id, branchId: otherBranch.id, status: 'DELIVERED' } });
    const invoice = await db.warehouseInvoice.create({ data: { warehouseId: warehouse.id, organizationId: org.id, orderId: order.id, invoiceNumber: tag, total: 1000 } });
    const wholesaler = await db.warehouseSupplier.create({ data: { warehouseId: warehouse.id, name: 'Wholesaler' } });
    const payable = await db.warehousePurchase.create({ data: { warehouseId: warehouse.id, supplierId: wholesaler.id, invoiceNumber: tag, total: 1000 } });
    f = { org, branch, warehouse, otherWarehouse, owner, order, foreignOrder, invoice, payable };
    state.warehouse = { warehouseId: warehouse.id, user: { id: owner.id, role: 'WAREHOUSE', name: 'Owner' } };
    state.tenant = { organizationId: org.id, tenantBranchWhere: { branchId: branch.id }, userPermissions: getDefaultPermissions('ADMIN'), user: { id: owner.id, name: 'Admin', role: 'ADMIN', branchId: branch.id } };
});
afterAll(() => db.$disconnect());
const supplierUrl = () => `/api/warehouse-portal/purchases/${f.payable.id}/payments`;
const invoiceUrl = () => `/api/warehouse-portal/invoices/${f.invoice.id}/payments`;

describe('resolving an unconfirmed key', () => {
    it('recorded key → recorded, nothing changes', async () => {
        const key = newKey();
        expect((await paySupplier(post({ idempotencyKey: key, amount: 100 }), params(f.payable.id))).status).toBe(201);
        expect(await ask({ url: supplierUrl(), key })).toEqual({ code: 200, body: { recorded: true } });
        expect(await ask({ url: supplierUrl(), key })).toEqual({ code: 200, body: { recorded: true } });
    });
    it('unknown key → voided; the old request arriving later is refused and applies nothing (operation routes)', async () => {
        const key = newKey();
        expect((await ask({ url: supplierUrl(), key })).body).toEqual({ recorded: false, voided: true });
        const late = await paySupplier(post({ idempotencyKey: key, amount: 100 }), params(f.payable.id));
        expect(late.status).toBe(409);
        expect(await db.warehouseSupplierPayment.count({ where: { purchaseId: f.payable.id } })).toBe(0);
        // Asking again gives the same answer.
        expect((await ask({ url: supplierUrl(), key })).body).toEqual({ recorded: false, voided: true });
    });
    it('invoice payments: an unknown key is voided and a late request with it is refused', async () => {
        const key = newKey();
        expect((await ask({ url: invoiceUrl(), key })).body).toEqual({ recorded: false, voided: true });
        expect((await payInvoice(post({ idempotencyKey: key, amount: 100 }), params(f.invoice.id))).status).toBe(409);
        expect(await db.warehousePayment.count({ where: { invoiceId: f.invoice.id } })).toBe(0);
        const paidKey = newKey();
        expect((await payInvoice(post({ idempotencyKey: paidKey, amount: 100 }), params(f.invoice.id))).status).toBe(201);
        expect((await ask({ url: invoiceUrl(), key: paidKey })).body).toEqual({ recorded: true });
    });
    it('pharmacy order returns: voided in the order\'s warehouse; a late return request with it is refused', async () => {
        const key = newKey();
        expect((await ask({ url: `/api/warehouses/orders/${f.order.id}/returns`, key })).body).toEqual({ recorded: false, voided: true });
        expect((await requestReturn(post({ idempotencyKey: key, items: [], reason: 'late' }), params(f.order.id))).status).toBe(409);
        expect(await db.warehouseReturn.count({ where: { orderId: f.order.id } })).toBe(0);
        expect((await ask({ url: `/api/warehouses/orders/${f.foreignOrder.id}/returns`, key: newKey() })).code).toBe(404);
    });
    it('race: resolve and the old request at the same time (both orderings exercised) → either recorded with one payment, or voided with none', async () => {
        const seen = new Set<string>();
        for (let i = 0; i < 24; i++) {
            const key = newKey();
            const before = await db.warehouseSupplierPayment.count({ where: { purchaseId: f.payable.id } });
            // Staggered so both orderings happen: the old request first, or the resolve first.
            const delayed = new Promise(r => setTimeout(r, (i % 8) * 5)).then(() => ask({ url: supplierUrl(), key }));
            const [late, answer] = await Promise.all([paySupplier(post({ idempotencyKey: key, amount: 10 }), params(f.payable.id)), delayed]);
            seen.add(answer.body.recorded ? 'recorded' : 'voided');
            const added = (await db.warehouseSupplierPayment.count({ where: { purchaseId: f.payable.id } })) - before;
            if (answer.body.recorded) { expect(late.status).toBe(201); expect(added).toBe(1); }
            else { expect(answer.body).toEqual({ recorded: false, voided: true }); expect(late.status).toBe(409); expect(added).toBe(0); }
        }
        expect([...seen].sort()).toEqual(['recorded', 'voided']);
    });
    it('a key voided in one warehouse does not affect another warehouse', async () => {
        const key = newKey();
        await ask({ url: supplierUrl(), key });
        expect(await db.warehouseOperation.count({ where: { key, warehouseId: f.otherWarehouse.id } })).toBe(0);
    });
    it('rejects invalid keys and URLs that are not warehouse operations; unauthenticated callers get no answer', async () => {
        expect((await ask({ url: supplierUrl(), key: 'short' })).code).toBe(400);
        expect((await ask({ url: '/api/sales', key: newKey() })).code).toBe(400);
        expect((await ask({ key: newKey() })).code).toBe(400);
        state.warehouse = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        expect((await ask({ url: supplierUrl(), key: newKey() })).code).toBe(401);
    });
});
