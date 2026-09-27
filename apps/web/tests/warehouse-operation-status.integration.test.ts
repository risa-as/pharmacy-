import { getDefaultPermissions } from '../app/lib/permissions';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ tenant: null as any, warehouse: null as any, db: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: async () => state.tenant }));
vi.mock('@/app/lib/warehouse-context', () => ({ getWarehouseContext: async () => state.warehouse }));
import { POST as status } from '../app/api/warehouse-operations/status/route';

// "Was this key recorded?" answers only inside the caller's own scope, so a
// browser can resolve an old unconfirmed attempt before any new key is used.
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } }); state.db = db;
const ask = async (body: unknown) => { const r = await status(new NextRequest('http://localhost/api/warehouse-operations/status', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })); return { code: r.status, body: await r.json() }; };
const newKey = () => randomUUID().replace(/-/g, '');
let f: any;
beforeEach(async () => {
    const tag = randomUUID();
    const org = await db.organization.create({ data: { name: `Status ${tag}` } });
    const branch = await db.branch.create({ data: { name: 'Branch', organizationId: org.id } });
    const otherOrg = await db.organization.create({ data: { name: `Other ${tag}` } });
    const otherBranch = await db.branch.create({ data: { name: 'Other', organizationId: otherOrg.id } });
    const warehouse = await db.warehouse.create({ data: { name: `W ${tag}` } });
    const otherWarehouse = await db.warehouse.create({ data: { name: `W2 ${tag}` } });
    const owner = await db.user.create({ data: { email: `${tag}@test.invalid`, password: 'x', role: 'WAREHOUSE', warehouseId: warehouse.id, warehouseUserType: 'OWNER' } });
    const order = await db.warehouseOrder.create({ data: { warehouseId: warehouse.id, branchId: branch.id, status: 'DELIVERED' } });
    const foreignOrder = await db.warehouseOrder.create({ data: { warehouseId: warehouse.id, branchId: otherBranch.id, status: 'DELIVERED' } });
    const invoice = await db.warehouseInvoice.create({ data: { warehouseId: warehouse.id, organizationId: org.id, orderId: order.id, invoiceNumber: tag, total: 100 } });
    f = { org, branch, warehouse, otherWarehouse, owner, order, foreignOrder, invoice };
    state.warehouse = { warehouseId: warehouse.id, user: { id: owner.id, role: 'WAREHOUSE' } };
    state.tenant = { organizationId: org.id, userPermissions: getDefaultPermissions('ADMIN'), user: { id: 'u', role: 'ADMIN', branchId: branch.id } };
});
afterAll(() => db.$disconnect());
const operation = (warehouseId: string, key: string, scope = 'supplier-payment:x') =>
    db.warehouseOperation.create({ data: { warehouseId, key, scope, requestHash: 'h', result: {} } });

describe('warehouse operation status', () => {
    it('warehouse user: a key recorded in their warehouse → recorded', async () => {
        const key = newKey(); await operation(f.warehouse.id, key);
        expect(await ask({ url: '/api/warehouse-portal/purchases/p1/payments', key })).toEqual({ code: 200, body: { recorded: true } });
    });
    it('warehouse user: an unknown key, or one recorded only in another warehouse → not recorded', async () => {
        expect((await ask({ url: '/api/warehouse-portal/settlements', key: newKey() })).body).toEqual({ recorded: false });
        const key = newKey(); await operation(f.otherWarehouse.id, key);
        expect((await ask({ url: '/api/warehouse-portal/settlements', key })).body).toEqual({ recorded: false });
    });
    it('invoice payments are recorded by their own idempotency key', async () => {
        const key = newKey();
        await db.warehousePayment.create({ data: { invoiceId: f.invoice.id, warehouseId: f.warehouse.id, idempotencyKey: key, amount: 10 } });
        expect((await ask({ url: `/api/warehouse-portal/invoices/${f.invoice.id}/payments`, key })).body).toEqual({ recorded: true });
        expect((await ask({ url: `/api/warehouse-portal/invoices/${f.invoice.id}/payments`, key: newKey() })).body).toEqual({ recorded: false });
    });
    it('pharmacy user: order returns/reconciliation keys are looked up in the order\'s warehouse, within the order scope', async () => {
        const key = newKey(); await operation(f.warehouse.id, key, `pharmacy-return:${f.org.id}:${f.order.id}`);
        expect((await ask({ url: `/api/warehouses/orders/${f.order.id}/returns`, key })).body).toEqual({ recorded: true });
        expect((await ask({ url: `/api/warehouses/orders/${f.order.id}/reconciliation`, key: newKey() })).body).toEqual({ recorded: false });
        expect((await ask({ url: `/api/warehouses/orders/${f.foreignOrder.id}/returns`, key })).code).toBe(404);
    });
    it('rejects invalid keys and URLs that are not warehouse operations', async () => {
        expect((await ask({ url: '/api/warehouse-portal/settlements', key: 'short' })).code).toBe(400);
        expect((await ask({ url: '/api/sales', key: newKey() })).code).toBe(400);
        expect((await ask({ key: newKey() })).code).toBe(400);
    });
    it('an unauthenticated caller gets the context\'s refusal, not an answer', async () => {
        state.warehouse = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        expect((await ask({ url: '/api/warehouse-portal/settlements', key: newKey() })).code).toBe(401);
    });
});
