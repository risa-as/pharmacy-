// Round 2026-09-23: cross-tenant isolation (N03, N07, N11–N13) proven against the
// isolated PostgreSQL. Only the session identity is mocked; getTenantContext runs
// for real, so scope comes from the database rows created below.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomUUID, createHash } from 'node:crypto';

const state = vi.hoisted(() => ({ db: null as any, session: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// An anonymous request carries no Authorization header (outside Next there is no request scope).
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/app/lib/saas-guards', () => ({ checkFeatureAccess: async () => ({ allowed: true }) }));

import { GET as quickSale, PATCH as toggleQuickSale } from '../app/api/inventory/quick-sale/route';
import { GET as search } from '../app/api/inventory/search/route';
import { GET as alerts } from '../app/api/alerts/route';
import { GET as marginList, POST as marginCheck } from '../app/api/inventory/margin-check/route';
import { POST as checkBarcode } from '../app/api/inventory/check-barcode/route';
import { GET as pushStats, POST as pushSend } from '../app/api/notifications/push/route';
import { GET as listOrders, POST as placeOrder } from '../app/api/marketplace/orders/route';
import { GET as browse } from '../app/api/marketplace/route';
import { GET as getAttempt } from '../app/api/marketplace/orders/attempts/[key]/route';
import { getAllDebtors, getDebtStats } from '../app/lib/actions/debt';
import { getExpenses } from '../app/lib/actions/expense-actions';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
let f: any;
const key = randomUUID();
// Same claims NextAuth puts in the session at sign-in.
const as = (user: { id: string; role: string; branchId: string | null }) => { state.session = { user: { id: user.id, role: user.role, branchId: user.branchId } }; };
const get = (path: string) => new NextRequest(`http://localhost${path}`);
const post = (path: string, body: unknown) => new NextRequest(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const leaks = (value: unknown) => JSON.stringify(value).includes(f.foreignMarker) || JSON.stringify(value).includes(f.b1.id);

beforeAll(async () => {
    const orgA = await db.organization.create({ data: { name: 'A ' + key } });
    const orgB = await db.organization.create({ data: { name: 'B ' + key } });
    const a1 = await db.branch.create({ data: { name: 'A1 ' + key, organizationId: orgA.id } });
    const b1 = await db.branch.create({ data: { name: 'B1-FOREIGN-' + key, organizationId: orgB.id } });
    const mk = (role: string, branchId: string, extra = {}) => db.user.create({ data: { email: `${role}-${randomUUID()}@test.invalid`, password: 'unused', role, branchId, ...extra } });
    const pharmacist = await mk('PHARMACIST', a1.id);
    const adminA = await mk('ADMIN', a1.id);
    const foreignUser = await mk('CASHIER', b1.id, { pushEnabled: true, expoPushToken: 'ExponentPushToken[FOREIGN]' });
    await mk('CASHIER', a1.id, { pushEnabled: true, expoPushToken: 'ExponentPushToken[OWN]' });
    // Shared global drug (organizationId null) stocked in both tenants.
    // The quick-sale flag is per branch inventory (N09); both tenants flagged it.
    const drug = await db.globalDrug.create({ data: { barcode: 'ISO-' + key, tradeName: 'IsoDrug ' + key, scientificName: 'Iso', alternatives: [] } });
    const invA = await db.inventory.create({ data: { branchId: a1.id, drugId: drug.id, price: 100, cost: 70, minStock: 50, isQuickSale: true } });
    const invB = await db.inventory.create({ data: { branchId: b1.id, drugId: drug.id, price: 777, cost: 500, minStock: 50, isQuickSale: true } });
    const soon = new Date(Date.now() + 10 * 86400000);
    await db.batch.create({ data: { inventoryId: invA.id, batchNumber: 'OWN', quantity: 3, initialQuantity: 3, costPrice: 70, expiryDate: soon } });
    await db.batch.create({ data: { inventoryId: invB.id, batchNumber: 'FOREIGN-' + key, quantity: 9, initialQuantity: 9, costPrice: 500, expiryDate: soon } });
    // Foreign tenant: 40 units sold, one credit debtor, one expense.
    const foreignPatient = await db.patient.create({ data: { name: 'FOREIGN-' + key, phone: randomUUID(), branchId: b1.id, balance: 900 } });
    const foreignSale = await db.sale.create({ data: { branchId: b1.id, userId: foreignUser.id, patientId: foreignPatient.id, total: 900, items: { create: { drugId: drug.id, quantity: 40, price: 777, cost: 500 } } } });
    await db.payment.create({ data: { saleId: foreignSale.id, amount: 900, method: 'CREDIT' } });
    await db.expense.create({ data: { branchId: b1.id, amount: 55, category: 'FOREIGN-' + key } });
    await db.sale.create({ data: { branchId: a1.id, userId: pharmacist.id, total: 200, items: { create: { drugId: drug.id, quantity: 2, price: 100, cost: 70 } } } });
    // Marketplace: a foreign listing with 5 units and a foreign order.
    const listing = await db.marketplaceListing.create({ data: { sellerId: b1.id, drugId: drug.id, quantity: 5, unitPrice: 10 } });
    await db.marketplaceOrder.create({ data: { listingId: listing.id, buyerId: b1.id, quantity: 1, totalPrice: 10, notes: 'FOREIGN-' + key } });
    f = { a1, b1, pharmacist, adminA, drug, invA, invB, listing, foreignMarker: 'FOREIGN-' + key };
});
afterAll(() => db.$disconnect());
beforeEach(() => as(f.pharmacist));

describe('N09: the quick-sale flag belongs to each branch inventory', () => {
    const patch = (body: unknown) => new NextRequest('http://localhost/api/inventory/quick-sale', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
    it('turning it off in one organisation leaves the other organisation flag and list untouched', async () => {
        as(f.adminA);
        const res = await toggleQuickSale(patch({ drugId: f.drug.id, isQuickSale: false }));
        expect(res.status).toBe(200);
        expect((await db.inventory.findUnique({ where: { id: f.invA.id } }))!.isQuickSale).toBe(false);
        expect((await db.inventory.findUnique({ where: { id: f.invB.id } }))!.isQuickSale).toBe(true);
        const rows = await (await quickSale(get('/api/inventory/quick-sale'))).json();
        expect(rows.find((r: any) => r.id === f.drug.id)).toBeUndefined();
        await toggleQuickSale(patch({ inventoryId: f.invA.id, isQuickSale: true }));
        expect((await db.inventory.findUnique({ where: { id: f.invA.id } }))!.isQuickSale).toBe(true);
    });

    it('refuses another organisation inventory, by id or by branch', async () => {
        as(f.adminA);
        expect((await toggleQuickSale(patch({ inventoryId: f.invB.id, isQuickSale: false }))).status).toBe(403);
        expect((await toggleQuickSale(patch({ drugId: f.drug.id, branchId: f.b1.id, isQuickSale: false }))).status).toBe(403);
        expect((await db.inventory.findUnique({ where: { id: f.invB.id } }))!.isQuickSale).toBe(true);
    });
});

describe('N11: client branchId no longer replaces a branch user\'s scope', () => {
    it('quick-sale: foreign branch stock and every tenant\'s sales stay hidden', async () => {
        for (const qs of ['', `?branchId=${f.b1.id}`]) {
            const rows = await (await quickSale(get('/api/inventory/quick-sale' + qs))).json();
            const row = rows.find((r: any) => r.id === f.drug.id);
            if (qs) expect(row?.stock ?? 0).toBe(0);
            else expect(row).toMatchObject({ price: 100, stock: 3 });
            expect(row?.totalSold ?? 0).toBeLessThanOrEqual(2); // own 2 units, never the foreign 40
            expect(row?.price).not.toBe(777);
        }
    });

    it('inventory search, alerts and margin list ignore a foreign branchId', async () => {
        const hits = await (await search(get(`/api/inventory/search?query=IsoDrug&branchId=${f.b1.id}`))).json();
        expect(leaks(hits)).toBe(false);
        const own = await (await alerts(get('/api/alerts'))).json();
        const foreign = await (await alerts(get(`/api/alerts?branchId=${f.b1.id}`))).json();
        expect(leaks(own)).toBe(false);
        expect(leaks(foreign)).toBe(false);
        const margins = await (await marginList(get(`/api/inventory/margin-check?branchId=${f.b1.id}`))).json();
        expect(leaks(margins)).toBe(false);
    });

    it('margin check and barcode check never read the foreign inventory', async () => {
        const margin = await (await marginCheck(post('/api/inventory/margin-check', { drugId: f.drug.id, salePrice: 1, branchId: f.b1.id }))).json();
        expect(JSON.stringify(margin)).not.toContain('500');
        const barcode = await (await checkBarcode(post('/api/inventory/check-barcode', { barcode: 'ISO-' + key, branchId: f.b1.id }))).json();
        expect(JSON.stringify(barcode)).not.toContain('777');
    });

    it('debts and expenses server actions ignore a foreign branchId, for admins too', async () => {
        for (const user of [f.pharmacist, f.adminA]) {
            as(user);
            expect(leaks(await getAllDebtors(f.b1.id))).toBe(false);
            expect((await getDebtStats(f.b1.id)).totalDebt).toBe(0);
            expect(leaks(await getExpenses(f.b1.id))).toBe(false);
        }
    });
});

describe('N12: push notifications stay inside the sender\'s organization', () => {
    it('"send to all" reaches only own-organization tokens', async () => {
        as(f.adminA);
        const sent: string[] = [];
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async (_url: any, init: any) => { sent.push(...JSON.parse(init.body).map((m: any) => m.to)); return new Response('{}'); }) as any;
        try {
            await pushSend(post('/api/notifications/push', { title: 't', body: 'b', targetAll: true }));
            await pushSend(post('/api/notifications/push', { title: 't', body: 'b', targetBranchId: f.b1.id }));
        } finally { globalThis.fetch = realFetch; }
        expect(sent).toContain('ExponentPushToken[OWN]');
        expect(sent).not.toContain('ExponentPushToken[FOREIGN]');
        const stats = await (await pushStats()).json();
        expect(leaks(stats)).toBe(false);
    });
});

describe('N15 / N15-R2: marketplace purchase attempts (idempotency with a durable outcome)', () => {
    const fresh = (quantity = 10) => db.marketplaceListing.create({ data: { sellerId: f.b1.id, drugId: f.drug.id, quantity, unitPrice: 10 } });
    const attemptStatus = async (key: string) => (await getAttempt(get(`/api/marketplace/orders/attempts/${key}`), { params: Promise.resolve({ key }) }));

    it('a resend with the same key returns the original order and decrements stock once', async () => {
        const listing = await fresh();
        const body = { listingId: listing.id, quantity: 2, idempotencyKey: randomUUID() };
        const first = await placeOrder(post('/api/marketplace/orders', body));
        const again = await placeOrder(post('/api/marketplace/orders', body));
        expect(first.status).toBe(201);
        expect(again.status).toBe(200);
        const [a, b] = [await first.json(), await again.json()];
        expect(b.order.id).toBe(a.order.id);
        expect(b).toMatchObject({ settled: true, status: 'SUCCEEDED' });
        expect((await db.marketplaceListing.findUnique({ where: { id: listing.id } }))!.quantity).toBe(8);
    });

    it('the same key with a different request is refused, without a settled flag', async () => {
        const listing = await fresh();
        const idempotencyKey = randomUUID();
        await placeOrder(post('/api/marketplace/orders', { listingId: listing.id, quantity: 2, idempotencyKey }));
        const changed = await placeOrder(post('/api/marketplace/orders', { listingId: listing.id, quantity: 3, idempotencyKey }));
        expect(changed.status).toBe(409);
        expect((await changed.json()).settled).toBeUndefined();
        expect((await db.marketplaceListing.findUnique({ where: { id: listing.id } }))!.quantity).toBe(8);
    });

    for (const [name, stock] of [['with stock to spare', 10], ['on the LAST unit', 1]] as const) {
        it(`two concurrent sends of one key ${name}: one execution, both resolve to the same order`, async () => {
            const listing = await fresh(stock);
            const body = { listingId: listing.id, quantity: 1, idempotencyKey: randomUUID() };
            const results = await Promise.all([1, 2].map(() => placeOrder(post('/api/marketplace/orders', body))));
            const statuses = results.map(r => r.status).sort();
            expect(statuses[0]).toBe(201);
            expect([200, 202]).toContain(statuses[1]); // replayed, or still PROCESSING
            expect(await db.marketplaceOrder.count({ where: { listingId: listing.id } })).toBe(1);
            // Whatever the loser saw, the durable record now says SUCCEEDED with that order.
            const status = await (await attemptStatus(body.idempotencyKey)).json();
            const winner = await results.find(r => r.status === 201)!.json();
            expect(status).toMatchObject({ status: 'SUCCEEDED', settled: true });
            expect(status.order.id).toBe(winner.order.id);
            expect((await db.marketplaceListing.findUnique({ where: { id: listing.id } }))!.quantity).toBe(stock - 1);
        });
    }

    it('a refusal is recorded as final: a resend never executes, even after restock', async () => {
        const listing = await fresh(1);
        await placeOrder(post('/api/marketplace/orders', { listingId: listing.id, quantity: 1, idempotencyKey: randomUUID() }));
        const key = randomUUID();
        const refused = await placeOrder(post('/api/marketplace/orders', { listingId: listing.id, quantity: 1, idempotencyKey: key }));
        expect(refused.status).toBe(400);
        expect(await refused.json()).toMatchObject({ settled: true, status: 'REJECTED' });
        await db.marketplaceListing.update({ where: { id: listing.id }, data: { quantity: 5, status: 'ACTIVE' } });
        const again = await placeOrder(post('/api/marketplace/orders', { listingId: listing.id, quantity: 1, idempotencyKey: key }));
        expect(await again.json()).toMatchObject({ settled: true, status: 'REJECTED' });
        expect(await db.marketplaceOrder.count({ where: { idempotencyKey: key } })).toBe(0);
        expect(await (await attemptStatus(key)).json()).toMatchObject({ status: 'REJECTED', settled: true });
    });

    it('another user of the same branch cannot reuse or read an attempt', async () => {
        const listing = await fresh();
        const key = randomUUID();
        await placeOrder(post('/api/marketplace/orders', { listingId: listing.id, quantity: 1, idempotencyKey: key }));
        const colleague = await db.user.create({ data: { email: `col-${randomUUID()}@test.invalid`, password: 'unused', role: 'PHARMACIST', branchId: f.a1.id } });
        as(colleague);
        const reuse = await placeOrder(post('/api/marketplace/orders', { listingId: listing.id, quantity: 1, idempotencyKey: key }));
        expect(reuse.status).toBe(409);
        expect((await attemptStatus(key)).status).toBe(404);
        expect(await db.marketplaceOrder.count({ where: { listingId: listing.id } })).toBe(1);
    });

    it('server died between claim and execution: status stays PROCESSING, the client\'s resend of the same attempt is taken over once', async () => {
        const listing = await fresh();
        const key = randomUUID();
        const requestHash = createHash('sha256').update(JSON.stringify([f.pharmacist.id, f.a1.id, listing.id, 1, null])).digest('hex');
        // The state a request leaves when the process dies right after claiming.
        const attempt = await db.marketplaceOrderAttempt.create({ data: { key, userId: f.pharmacist.id, buyerId: f.a1.id, requestHash } });
        // Through Prisma (UTC), as the app writes it; raw now() would be server-local time.
        await db.marketplaceOrderAttempt.update({ where: { id: attempt.id }, data: { updatedAt: new Date(Date.now() - 10 * 60 * 1000) } });
        // What the UI's "check" sees: PROCESSING (so it resends, per shouldResend).
        expect(await (await attemptStatus(key)).json()).toMatchObject({ status: 'PROCESSING', settled: false });
        const body = { listingId: listing.id, quantity: 1, branchId: f.a1.id, idempotencyKey: key };
        const [a, b] = await Promise.all([1, 2].map(() => placeOrder(post('/api/marketplace/orders', body))));
        expect([a.status, b.status].sort()).toEqual([201, 202]); // exactly one takeover
        expect(await db.marketplaceOrder.count({ where: { idempotencyKey: key } })).toBe(1);
        expect(await (await attemptStatus(key)).json()).toMatchObject({ status: 'SUCCEEDED', settled: true });
    });

    it('a pinned branch is never re-targeted: after a transfer the old attempt is refused, not bought for the new branch', async () => {
        const listing = await fresh();
        const a2 = await db.branch.create({ data: { name: 'A2 ' + key, organizationId: f.a1.organizationId } });
        const mover = await db.user.create({ data: { email: `mv-${randomUUID()}@test.invalid`, password: 'unused', role: 'PHARMACIST', branchId: f.a1.id } });
        const pinned = { listingId: listing.id, quantity: 1, branchId: f.a1.id, idempotencyKey: randomUUID() };
        // The attempt never reached the server; meanwhile the user is moved to A2.
        await db.user.update({ where: { id: mover.id }, data: { branchId: a2.id } });
        as({ ...mover, branchId: a2.id });
        const res = await placeOrder(post('/api/marketplace/orders', pinned));
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ error: 'Branch not in scope' });
        expect(await db.marketplaceOrder.count({ where: { listingId: listing.id } })).toBe(0);
    });

    it('a recent PROCESSING attempt is not re-executed: 202 until it settles', async () => {
        const listing = await fresh();
        const key = randomUUID();
        const requestHash = createHash('sha256').update(JSON.stringify([f.pharmacist.id, f.a1.id, listing.id, 1, null])).digest('hex');
        await db.marketplaceOrderAttempt.create({ data: { key, userId: f.pharmacist.id, buyerId: f.a1.id, requestHash } });
        const res = await placeOrder(post('/api/marketplace/orders', { listingId: listing.id, quantity: 1, idempotencyKey: key }));
        expect(res.status).toBe(202);
        expect(await db.marketplaceOrder.count({ where: { listingId: listing.id } })).toBe(0);
    });

    it('a key the server never received answers UNKNOWN; anonymous status queries are refused', async () => {
        expect(await (await attemptStatus(randomUUID())).json()).toMatchObject({ status: 'UNKNOWN', settled: false });
        state.session = null;
        expect((await attemptStatus(randomUUID())).status).toBe(401);
    });

    it('another tenant cannot obtain an order by guessing its key', async () => {
        const listing = await fresh();
        const idempotencyKey = randomUUID();
        await db.marketplaceOrder.create({ data: { listingId: listing.id, buyerId: f.b1.id, quantity: 1, totalPrice: 10, idempotencyKey, requestHash: 'x' } });
        const res = await placeOrder(post('/api/marketplace/orders', { listingId: listing.id, quantity: 1, idempotencyKey }));
        expect(res.status).toBe(409);
        expect(leaks(await res.json())).toBe(false);
        const again = await placeOrder(post('/api/marketplace/orders', { listingId: listing.id, quantity: 1, idempotencyKey }));
        expect(leaks(await again.json())).toBe(false);
    });
});
describe('N03 / N07 on PostgreSQL: marketplace scope and atomic stock', () => {
    it('role=x and a foreign branchId return nothing from another tenant', async () => {
        expect((await listOrders(get('/api/marketplace/orders?role=x'))).status).toBe(400);
        expect((await listOrders(get(`/api/marketplace/orders?branchId=${f.b1.id}`))).status).toBe(403);
        // A buyer legitimately sees the seller's name; what must never appear is
        // an order bought by another tenant's branch.
        const { orders } = await (await listOrders(get('/api/marketplace/orders'))).json();
        expect(orders.every((o: any) => o.buyerId === f.a1.id)).toBe(true);
        expect(JSON.stringify(orders)).not.toContain(`"notes":"${f.foreignMarker}"`);
    });

    it('rejects unauthenticated browsing', async () => {
        state.session = null;
        expect((await browse(get('/api/marketplace'))).status).toBe(401);
    });

    it('two concurrent orders for the whole stock: exactly one succeeds, stock never negative', async () => {
        const results = await Promise.all([1, 2].map(() => placeOrder(post('/api/marketplace/orders', { listingId: f.listing.id, quantity: 5 }))));
        // The loser sees either the conditional decrement fail (409) or, if the
        // winner already committed, a SOLD_OUT listing (400). Both are refusals.
        const statuses = results.map(r => r.status).sort();
        expect(statuses[0]).toBe(201);
        expect([400, 409]).toContain(statuses[1]);
        const after = await db.marketplaceListing.findUnique({ where: { id: f.listing.id } });
        expect(after).toMatchObject({ quantity: 0, status: 'SOLD_OUT' });
        expect(await db.marketplaceOrder.count({ where: { listingId: f.listing.id, buyerId: f.a1.id } })).toBe(1);
    });
});
