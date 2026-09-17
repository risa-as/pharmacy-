// Run against a built local Next server and the isolated integration database only.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const raw = process.env.TEST_DATABASE_URL;
const target = new URL(raw ?? 'http://invalid');
const base = process.env.READINESS_BASE_URL ?? 'http://127.0.0.1:3307';
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/faramace_readiness' || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
    throw new Error('Smoke test requires isolated local database and local HTTP server.');
}
const db = new PrismaClient({ datasources: { db: { url: raw } } });
const key = randomUUID();
const password = randomUUID();
const hash = await bcrypt.hash(password, 10);
let checks = 0;
function check(value, expected, label) { assert.equal(value, expected, label); checks++; console.log(`PASS: ${label}`); }
async function login(email) {
    const jar = new Map();
    const call = async (path, opts = {}) => {
        const res = await fetch(base + path, { ...opts, redirect: 'manual', headers: { ...opts.headers, cookie: Array.from(jar, ([k, v]) => `${k}=${v}`).join('; ') } });
        for (const cookie of res.headers.getSetCookie()) { const pair = cookie.split(';', 1)[0]; const pos = pair.indexOf('='); jar.set(pair.slice(0, pos), pair.slice(pos + 1)); }
        return res;
    };
    const csrf = await (await call('/api/auth/csrf')).json();
    await call('/api/auth/callback/credentials', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
        body: new URLSearchParams({ email, password, csrfToken: csrf.csrfToken, callbackUrl: base }),
    });
    const session = await (await call('/api/auth/session')).json();
    check(session.user?.email, email, 'cookie login');
    return call;
}
const json = (body, method = 'POST') => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

try {
    const plan = await db.subscriptionPlan.create({ data: { name: `QA ${key}`, features: { warehouseManagement: true } } });
    const org = await db.organization.create({ data: { name: 'Readiness QA', planId: plan.id } });
    const branch = await db.branch.create({ data: { name: 'Readiness QA', organizationId: org.id } });
    const warehouse = await db.warehouse.create({ data: { name: 'Readiness QA' } });
    const pharmacy = await db.user.create({ data: { email: `pharmacy-${key}@test.invalid`, password: hash, role: 'ADMIN', branchId: branch.id } });
    const owner = await db.user.create({ data: { email: `owner-${key}@test.invalid`, password: hash, role: 'WAREHOUSE', warehouseUserType: 'OWNER', warehouseId: warehouse.id } });
    const cashier = await db.user.create({ data: { email: `cashier-${key}@test.invalid`, password: hash, role: 'CASHIER', branchId: branch.id } });
    const drug = await db.globalDrug.create({ data: { barcode: key, tradeName: 'QA drug', scientificName: 'QA', alternatives: [] } });
    const catalog = await db.warehouseCatalogItem.create({ data: { warehouseId: warehouse.id, drugId: drug.id, barcode: key, price: 100 } });
    await db.warehouseBatch.create({ data: { catalogItemId: catalog.id, quantity: 30, expiryDate: new Date('2035-01-01'), batchNumber: 'QA', costPrice: 80 } });
    const pharm = await login(pharmacy.email); const wh = await login(owner.email); const cash = await login(cashier.email);
    check((await pharm('/dashboard/purchases/warehouse-orders')).status, 200, 'pharmacy page renders');
    check((await wh('/warehouse/orders')).status, 200, 'warehouse page renders');
    check((await pharm('/api/warehouse-portal/orders')).status, 403, 'pharmacy denied warehouse API');
    check((await wh('/api/warehouses/orders')).status, 403, 'warehouse denied pharmacy API');
    check((await wh('/api/warehouse-portal/orders?status=DRAFT')).status, 400, 'drafts cannot be requested');
    check((await cash('/api/warehouses/orders', json({ warehouseId: warehouse.id, items: [{ barcode: key, quantity: 10 }] }))).status, 403, 'cashier cannot buy');
    const orderBody = { warehouseId: warehouse.id, idempotencyKey: randomUUID(), items: [{ barcode: key, quantity: 10, unitPrice: 100 }] };
    const created = await pharm('/api/warehouses/orders', json(orderBody));
    check(created.status, 201, 'create B2B order');
    const { order } = await created.json();
    const replay = await pharm('/api/warehouses/orders', json(orderBody));
    check(replay.status, 200, 'order retry returns success');
    check((await replay.json()).order.id, order.id, 'order retry preserves identity');
    check((await pharm('/api/warehouses/orders', json({ ...orderBody, notes: 'changed intent' }))).status, 409, 'changed retry rejected');
    check((await wh('/api/warehouse-portal/orders', json({ orderId: order.id }))).status, 200, 'start review');
    check((await wh(`/api/warehouse-portal/orders/${order.id}/quote`, json({ items: [{ itemId: order.items[0].id, status: 'AVAILABLE', quotedPrice: 100, bonusQuantity: 1 }] }, 'PATCH'))).status, 200, 'send quote with bonus');
    const approved = await pharm(`/api/warehouses/orders/${order.id}`, json({ action: 'APPROVED' }));
    check(approved.status, 200, 'approve quotation');
    const { purchaseId } = await approved.json();
    check((await wh(`/api/warehouse-portal/orders/${order.id}/shipping`, json({ status: 'SHIPPED' }, 'PATCH'))).status, 200, 'ship');
    check((await wh(`/api/warehouse-portal/orders/${order.id}/shipping`, json({ status: 'DELIVERED' }, 'PATCH'))).status, 200, 'deliver');
    const p = await db.purchase.findUniqueOrThrow({ where: { id: purchaseId }, include: { items: true } });
    const lines = p.items.map((it) => ({ itemId: it.id, quantity: it.quantity, batchNumber: 'QA', expiryDate: '2035-01-01' }));
    check((await pharm(`/api/purchases/${purchaseId}/receive`, json({ items: lines, isPaid: false }))).status, 200, 'receive paid units plus free bonus');
    check((await pharm(`/api/purchases/${purchaseId}/receive`, json({ items: lines }))).status, 409, 'repeat receipt rejected');
    const notices = await (await pharm('/api/notifications/in-app?kind=WAREHOUSE_ORDER')).json();
    check(notices.unreadCount >= 4, true, 'pharmacy receives review/quote/shipping/delivery notifications');
    const warehouseNotices = await (await wh('/api/notifications/in-app?kind=WAREHOUSE_ORDER')).json();
    check(warehouseNotices.unreadCount >= 2, true, 'warehouse receives order/approval notifications');
    await db.user.update({ where: { id: pharmacy.id }, data: { isActive: false } });
    check((await pharm('/api/warehouses/orders')).status, 403, 'disabled account denied with old cookie');
    await db.warehouse.update({ where: { id: warehouse.id }, data: { isActive: false } });
    check((await wh('/api/warehouse-portal/orders')).status, 403, 'disabled warehouse denied with old cookie');
    console.log(`HTTP READINESS: ${checks} checks passed. Fixtures retained only in isolated local database.`);
} finally { await db.$disconnect(); }
