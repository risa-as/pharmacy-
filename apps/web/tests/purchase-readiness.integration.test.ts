import { getDefaultPermissions } from '../app/lib/permissions';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { receivePurchaseStock } from '../app/lib/purchase-receipt';

const state = vi.hoisted(() => ({ tenant: null as any, warehouse: null as any, db: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: async () => state.tenant }));
vi.mock('@/app/lib/warehouse-context', () => ({ getWarehouseContext: async () => state.warehouse }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app/lib/saas-guards', () => ({ checkFeatureAccess: async () => ({ allowed: true }) }));
vi.mock('@/app/lib/notifications/notificationTriggers', () => ({ notifyWarehouseUsers: vi.fn(), notifyBranchUsers: vi.fn(), sendAndPersistNotification: vi.fn() }));
import { POST as createOrder } from '../app/api/warehouses/orders/route';
import { createSmartPurchase, getPurchaseDetails, getPurchases, getLowStockInventory } from '../app/lib/actions/purchase-actions';
import { getSupplierById } from '../app/lib/actions/supplier';
import { POST as decide } from '../app/api/warehouses/orders/[id]/route';
import { PATCH as quote } from '../app/api/warehouse-portal/orders/[id]/quote/route';
import { PATCH as ship } from '../app/api/warehouse-portal/orders/[id]/shipping/route';
import { POST as pay } from '../app/api/warehouse-portal/invoices/[id]/payments/route';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
let fixture: any;
const expiry = () => new Date(Date.now() + 365 * 86400000);
const request = (body: unknown) => new NextRequest('http://localhost/api/test', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(async () => {
    const key = randomUUID();
    const org = await db.organization.create({ data: { name: `Test ${key}` } });
    const branch = await db.branch.create({ data: { name: 'Test branch', organizationId: org.id } });
    const warehouse = await db.warehouse.create({ data: { name: `Test warehouse ${key}`, operatingMode: 'FULL' } });
    const owner = await db.user.create({ data: { email: `${key}@test.invalid`, password: 'not-a-login-password', role: 'WAREHOUSE', warehouseId: warehouse.id, warehouseUserType: 'OWNER' } });
    const supplier = await db.supplier.create({ data: { name: 'Test supplier', organizationId: org.id, warehouseId: warehouse.id } });
    const drug = await db.globalDrug.create({ data: { barcode: key, tradeName: 'Test drug', scientificName: 'Test', alternatives: [], unitsPerPack: 1, unitsPerPackConfirmedAt: new Date() } });
    fixture = { org, branch, warehouse, owner, supplier, drug };
    state.tenant = { organizationId: org.id, user: { id: owner.id, role: 'ADMIN', branchId: branch.id }, tenantBranchWhere: { branchId: branch.id }, branchModelWhere: { id: branch.id }, userPermissions: getDefaultPermissions('ADMIN') };
    state.warehouse = { warehouseId: warehouse.id, user: { id: owner.id, role: 'WAREHOUSE' } };
});
afterAll(() => db.$disconnect());

async function purchase(bonus = false) {
    // A zero-cost bonus is valid only on an approved, shipped warehouse order.
    const bonusOrder = bonus ? await db.warehouseOrder.create({ data: {
        warehouseId: fixture.warehouse.id, branchId: fixture.branch.id, status: 'DELIVERED', totalAmount: 1000,
    } }) : null;
    return db.purchase.create({ data: { branchId: fixture.branch.id, supplierId: fixture.supplier.id, warehouseOrderId: bonusOrder?.id, total: 1000, items: { create: [
        { drugId: fixture.drug.id, quantity: 10, cost: 100 },
        ...(bonus ? [{ drugId: fixture.drug.id, quantity: 1, cost: 0 }] : []),
    ] } }, include: { items: true } });
}
function receipt(p: any) { return p.items.map((i: any) => ({ itemId: i.id, quantity: i.quantity, expiryDate: expiry(), batchNumber: 'TEST' })); }
async function quotedOrder() {
    return db.warehouseOrder.create({ data: { warehouseId: fixture.warehouse.id, branchId: fixture.branch.id, status: 'QUOTED', totalAmount: 1000,
        items: { create: { drugId: fixture.drug.id, quantity: 10, unitPrice: 100, quotedPrice: 100, status: 'AVAILABLE' } },
    }, include: { items: true } });
}

describe('Receipt on real PostgreSQL', () => {
    it('receives existing inventory plus free bonus, preserves selling price and records debt once', async () => {
        const inv = await db.inventory.create({ data: { drugId: fixture.drug.id, branchId: fixture.branch.id, price: 150, cost: 90 } });
        const p = await purchase(true);
        const result = await receivePurchaseStock(db, p.id, { branchId: fixture.branch.id }, receipt(p).reverse());
        expect(result.receivedCount).toBe(2);
        expect(await db.inventory.findUnique({ where: { id: inv.id } })).toMatchObject({ cost: 100, price: 150 });
        expect((await db.batch.aggregate({ where: { inventoryId: inv.id }, _sum: { quantity: true } }))._sum.quantity).toBe(11);
        expect((await db.supplier.findUniqueOrThrow({ where: { id: fixture.supplier.id } })).balance).toBe(1000);
    });
    it('two concurrent receipts produce one stock movement and one debt', async () => {
        const p = await purchase();
        const outcomes = await Promise.allSettled([0, 1].map(() => receivePurchaseStock(db, p.id, { branchId: fixture.branch.id }, receipt(p))));
        expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(await db.batch.count({ where: { inventory: { branchId: fixture.branch.id } } })).toBe(1);
        expect((await db.supplier.findUniqueOrThrow({ where: { id: fixture.supplier.id } })).balance).toBe(1000);
    });
    it.each(['duplicate', 'unknown', 'missing', 'excess', 'expired'])('rejects %s lines without changing inventory or invoice', async (kind) => {
        const p = await purchase(true); const input = receipt(p);
        if (kind === 'duplicate') input.push(input[0]);
        if (kind === 'unknown') input[0].itemId = randomUUID();
        if (kind === 'missing') input.pop();
        if (kind === 'excess') input[0].quantity++;
        if (kind === 'expired') input[0].expiryDate = new Date('2020-01-01');
        await expect(receivePurchaseStock(db, p.id, { branchId: fixture.branch.id }, input)).rejects.toThrow();
        expect((await db.purchase.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('PENDING');
        expect(await db.batch.count({ where: { inventory: { branchId: fixture.branch.id } } })).toBe(0);
    });
    it('denies another branch', async () => {
        const p = await purchase();
        await expect(receivePurchaseStock(db, p.id, { branchId: 'other-branch' }, receipt(p))).rejects.toMatchObject({ status: 404 });
    });
    it('paid receipt creates one expense, no supplier debt', async () => {
        const p = await purchase();
        await receivePurchaseStock(db, p.id, { branchId: fixture.branch.id }, receipt(p), true);
        expect((await db.expense.aggregate({ where: { branchId: fixture.branch.id }, _sum: { amount: true } }))._sum.amount).toBe(1000);
        expect((await db.supplier.findUniqueOrThrow({ where: { id: fixture.supplier.id } })).balance).toBe(0);
    });
});

describe('B2B route integration on real PostgreSQL (identity supplied by test)', () => {
    it('concurrent order retries create one order and replay the same id', async () => {
        const body = { warehouseId: fixture.warehouse.id, branchId: fixture.branch.id, idempotencyKey: randomUUID(), items: [{ drugId: fixture.drug.id, quantity: 2, unitPrice: 100 }] };
        const responses = await Promise.all([createOrder(request(body)), createOrder(request(body))]);
        expect(responses.map(r => r.status).sort()).toEqual([200, 201]);
        const payloads = await Promise.all(responses.map(r => r.json()));
        expect(payloads[0].order.id).toBe(payloads[1].order.id);
        expect(await db.warehouseOrder.count({ where: { idempotencyKey: body.idempotencyKey } })).toBe(1);
        expect((await createOrder(request({ ...body, items: [{ drugId: fixture.drug.id, quantity: 3, unitPrice: 100 }] }))).status).toBe(409);
        expect((await createOrder(request({ ...body, notes: 'different intent' }))).status).toBe(409);
    });
    it('concurrent payment retries affect the balance once and reject changed amount or metadata', async () => {
        const order = await quotedOrder();
        const approval = await (await decide(request({ action: 'APPROVED' }), { params: { id: order.id } })).json();
        const props = { params: Promise.resolve({ id: approval.invoiceId }) };
        const body = { amount: 500, idempotencyKey: randomUUID() };
        const responses = await Promise.all([pay(request(body), props), pay(request(body), props)]);
        expect(responses.map(r => r.status).sort()).toEqual([200, 201]);
        const payloads = await Promise.all(responses.map(r => r.json()));
        expect(payloads[0].payment.id).toBe(payloads[1].payment.id);
        for (const change of [{ amount: 600 }, { method: 'BANK' }, { reference: 'changed' }, { notes: 'changed' }]) {
            expect((await pay(request({ ...body, ...change }), props)).status).toBe(409);
        }
        expect((await db.warehouseInvoice.findUniqueOrThrow({ where: { id: approval.invoiceId } })).paidAmount).toBe(500);
        expect(await db.warehousePayment.count({ where: { invoiceId: approval.invoiceId } })).toBe(1);
    });
    it('different concurrent payment keys preserve both payments', async () => {
        const order = await quotedOrder();
        const approval = await (await decide(request({ action: 'APPROVED' }), { params: { id: order.id } })).json();
        const responses = await Promise.all([0, 1].map(() => pay(request({ amount: 400, idempotencyKey: randomUUID() }), { params: Promise.resolve({ id: approval.invoiceId }) })));
        expect(responses.map(r => r.status)).toEqual([201, 201]);
        expect((await db.warehouseInvoice.findUniqueOrThrow({ where: { id: approval.invoiceId } })).paidAmount).toBe(800);
        expect(await db.warehousePayment.count({ where: { invoiceId: approval.invoiceId } })).toBe(2);
    });
    it('does not allow branch filtering to override the current tenant scope', async () => {
        const p = await purchase();
        state.tenant.tenantBranchWhere = { branchId: 'other-branch' };
        state.tenant.branchModelWhere = { id: 'other-branch' };
        expect(await getPurchaseDetails(p.id)).toBeNull();
        expect(await getPurchases(fixture.branch.id)).toEqual([]);
        await expect(getLowStockInventory(fixture.branch.id)).rejects.toThrow('الفرع خارج نطاق صلاحياتك');
        expect((await createSmartPurchase(fixture.branch.id, fixture.supplier.id, [{ drugId: fixture.drug.id, quantity: 1, cost: 100 }])).success).toBe(false);
    });
    it('does not disclose another organization supplier through a server action', async () => {
        state.tenant.organizationId = randomUUID();
        expect(await getSupplierById(fixture.supplier.id)).toBeNull();
    });
    it('serializes concurrent approvals against the customer credit limit', async () => {
        await db.warehouseCustomer.create({ data: { warehouseId: fixture.warehouse.id, organizationId: fixture.org.id, creditLimit: 1500 } });
        const orders = await Promise.all([quotedOrder(), quotedOrder()]);
        const responses = await Promise.all(orders.map((order) => decide(request({ action: 'APPROVED' }), { params: { id: order.id } })));
        expect(responses.map((r) => r.status).sort()).toEqual([200, 403]);
        expect(await db.warehouseInvoice.count({ where: { warehouseId: fixture.warehouse.id } })).toBe(1);
    });
    it('simultaneous approvals create exactly one purchase and invoice', async () => {
        const order = await quotedOrder();
        const results = await Promise.all([0, 1].map(() => decide(request({ action: 'APPROVED' }), { params: { id: order.id } })));
        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        expect(await db.purchase.count({ where: { branchId: fixture.branch.id } })).toBe(1);
        expect(await db.warehouseInvoice.count({ where: { orderId: order.id } })).toBe(1);
    });
    it('cancels the linked draft and invoice together; cancelled draft cannot be received', async () => {
        const order = await quotedOrder();
        const approval = await (await decide(request({ action: 'APPROVED' }), { params: { id: order.id } })).json();
        const cancelled = await decide(request({ action: 'CANCELLED' }), { params: { id: order.id } });
        expect(cancelled.status).toBe(200);
        const p = await db.purchase.findUniqueOrThrow({ where: { id: approval.purchaseId }, include: { items: true } });
        expect(p.status).toBe('CANCELLED');
        expect((await db.warehouseInvoice.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe('CANCELLED');
        await expect(receivePurchaseStock(db, p.id, { branchId: fixture.branch.id }, receipt(p))).rejects.toMatchObject({ status: 409 });
    });
    it('refuses cancellation after receipt without changing order or invoice', async () => {
        const order = await quotedOrder();
        const approval = await (await decide(request({ action: 'APPROVED' }), { params: { id: order.id } })).json();
        const p = await db.purchase.findUniqueOrThrow({ where: { id: approval.purchaseId }, include: { items: true } });
        await db.warehouseOrder.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });
        await receivePurchaseStock(db, p.id, { branchId: fixture.branch.id }, receipt(p));
        expect((await decide(request({ action: 'CANCELLED' }), { params: { id: order.id } })).status).toBe(409);
        expect((await db.warehouseOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('DELIVERED');
    });
    it('denies a cashier approval before writes', async () => {
        const order = await quotedOrder(); state.tenant.userPermissions = getDefaultPermissions('CASHIER');
        expect((await decide(request({ action: 'APPROVED' }), { params: { id: order.id } })).status).toBe(403);
        expect(await db.purchase.count({ where: { branchId: fixture.branch.id } })).toBe(0);
    });
    it('concurrent quote/cancel cannot resurrect the cancelled order', async () => {
        const order = await quotedOrder();
        await db.warehouseOrder.update({ where: { id: order.id }, data: { status: 'UNDER_REVIEW' } });
        const responses = await Promise.all([
            quote(request({ items: [{ itemId: order.items[0].id, status: 'AVAILABLE', quotedPrice: 120 }] }), { params: { id: order.id } }),
            decide(request({ action: 'CANCELLED' }), { params: { id: order.id } }),
        ]);
        const fresh = await db.warehouseOrder.findUniqueOrThrow({ where: { id: order.id }, include: { events: { orderBy: { createdAt: 'asc' } } } });
        if (responses[1].status === 200) {
            expect(fresh.status).toBe('CANCELLED');
            expect(fresh.events.at(-1)?.type).toBe('CANCELLED');
        } else {
            expect(responses[1].status).toBe(409);
            expect(fresh.status).toBe('QUOTED');
            expect((await decide(request({ action: 'CANCELLED' }), { params: { id: order.id } })).status).toBe(200);
        }
    });
    it('concurrent payment/cancellation never leaves payment on a cancelled invoice', async () => {
        const order = await quotedOrder();
        const approval = await (await decide(request({ action: 'APPROVED' }), { params: { id: order.id } })).json();
        await Promise.all([
            pay(request({ amount: 500, idempotencyKey: randomUUID() }), { params: Promise.resolve({ id: approval.invoiceId }) }),
            decide(request({ action: 'CANCELLED' }), { params: { id: order.id } }),
        ]);
        const invoice = await db.warehouseInvoice.findUniqueOrThrow({ where: { id: approval.invoiceId } });
        expect(invoice.status === 'CANCELLED' && invoice.paidAmount > 0).toBe(false);
    });
    it('runs quote → approval → shipment → delivery → receipt with bonus and exact stock', async () => {
        const catalog = await db.warehouseCatalogItem.create({ data: { warehouseId: fixture.warehouse.id, drugId: fixture.drug.id, barcode: fixture.drug.barcode, price: 100 } });
        const batch = await db.warehouseBatch.create({ data: { catalogItemId: catalog.id, quantity: 30, expiryDate: expiry(), batchNumber: 'TEST', costPrice: 80 } });
        const order = await quotedOrder();
        await db.warehouseOrder.update({ where: { id: order.id }, data: { status: 'UNDER_REVIEW' } });
        expect((await quote(request({ items: [{ itemId: order.items[0].id, status: 'AVAILABLE', quotedPrice: 100, bonusQuantity: 1 }] }), { params: { id: order.id } })).status).toBe(200);
        const approval = await (await decide(request({ action: 'APPROVED' }), { params: { id: order.id } })).json();
        const results = await Promise.all([0, 1].map(() => ship(request({ status: 'SHIPPED' }), { params: { id: order.id } })));
        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        expect((await db.warehouseBatch.findUniqueOrThrow({ where: { id: batch.id } })).quantity).toBe(19);
        expect((await ship(request({ status: 'DELIVERED' }), { params: { id: order.id } })).status).toBe(200);
        // Exact quotes may already be auto-approved; the canonical link exists in either flow.
        const p = await db.purchase.findUniqueOrThrow({ where: { warehouseOrderId: order.id }, include: { items: true } });
        await receivePurchaseStock(db, p.id, { branchId: fixture.branch.id }, receipt(p));
        expect((await db.batch.aggregate({ where: { inventory: { branchId: fixture.branch.id } }, _sum: { quantity: true } }))._sum.quantity).toBe(11);
        expect(p.total).toBe(1000);
    });
});
