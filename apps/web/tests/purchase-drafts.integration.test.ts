// OPEN-14 (2026-09-30): saved purchasing settings and draft → order measurement,
// on a PostgreSQL built from the migration chain. Only identity, plan gates and
// notifications are mocked; orders go through the real order route.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

const state = vi.hoisted(() => ({ db: null as any, ctx: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/auth', () => ({ auth: async () => null }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: async () => state.ctx }));
vi.mock('@/app/lib/saas-guards', () => ({ checkFeatureAccess: async () => ({ allowed: true }) }));
vi.mock('@/app/lib/notifications/notificationTriggers', () => ({ notifyWarehouseUsers: vi.fn(), notifyBranchUsers: vi.fn(), sendAndPersistNotification: vi.fn() }));

import { getDefaultPermissions } from '../app/lib/permissions';
import { GET as getSettings, PUT as putSettings, DELETE as deleteSettings } from '../app/api/purchases/planning-settings/route';
import { POST as createDraftRoute } from '../app/api/purchases/drafts/route';
import { POST as importRoute } from '../app/api/purchases/drafts/[id]/import/route';
import { POST as completeRoute } from '../app/api/purchases/drafts/[id]/complete/route';
import { GET as metricsRoute } from '../app/api/purchases/drafts/metrics/route';
import { POST as createOrder } from '../app/api/warehouses/orders/route';
import { GET as smartOrder } from '../app/api/smart-order/route';
import { buildReorderCard } from '../app/lib/ai-insights';
import { orderRequestBody } from '../app/lib/purchase-draft-client';
import { DAY } from '../app/lib/smart-purchasing';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
const key = randomUUID().slice(0, 8);
let f: any;

const json = (method: string, url: string, body?: unknown) =>
    new NextRequest('http://t' + url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) });
const ctxFor = (userId: string, orgId: string, branchId: string, perms: Record<string, boolean> = {}) => ({
    user: { id: userId, role: 'ADMIN', branchId, organizationId: orgId, name: 'Admin' }, organizationId: orgId,
    tenantWhere: { organizationId: orgId }, tenantBranchWhere: { branch: { organizationId: orgId } },
    branchModelWhere: { organizationId: orgId }, userPermissions: { ...getDefaultPermissions('ADMIN'), ...perms },
});
const settings = async (branchId: string) => (await getSettings(json('GET', `/api/purchases/planning-settings?branchId=${branchId}`))).json();
const put = (body: object) => putSettings(json('PUT', '/api/purchases/planning-settings', body));
const draftBody = (id: string, branchId: string, lines: object[]) => ({
    id, branchId, source: 'SMART_PAGE', settingsSource: 'DEFAULT', options: { coverageDays: 15, leadDays: 0, safetyDays: 0, fromArrival: false }, lines,
});

beforeAll(async () => {
    const org = await db.organization.create({ data: { name: 'O14 ' + key } });
    const b1 = await db.branch.create({ data: { name: 'B1-' + key, organizationId: org.id } });
    const b2 = await db.branch.create({ data: { name: 'B2-' + key, organizationId: org.id } });
    const other = await db.organization.create({ data: { name: 'X14 ' + key } });
    const xb = await db.branch.create({ data: { name: 'XB-' + key, organizationId: other.id } });
    const admin = await db.user.create({ data: { email: `o14-${key}@test.invalid`, password: 'unused', role: 'ADMIN', branchId: b1.id } });
    const w1 = await db.warehouse.create({ data: { name: 'W1-' + key, operatingMode: 'FULL' } });
    const w2 = await db.warehouse.create({ data: { name: 'W2-' + key, operatingMode: 'FULL' } });
    // A: private org drug in stock, with the shared catalogue drug of the same barcode (orders resolve to it).
    const globalA = await db.globalDrug.create({ data: { barcode: 'A-' + key, tradeName: 'A ' + key, scientificName: 'a', alternatives: [], unitsPerPack: 10, unitsPerPackConfirmedAt: new Date() } });
    const localA = await db.globalDrug.create({ data: { barcode: 'A-' + key, tradeName: 'A ' + key, scientificName: 'a', organizationId: org.id, alternatives: [], unitsPerPack: 10, unitsPerPackConfirmedAt: new Date() } });
    const drugB = await db.globalDrug.create({ data: { barcode: 'B-' + key, tradeName: 'B ' + key, scientificName: 'b', alternatives: [], unitsPerPack: 5, unitsPerPackConfirmedAt: new Date() } });
    const drugX = await db.globalDrug.create({ data: { barcode: 'X-' + key, tradeName: 'X ' + key, scientificName: 'x', alternatives: [] } });
    for (const [drugId, branchId] of [[localA.id, b1.id], [drugB.id, b1.id], [drugB.id, b2.id]])
        await db.inventory.create({ data: { drugId, branchId, price: 1000, cost: 500, minStock: 1, createdAt: new Date(Date.now() - 60 * DAY) } });
    // 1 unit/day of B at B2 (no stock there), for the per-branch settings case.
    await Promise.all(Array.from({ length: 30 }, (_, i) => db.sale.create({ data: {
        branchId: b2.id, userId: admin.id, total: 1000, createdAt: new Date(Date.now() - (i + 1) * DAY), items: { create: { drugId: drugB.id, quantity: 1, price: 1000, cost: 500 } } } })));
    // 2 units/day of A at B1 for 30 days: the suggestion depends on the coverage days.
    await Promise.all(Array.from({ length: 30 }, (_, i) => db.sale.create({ data: {
        branchId: b1.id, userId: admin.id, total: 2000, createdAt: new Date(Date.now() - (i + 1) * DAY), items: { create: { drugId: localA.id, quantity: 2, price: 1000, cost: 500 } } } })));
    f = { org, b1, b2, other, xb, admin, w1, w2, globalA, localA, drugB, drugX };
});
afterAll(() => db.$disconnect());
beforeEach(() => { state.ctx = ctxFor(f.admin.id, f.org.id, f.b1.id); });

describe('saved purchasing settings', () => {
    it('branch override beats the organization default, which beats the built-in default', async () => {
        expect(await settings(f.b1.id)).toMatchObject({ source: 'DEFAULT', options: { coverageDays: 15 }, canEditOrganization: true, canEditBranch: true });
        expect((await put({ scope: 'ORGANIZATION', coverageDays: 20, leadDays: 2, safetyDays: 1, fromArrival: true })).status).toBe(200);
        expect(await settings(f.b1.id)).toMatchObject({ source: 'ORGANIZATION', options: { coverageDays: 20, leadDays: 2, safetyDays: 1, fromArrival: true } });
        expect((await put({ scope: 'BRANCH', branchId: f.b1.id, coverageDays: 7, leadDays: 0, safetyDays: 0, fromArrival: false })).status).toBe(200);
        expect(await settings(f.b1.id)).toMatchObject({ source: 'BRANCH', options: { coverageDays: 7 }, organization: { coverageDays: 20 }, branch: { coverageDays: 7 } });
        expect(await settings(f.b2.id)).toMatchObject({ source: 'ORGANIZATION', options: { coverageDays: 20 } });
        // Saving again updates the same row (one per scope).
        await put({ scope: 'ORGANIZATION', coverageDays: 21, leadDays: 2, safetyDays: 1, fromArrival: true });
        expect(await db.purchasePlanningSettings.count({ where: { organizationId: f.org.id } })).toBe(2);
        const cleared = await (await deleteSettings(json('DELETE', `/api/purchases/planning-settings?branchId=${f.b1.id}`))).json();
        expect(cleared).toMatchObject({ removed: 1, source: 'ORGANIZATION', options: { coverageDays: 21 } });
    });

    it('transfer days are saved with the scope, kept when a save leaves them out, and inherited by a new branch row', async () => {
        await put({ scope: 'ORGANIZATION', coverageDays: 15, leadDays: 0, safetyDays: 0, fromArrival: false, transferDays: 3 });
        expect(await settings(f.b2.id)).toMatchObject({ source: 'ORGANIZATION', transferDays: 3 });
        // A save without transferDays keeps the stored value.
        await put({ scope: 'ORGANIZATION', coverageDays: 16, leadDays: 0, safetyDays: 0, fromArrival: false });
        expect(await settings(f.b2.id)).toMatchObject({ options: { coverageDays: 16 }, transferDays: 3 });
        // A new branch row without a value inherits the organization's (not the built-in 1).
        await put({ scope: 'BRANCH', branchId: f.b2.id, coverageDays: 9, leadDays: 0, safetyDays: 0, fromArrival: false });
        expect(await settings(f.b2.id)).toMatchObject({ source: 'BRANCH', transferDays: 3 });
        await put({ scope: 'BRANCH', branchId: f.b2.id, coverageDays: 9, leadDays: 0, safetyDays: 0, fromArrival: false, transferDays: 6 });
        expect((await settings(f.b2.id)).transferDays).toBe(6);
        expect((await settings(f.b1.id)).transferDays).toBe(3);
        expect((await put({ scope: 'BRANCH', branchId: f.b2.id, coverageDays: 9, leadDays: 0, safetyDays: 0, transferDays: 9 })).status).toBe(400);
        await deleteSettings(json('DELETE', `/api/purchases/planning-settings?branchId=${f.b2.id}`));
        expect((await settings(f.b2.id)).transferDays).toBe(3);
    });

    it('rejects another organization\'s branch, invalid values and missing rights', async () => {
        expect((await put({ scope: 'BRANCH', branchId: f.xb.id, coverageDays: 9, leadDays: 0, safetyDays: 0 })).status).toBe(403);
        expect((await getSettings(json('GET', `/api/purchases/planning-settings?branchId=${f.xb.id}`))).status).toBe(400);
        expect((await put({ scope: 'ORGANIZATION', coverageDays: 0, leadDays: 0, safetyDays: 0 })).status).toBe(400);
        expect(await db.purchasePlanningSettings.count({ where: { organizationId: f.other.id } })).toBe(0);
        // Ordering staff may tune their branch but not the organization default.
        state.ctx = ctxFor(f.admin.id, f.org.id, f.b1.id, { canChangeSettings: false });
        expect((await put({ scope: 'ORGANIZATION', coverageDays: 30, leadDays: 0, safetyDays: 0 })).status).toBe(403);
        expect((await put({ scope: 'BRANCH', branchId: f.b2.id, coverageDays: 12, leadDays: 0, safetyDays: 0 })).status).toBe(200);
        state.ctx = ctxFor(f.admin.id, f.org.id, f.b1.id, { canChangeSettings: false, canCreateWarehouseOrder: false });
        expect((await put({ scope: 'BRANCH', branchId: f.b2.id, coverageDays: 13, leadDays: 0, safetyDays: 0 })).status).toBe(403);
        expect((await settings(f.b2.id)).options.coverageDays).toBe(12);
        state.ctx = ctxFor(f.admin.id, f.org.id, f.b1.id);
        await deleteSettings(json('DELETE', `/api/purchases/planning-settings?branchId=${f.b2.id}`));
    });

    it('the assistant card and /api/smart-order without parameters use the same saved settings', async () => {
        await put({ scope: 'BRANCH', branchId: f.b1.id, coverageDays: 30, leadDays: 0, safetyDays: 0, fromArrival: false });
        const card = await buildReorderCard(state.ctx, { branchId: f.b1.id });
        expect(card.options).toMatchObject({ coverageDays: 30, source: 'BRANCH' });
        expect(card.scope.notes.join(' ')).toContain('إعداد الفرع المحفوظ: تغطية 30 يوماً');
        const page = await (await smartOrder(new Request(`http://t/api/smart-order?branchId=${f.b1.id}`))).json();
        const a = card.lines.find(l => l.drugId === f.localA.id)!;
        expect(page.find((r: any) => r.drugId === f.localA.id).suggestedQty).toBe(a.suggestedQty);
        // 2/day × 30 days = 60 units; the old fixed 15 days would have given 30.
        expect(a.suggestedQty).toBe(60);
        const explicit = await (await smartOrder(new Request(`http://t/api/smart-order?branchId=${f.b1.id}&coverageDays=15`))).json();
        expect(explicit.find((r: any) => r.drugId === f.localA.id).suggestedQty).toBe(30);
        await deleteSettings(json('DELETE', `/api/purchases/planning-settings?branchId=${f.b1.id}`));
    });

    it('without branchId every row uses the settings of its own branch, not the one of the caller', async () => {
        await put({ scope: 'ORGANIZATION', coverageDays: 10, leadDays: 0, safetyDays: 0, fromArrival: false });
        await put({ scope: 'BRANCH', branchId: f.b1.id, coverageDays: 30, leadDays: 0, safetyDays: 0, fromArrival: false });
        const all = await (await smartOrder(new Request('http://t/api/smart-order?format=planning'))).json();
        const at = (branchId: string, drugId: string) => all.rows.find((r: any) => r.branchId === branchId && r.drugId === drugId);
        expect(at(f.b1.id, f.localA.id).suggestedQty).toBe(60); // B1 override: 2/day × 30
        expect(at(f.b2.id, f.drugB.id).suggestedQty).toBe(10); // B2 follows the organization: 1/day × 10 (not 30)
        await deleteSettings(json('DELETE', `/api/purchases/planning-settings?branchId=${f.b1.id}`));
    });
});

describe('purchase drafts and the orders sent from them', () => {
    const lines = () => [
        { drugId: f.localA.id, barcode: f.localA.barcode, suggestedUnits: 30, draftUnits: 30, unitsPerPack: 10 },
        { drugId: f.drugB.id, barcode: f.drugB.barcode, suggestedUnits: 10, draftUnits: 8, unitsPerPack: 5 },
    ];
    const order = (warehouseId: string, items: object[], draftId: string | null, idempotencyKey = randomUUID()) =>
        createOrder(json('POST', '/api/warehouses/orders', JSON.parse(orderRequestBody({ warehouseId, branchId: f.b1.id, idempotencyKey, items, notes: null }, draftId))));

    it('creation is idempotent by the client id and scoped to the branch', async () => {
        const id = randomUUID();
        const first = await createDraftRoute(json('POST', '/api/purchases/drafts', draftBody(id, f.b1.id, lines())));
        expect(first.status).toBe(201);
        const again = await createDraftRoute(json('POST', '/api/purchases/drafts', draftBody(id, f.b1.id, lines())));
        expect(again.status).toBe(200);
        expect(await again.json()).toEqual({ id, created: false });
        expect(await db.purchaseDraft.count({ where: { id } })).toBe(1);
        const saved = await db.purchaseDraft.findUniqueOrThrow({ where: { id }, include: { lines: true } });
        expect(saved.lines.find(l => l.drugId === f.drugB.id)).toMatchObject({ suggestedUnits: 10, draftUnits: 8, draftPacks: 2 });
        // Another user reusing the id, another organization's branch, an item not in the branch.
        const stranger = await db.user.create({ data: { email: `o14b-${key}@test.invalid`, password: 'unused', role: 'ADMIN', branchId: f.b1.id } });
        state.ctx = ctxFor(stranger.id, f.org.id, f.b1.id);
        expect((await createDraftRoute(json('POST', '/api/purchases/drafts', draftBody(id, f.b1.id, lines())))).status).toBe(409);
        state.ctx = ctxFor(f.admin.id, f.org.id, f.b1.id);
        expect((await createDraftRoute(json('POST', '/api/purchases/drafts', draftBody(randomUUID(), f.xb.id, lines())))).status).toBe(403);
        expect((await createDraftRoute(json('POST', '/api/purchases/drafts', draftBody(randomUUID(), f.b2.id, lines())))).status).toBe(400);
        state.ctx = ctxFor(f.admin.id, f.org.id, f.b1.id, { canCreateWarehouseOrder: false });
        expect((await createDraftRoute(json('POST', '/api/purchases/drafts', draftBody(randomUUID(), f.b1.id, lines())))).status).toBe(403);
    });

    it('opening in the order form is recorded once', async () => {
        const id = randomUUID();
        await createDraftRoute(json('POST', '/api/purchases/drafts', draftBody(id, f.b1.id, lines())));
        const props = { params: Promise.resolve({ id }) };
        expect(await (await importRoute(json('POST', `/api/purchases/drafts/${id}/import`), props)).json()).toEqual({ imported: true });
        const firstAt = (await db.purchaseDraft.findUniqueOrThrow({ where: { id } })).importedAt;
        expect(await (await importRoute(json('POST', `/api/purchases/drafts/${id}/import`), { params: Promise.resolve({ id }) })).json()).toEqual({ imported: false });
        expect((await db.purchaseDraft.findUniqueOrThrow({ where: { id } })).importedAt).toEqual(firstAt);
        // Another organization cannot mark this organization's draft.
        const foreign = randomUUID();
        await createDraftRoute(json('POST', '/api/purchases/drafts', draftBody(foreign, f.b1.id, lines())));
        state.ctx = ctxFor(f.admin.id, f.other.id, f.xb.id);
        expect(await (await importRoute(json('POST', `/api/purchases/drafts/${foreign}/import`), { params: Promise.resolve({ id: foreign }) })).json()).toEqual({ imported: false });
        expect((await db.purchaseDraft.findUniqueOrThrow({ where: { id: foreign } })).importedAt).toBeNull();
    });

    it('one draft sent to two warehouses is summed once; replays and foreign ids never double count', async () => {
        const id = randomUUID();
        await createDraftRoute(json('POST', '/api/purchases/drafts', draftBody(id, f.b1.id, lines())));
        await importRoute(json('POST', `/api/purchases/drafts/${id}/import`), { params: Promise.resolve({ id }) });
        const k1 = randomUUID();
        // W1: A by barcode (resolves to the catalogue drug, not the draft's private id), 5 packs instead of 3.
        const r1 = await order(f.w1.id, [{ barcode: f.globalA.barcode, quantity: 5, unitPrice: 100 }], id, k1);
        expect(r1.status).toBe(201);
        // W2: B as drafted (2 packs) and an item that was not in the draft.
        expect((await order(f.w2.id, [{ barcode: f.drugB.barcode, quantity: 2, unitPrice: 50 }, { barcode: f.drugX.barcode, quantity: 1, unitPrice: 10 }], id)).status).toBe(201);
        // Replay of the first order (lost response): same order, nothing new.
        const replay = await order(f.w1.id, [{ barcode: f.globalA.barcode, quantity: 5, unitPrice: 100 }], id, k1);
        expect(replay.status).toBe(200);
        expect(await db.warehouseOrder.count({ where: { purchaseDraftId: id } })).toBe(2);
        // An id of another branch's draft, an unknown id, a malformed one: the order goes out, unlinked.
        const b2Draft = randomUUID();
        await createDraftRoute(json('POST', '/api/purchases/drafts', draftBody(b2Draft, f.b2.id, [{ drugId: f.drugB.id, barcode: f.drugB.barcode, suggestedUnits: 5, draftUnits: 5, unitsPerPack: 5 }])));
        for (const bad of [b2Draft, randomUUID(), 'not-a-uuid']) {
            const res = await order(f.w1.id, [{ barcode: f.drugB.barcode, quantity: 1, unitPrice: 50 }], bad);
            expect(res.status).toBe(201);
            expect((await db.warehouseOrder.findUniqueOrThrow({ where: { id: (await res.json()).order.id } })).purchaseDraftId).toBeNull();
        }

        const m = await (await metricsRoute(new Request(`http://t/api/purchases/drafts/metrics?days=30&branchId=${f.b1.id}`))).json();
        const all = await db.purchaseDraft.count({ where: { branchId: f.b1.id } });
        expect(m.drafts).toBe(all);
        expect(m.ordered).toBe(1);
        expect(m.orders).toBe(2);
        // A: 5 vs 3 packs (changed); B: 2 as drafted; X added; drafted B was changed on the page (10 → 8 units).
        expect(m.lines).toMatchObject({ ordered: 2, changedInForm: 1, removed: 0, notSentYet: 0, added: 1 });
        // Base units. A: 30 suggested = 3 packs; 5 sent = +20 in the form. B: 10 suggested, 8 on the
        // page (−2), 2 packs of 5 = 10 (+2 rounding), sent as drafted.
        expect(m.units).toEqual({
            suggested: 40, sent: 60,
            pageChange: { increase: 0, decrease: 2, net: -2 },
            rounding: 2,
            formChange: { increase: 20, decrease: 0, net: 20 },
            final: { increase: 20, decrease: 0, net: 20 },
        });
        expect(m.medianMinutesToFirstOrder).not.toBeNull();
    });

    it('a line still waiting for another warehouse is "not sent yet"; it counts as removed only after closing', async () => {
        await db.purchaseDraft.deleteMany({ where: { branchId: f.b1.id } });
        const id = randomUUID();
        await createDraftRoute(json('POST', '/api/purchases/drafts', draftBody(id, f.b1.id, lines())));
        expect((await order(f.w1.id, [{ barcode: f.globalA.barcode, quantity: 3, unitPrice: 100 }], id)).status).toBe(201);
        const metrics = async () => (await (await metricsRoute(new Request(`http://t/api/purchases/drafts/metrics?branchId=${f.b1.id}`))).json());
        expect((await metrics()).lines).toMatchObject({ ordered: 1, notSentYet: 1, removed: 0 });
        // Another organization cannot close it.
        state.ctx = ctxFor(f.admin.id, f.other.id, f.xb.id);
        expect(await (await completeRoute(json('POST', `/api/purchases/drafts/${id}/complete`), { params: Promise.resolve({ id }) })).json()).toEqual({ completed: false });
        state.ctx = ctxFor(f.admin.id, f.org.id, f.b1.id);
        expect(await (await completeRoute(json('POST', `/api/purchases/drafts/${id}/complete`), { params: Promise.resolve({ id }) })).json()).toEqual({ completed: true });
        expect(await (await completeRoute(json('POST', `/api/purchases/drafts/${id}/complete`), { params: Promise.resolve({ id }) })).json()).toEqual({ completed: false });
        expect(await metrics()).toMatchObject({ completed: 1, lines: { ordered: 1, notSentYet: 0, removed: 1 } });
    });

    it('metrics need the warehouse-orders view right and stay inside the scope', async () => {
        expect((await metricsRoute(new Request(`http://t/api/purchases/drafts/metrics?branchId=${f.xb.id}`))).status).toBe(403);
        state.ctx = ctxFor(f.admin.id, f.org.id, f.b1.id, { canViewWarehouseOrders: false });
        expect((await metricsRoute(new Request('http://t/api/purchases/drafts/metrics'))).status).toBe(403);
        state.ctx = ctxFor(f.admin.id, f.other.id, f.xb.id);
        expect((await (await metricsRoute(new Request('http://t/api/purchases/drafts/metrics'))).json()).drafts).toBe(0);
    });
});
