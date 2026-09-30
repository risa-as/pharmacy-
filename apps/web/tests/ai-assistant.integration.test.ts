// AI assistant review (2026-09-30): data correctness, privacy, follow-ups, the
// deterministic cards (reorder / waste / daily) and the atomic daily limit, on
// a PostgreSQL built from the migration chain. Only identity and plan gates are
// mocked; the language model is a stub, so no test reaches a real provider.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

const state = vi.hoisted(() => ({ db: null as any, ctx: null as any, chat: null as any, createProvider: null as null | (() => any), session: null as any }));
vi.mock('@/app/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: async () => state.ctx }));
vi.mock('@/app/lib/saas-guards', () => ({ checkFeatureAccess: async () => ({ allowed: true }) }));
vi.mock('@/app/lib/api-guards', () => ({ guardFeature: async () => null }));
vi.mock('@/app/lib/ai-assistant', async (importActual) => ({
    ...(await importActual<typeof import('../app/lib/ai-assistant')>()),
    createProvider: () => state.createProvider ? state.createProvider() : ({ name: 'stub', model: 'stub-model', chat: (...a: unknown[]) => state.chat(...a) }),
}));
// A short provider timeout so the hanging-provider test runs in milliseconds.
vi.mock('@/app/lib/ai-usage', async (importActual) => ({
    ...(await importActual<typeof import('../app/lib/ai-usage')>()),
    AI_PROVIDER_TIMEOUT_MS: 300,
}));

import { getDefaultPermissions } from '../app/lib/permissions';
import { getPurchasesSummary, getProfitSummary, getSuspiciousActivity } from '../app/lib/ai-data';
import { buildContext } from '../app/lib/ai-assistant';
import { computeProfitSummary } from '../app/lib/profit-summary';
import { STOCK_PURCHASE_EXPENSE_CATEGORY } from '../app/lib/expense-categories';
import { buildReorderCard, buildWasteCard, buildDailyCard } from '../app/lib/ai-insights';
import { savePlanningSettings, clearBranchSettings } from '../app/lib/purchase-planning';
import { reserveAiRequest, completeAiRequest, aiUsageToday, aiDayStart, AI_RESERVATION_STALE_MS } from '../app/lib/ai-usage';
import { baghdadDate, DAY } from '../app/lib/smart-purchasing';
import { GET as profitReport } from '../app/api/reports/profit/route';
import { GET as smartOrder } from '../app/api/smart-order/route';
import { POST as chat } from '../app/api/ai/chat/route';
import { GET as aiStatus } from '../app/api/ai/status/route';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
state.db = db;
const key = randomUUID().slice(0, 8);
const now = Date.now();
const ago = (days: number) => new Date(now - days * DAY);
const ar = (n: number) => n.toLocaleString('ar-IQ');
let f: any;

async function drug(name: string, unitsPerPack?: number) {
    return db.globalDrug.create({ data: { barcode: `${name}-${key}`, tradeName: `${name}-${key}`, scientificName: name, alternatives: [],
        ...(unitsPerPack ? { unitsPerPack, unitsPerPackConfirmedAt: new Date() } : {}) } });
}
async function stock(branchId: string, drugId: string, cost: number, lots: { qty: number; days: number; costPrice?: number }[]) {
    const inv = await db.inventory.create({ data: { branchId, drugId, price: cost * 1.5 || 10, cost, minStock: 1, createdAt: ago(60) } });
    for (const l of lots) await db.batch.create({ data: { inventoryId: inv.id, batchNumber: randomUUID(), quantity: l.qty, initialQuantity: l.qty, costPrice: l.costPrice ?? cost, expiryDate: new Date(now + l.days * DAY) } });
    return inv;
}
async function dailySales(branchId: string, drugId: string, perDay: number, days: number, userId: string) {
    await Promise.all(Array.from({ length: days }, (_, i) => db.sale.create({ data: {
        branchId, userId, total: perDay * 10, createdAt: ago(i + 1), items: { create: { drugId, quantity: perDay, price: 10, cost: 5 } } } })));
}

beforeAll(async () => {
    const org = await db.organization.create({ data: { name: 'AI ' + key, aiDailyLimit: 3 } });
    const a1 = await db.branch.create({ data: { name: 'A1-' + key, organizationId: org.id } });
    const a2 = await db.branch.create({ data: { name: 'A2-' + key, organizationId: org.id } });
    const admin = await db.user.create({ data: { email: `ai-${key}@test.invalid`, password: 'unused', role: 'ADMIN', branchId: a1.id } });

    // Reorder: FAST sells 1/day with 5 in stock; OUT sells but has no stock.
    const fast = await drug('FAST', 10), out = await drug('OUT', 5);
    await stock(a1.id, fast.id, 100, [{ qty: 5, days: 300 }]);
    await stock(a1.id, out.id, 20, []);
    await dailySales(a1.id, fast.id, 1, 30, admin.id);
    await dailySales(a1.id, out.id, 1, 10, admin.id);
    // Waste: 100 units expiring in 20 days, selling 0.1/day at A1 but 2/day at A2.
    const waste = await drug('WASTE');
    await stock(a1.id, waste.id, 50, [{ qty: 100, days: 20, costPrice: 40 }]);
    await stock(a2.id, waste.id, 50, [{ qty: 2, days: 300 }]);
    await Promise.all([1, 11, 21].map(d => db.sale.create({ data: { branchId: a1.id, userId: admin.id, total: 10, createdAt: ago(d), items: { create: { drugId: waste.id, quantity: 1, price: 10, cost: 5 } } } })));
    await dailySales(a2.id, waste.id, 2, 30, admin.id);
    // Unknown cost: nothing sells, 50 units expire in 15 days, no cost recorded anywhere.
    const nocost = await drug('NOCOST');
    await stock(a1.id, nocost.id, 0, [{ qty: 50, days: 15, costPrice: 0 }]);
    // Per-lot value: 1/day; lot A (10 @1,000, day 5) loses 4, lot B (10 @3,000, day 12) loses 3.
    const lots = await drug('LOTS');
    await stock(a1.id, lots.id, 2000, [{ qty: 10, days: 5, costPrice: 1000 }, { qty: 10, days: 12, costPrice: 3000 }]);
    await dailySales(a1.id, lots.id, 1, 30, admin.id);
    // Two sources (A1, A3, no sales) and one receiver (A2, 2/day, no stock): A2 can take 40 in total.
    const a3 = await db.branch.create({ data: { name: 'A3-' + key, organizationId: org.id } });
    const share = await drug('SHARE');
    await stock(a1.id, share.id, 30, [{ qty: 50, days: 20 }]);
    await stock(a3.id, share.id, 20, [{ qty: 50, days: 20 }]);
    await stock(a2.id, share.id, 30, []);
    await dailySales(a2.id, share.id, 2, 30, admin.id);
    // Transfer days per SOURCE branch: T1 leaves A1, T3 leaves A3; both sell 2/day at A2 only.
    const t1 = await drug('T1'), t3 = await drug('T3');
    await stock(a1.id, t1.id, 10, [{ qty: 50, days: 20 }]);
    await stock(a3.id, t3.id, 10, [{ qty: 50, days: 20 }]);
    await stock(a2.id, t1.id, 10, []);
    await stock(a2.id, t3.id, 10, []);
    await dailySales(a2.id, t1.id, 2, 30, admin.id);
    await dailySales(a2.id, t3.id, 2, 30, admin.id);

    // 25 purchase invoices of 1,000 in the last few days.
    const supplier = await db.supplier.create({ data: { name: 'SUP-' + key, organizationId: org.id } });
    await Promise.all(Array.from({ length: 25 }, (_, i) => db.purchase.create({ data: { supplierId: supplier.id, branchId: a1.id, total: 1000, createdAt: ago(2 + (i % 3)) } })));

    // Discounts (limit 10%): 10% not flagged, 20% flagged, 50 IQD on 5,000 (1%) not flagged.
    for (const [total, discount] of [[900, 100], [800, 200], [4950, 50]])
        await db.sale.create({ data: { branchId: a1.id, userId: admin.id, total, discount, createdAt: ago(1) } });

    // A return of 1 unit (cost 100) from a 2-unit sale: the report reverses its cost.
    const sold = await db.sale.create({ data: { branchId: a1.id, userId: admin.id, total: 300, createdAt: ago(3), items: { create: { drugId: fast.id, quantity: 2, price: 150, cost: 100 } } } });
    await db.saleReturn.create({ data: { saleId: sold.id, branchId: a1.id, total: 150, createdAt: ago(2), items: { create: { drugId: fast.id, quantity: 1, price: 150 } } } });

    // Expenses: one operating (counts), one legacy stock purchase (must never count as an expense).
    await db.expense.create({ data: { branchId: a1.id, amount: 200, category: 'إيجار', date: ago(2) } });
    await db.expense.create({ data: { branchId: a1.id, amount: 999, category: STOCK_PURCHASE_EXPENSE_CATEGORY, date: ago(2) } });

    // A customer debtor (personal data) and a cash difference on a shift closed yesterday.
    await db.patient.create({ data: { name: 'DEBTOR-' + key, phone: '0770' + key, branchId: a1.id, balance: 500 } });
    const yStart = new Date(new Date(baghdadDate(new Date(now)) + 'T00:00:00+03:00').getTime() - DAY);
    await db.shift.create({ data: { branchId: a1.id, userId: admin.id, startTime: new Date(yStart.getTime() + 3600e3), endTime: new Date(yStart.getTime() + 7200e3), status: 'CLOSED', startingCash: 0, expectedCash: 1000, actualCash: 900 } });

    f = { org, a1, a2, a3, admin, fast, out, waste, nocost, lots, share, t1, t3, supplier };
});
afterAll(() => db.$disconnect());
beforeEach(() => {
    // Organization admin (org-wide scope), as the assistant is used.
    state.ctx = {
        user: { id: f.admin.id, role: 'ADMIN', branchId: f.a1.id, organizationId: f.org.id }, organizationId: f.org.id,
        tenantWhere: { organizationId: f.org.id }, tenantBranchWhere: { branch: { organizationId: f.org.id } },
        branchModelWhere: { organizationId: f.org.id }, userPermissions: getDefaultPermissions('ADMIN'),
    };
    state.chat = async () => 'شرح';
    state.createProvider = null;
});
const period = () => ({ from: new Date(now - 10 * DAY), to: new Date(now) });

describe('data correctness', () => {
    it('purchases total covers ALL invoices of the period, not the last 20', async () => {
        const { from, to } = period();
        const text = await getPurchasesSummary(from, to, state.ctx);
        expect(text).toContain(`${ar(25000)} IQD (25 فاتورة)`);
    });

    it('profit equals the profit report for the same branch and period (returned goods cost reversed)', async () => {
        const fromD = baghdadDate(new Date(now - 10 * DAY)), toD = baghdadDate(new Date(now));
        const report = await (await profitReport(new Request(`http://t/api/reports/profit?period=custom&from=${fromD}&to=${toD}&branchId=${f.a1.id}`))).json();
        const from = new Date(fromD + 'T00:00:00+03:00'), to = new Date(new Date(toD + 'T00:00:00+03:00').getTime() + DAY - 1);
        const shared = await computeProfitSummary({ AND: [state.ctx.tenantBranchWhere, { branchId: f.a1.id }] }, from, to);
        expect(Math.round(shared.net)).toBe(report.summary.netProfit);
        expect(shared.costReversal).toBeCloseTo(100);
        expect(shared.expenses).toBe(200); // the stock-purchase record is not an operating expense
        expect(report.summary.totalExpenses).toBe(200);
        const text = await getProfitSummary(from, to, { ...state.ctx, tenantBranchWhere: { AND: [state.ctx.tenantBranchWhere, { branchId: f.a1.id }] } });
        expect(text).toContain(`صافي الربح:        ${ar(shared.net)} IQD`);
        // The scope is always stated (the report defaults to the user's branch).
        expect(text).toContain('النطاق: النطاق المحدد');
        expect(await getProfitSummary(from, to, state.ctx)).toContain('النطاق: كل فروع المؤسسة');
        // The previous formula (no cost reversal) would have shown a different number.
        expect(text).not.toContain(`صافي الربح:        ${ar(shared.net - shared.costReversal)} IQD`);
    });

    it('discount alert compares the discount PERCENT with the limit', async () => {
        const text = await getSuspiciousActivity(new Date(now - 3 * DAY), new Date(now), state.ctx);
        const flagged = text.split('\n').filter(l => l.startsWith('- فاتورة'));
        expect(flagged).toHaveLength(1);
        expect(flagged[0]).toContain('20.0%');
    });
});

describe('privacy and conversation', () => {
    it('a profit question sends no debtor name or phone; a debts question sends the name only', async () => {
        const profit = await buildContext('كم ربحنا هذا الشهر؟', state.ctx);
        expect(profit.context).not.toContain('DEBTOR-' + key);
        expect(profit.context).not.toContain('0770' + key);
        const debts = await buildContext('ما ديون العملاء؟', state.ctx);
        expect(debts.context).toContain('DEBTOR-' + key);
        expect(debts.context).not.toContain('0770' + key);
    });

    it('"وأمس؟" after a sales question fetches yesterday\'s sales', async () => {
        const r = await buildContext('وأمس؟', state.ctx, [{ role: 'user', content: 'كم مبيعات اليوم؟' }, { role: 'assistant', content: '...' }]);
        expect(r.categories).toEqual(['sales_summary']);
        expect(r.context).toContain('## ملخص المبيعات');
        expect(r.context).toContain('سؤال متابعة');
    });

    it('an expiry question uses the requested future window', async () => {
        const r = await buildContext('ما الأدوية التي تنتهي خلال 90 يوم؟', state.ctx);
        expect(r.context).toContain('خلال 90 يوم');
    });
});

describe('cards: numbers from the planning engine, never from the model', () => {
    it('reorder card equals the smart purchasing page for the same branch and defaults', async () => {
        const card = await buildReorderCard(state.ctx, { branchId: f.a1.id });
        const page = await (await smartOrder(new Request(`http://t/api/smart-order?branchId=${f.a1.id}`))).json();
        expect(card.totalCandidates).toBe(page.length);
        for (const line of card.lines) {
            const row = page.find((r: any) => r.drugId === line.drugId);
            expect(row, line.drugName).toBeTruthy();
            expect(line.suggestedQty).toBe(row.suggestedQty);
        }
        const fast = card.lines.find(l => l.drugId === f.fast.id)!;
        // Net sales 31 units / 30 days (30 daily + a 2-unit sale with 1 returned);
        // 15 days of cover need ~15.5 units, minus 5 in stock = 11 units = 2 packs of 10.
        expect(fast).toMatchObject({ currentStock: 5, suggestedQty: 11, unitsPerPack: 10, packs: 2 });
        expect(card.lines[0].drugId).toBe(f.out.id); // out of stock first
        expect(card.canDraft).toBe(true);
        expect(card.scope).toMatchObject({ branchId: f.a1.id });
    });

    it('waste card values each lot at its own cost and proposes a sized transfer', async () => {
        const card = await buildWasteCard(state.ctx, { windowDays: 60 });
        const w = card.lines.find(l => l.drugId === f.waste.id && l.branchId === f.a1.id)!;
        // 100 units expiring day 20 at 0.1/day: 97.9 unsold → 98 shown and valued at 40.
        expect(w).toMatchObject({ expectedUnsold: 98, valueAtRisk: 98 * 40, unvaluedUnits: 0 });
        // A2 sells 2/day; arriving day 1 it can sell days 1–20 = 40 of the lot (its own stock expires later).
        expect(w.transfers).toEqual([expect.objectContaining({ branchId: f.a2.id, quantity: 40, expiryDate: baghdadDate(new Date(now + 20 * DAY)) })]);
        expect(card.transferDays).toEqual([1]);
        const unknown = card.lines.find(l => l.drugId === f.nocost.id)!;
        expect(unknown).toMatchObject({ valueAtRisk: null, unvaluedUnits: 50 });
        expect(card.unknownValueLines).toBeGreaterThanOrEqual(1);
        expect(card.totalValueAtRisk).toBeCloseTo(card.lines.reduce((s, l) => s + (l.valueAtRisk ?? 0), 0));
    });

    it('lots of different cost and expiry are valued lot by lot, not at an average', async () => {
        const card = await buildWasteCard(state.ctx, { windowDays: 60, branchId: f.a1.id });
        const l = card.lines.find(x => x.drugId === f.lots.id)!;
        expect(l.expectedUnsold).toBe(7);
        expect(l.valueAtRisk).toBe(4 * 1000 + 3 * 3000); // the average method gave 7 × 2,000 = 14,000
        expect(l.nearestExpiry).toBe(baghdadDate(new Date(now + 5 * DAY)));
    });

    it('two sources never cover the same receiver need twice; one branch still sees transfers to others', async () => {
        const card = await buildWasteCard(state.ctx, { windowDays: 60 });
        const sources = card.lines.filter(l => l.drugId === f.share.id);
        expect(sources.map(l => l.branchId).sort()).toEqual([f.a1.id, f.a3.id].sort());
        const toA2 = sources.flatMap(l => l.transfers).filter(t => t.branchId === f.a2.id);
        expect(toA2.reduce((s, t) => s + t.quantity, 0)).toBe(40);
        // Asking for A1 only: the lines are A1's, the receiver (A2) is still considered.
        const one = await buildWasteCard(state.ctx, { windowDays: 60, branchId: f.a1.id });
        expect(one.lines.every(l => l.branchId === f.a1.id)).toBe(true);
        expect(one.lines.find(l => l.drugId === f.share.id)!.transfers[0]).toMatchObject({ branchId: f.a2.id, quantity: 40 });
        // Without the permission there is no proposal at all.
        state.ctx = { ...state.ctx, userPermissions: { ...state.ctx.userPermissions, canTransferStock: false } };
        const denied = await buildWasteCard(state.ctx, { windowDays: 60 });
        expect(denied.lines.every(l => l.transfers.length === 0)).toBe(true);
        expect(denied.transferDays).toBeNull();
    });

    it('each source branch uses its own saved transfer days (arrival and capacity differ)', async () => {
        await savePlanningSettings(state.ctx, { scope: 'BRANCH', branchId: f.a3.id, options: { coverageDays: 15, leadDays: 0, safetyDays: 0, fromArrival: false }, transferDays: 5 });
        try {
            const card = await buildWasteCard(state.ctx, { windowDays: 60 });
            const from1 = card.lines.find(l => l.drugId === f.t1.id)!.transfers[0];
            const from3 = card.lines.find(l => l.drugId === f.t3.id)!.transfers[0];
            // A1 (no setting → 1 day): sells days 1–20 at A2 = 40. A3 (5 days): days 5–20 = 32.
            expect(from1).toMatchObject({ branchId: f.a2.id, transferDays: 1, quantity: 40, arrivalDate: baghdadDate(new Date(now + DAY)) });
            expect(from3).toMatchObject({ branchId: f.a2.id, transferDays: 5, quantity: 32, arrivalDate: baghdadDate(new Date(now + 5 * DAY)) });
            expect(card.transferDays).toEqual([1, 5]);
            // An explicit value still wins for every source.
            expect((await buildWasteCard(state.ctx, { windowDays: 60, transferDays: 1 })).lines.find(l => l.drugId === f.t3.id)!.transfers[0].quantity).toBe(40);
        } finally {
            await clearBranchSettings(state.ctx, f.a3.id);
        }
    });

    it('the reorder card states which saved settings it used (none saved: the defaults)', async () => {
        const card = await buildReorderCard(state.ctx, { branchId: f.a1.id });
        const notes = card.scope.notes.join(' ');
        expect(card.options).toMatchObject({ coverageDays: 15, leadDays: 0, safetyDays: 0, source: 'DEFAULT' });
        expect(notes).toContain('الإعداد الافتراضي: تغطية 15 يوماً');
        expect(notes).toContain('نفسها المستخدمة في صفحة الشراء الذكي');
        expect(notes).not.toContain('عدّلها');
    });

    it('daily card: at most three signals, most severe first', async () => {
        const card = await buildDailyCard(state.ctx);
        expect(card.signals.length).toBeLessThanOrEqual(3);
        expect(card.signals.map(s => s.id)).toEqual(expect.arrayContaining(['reorder', 'cash']));
        expect(card.signals[0].severity).toBe('high');
        expect(JSON.stringify(card)).not.toContain('DEBTOR-' + key);
    });
});

describe('daily AI limit and the chat route', () => {
    it('concurrent requests cannot exceed the limit; a failed call is not charged', async () => {
        const results = await Promise.all(Array.from({ length: 8 }, () => reserveAiRequest(f.org.id)));
        const passed = results.filter(Boolean);
        expect(passed).toHaveLength(3);
        await completeAiRequest(passed[0]!.id, { ok: false, startedAt: Date.now(), error: 'provider down' });
        expect((await aiUsageToday(f.org.id)).used).toBe(2);
        expect(await reserveAiRequest(f.org.id)).not.toBeNull();
        expect(await reserveAiRequest(f.org.id)).toBeNull();
        await db.aiUsageLog.deleteMany({ where: { organizationId: f.org.id } });
    });

    it('when the model fails, the reorder card is still returned and the quota is not charged', async () => {
        vi.stubEnv('AI_PROVIDER', 'gemini');
        vi.stubEnv('GEMINI_API_KEY', 'test-only');
        state.chat = async () => { throw new Error('provider down'); };
        const res = await chat(new NextRequest('http://t/api/ai/chat', { method: 'POST', body: JSON.stringify({ message: 'شنو أطلب اليوم؟' }) }));
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.response).toBeNull();
        expect(body.cards[0].kind).toBe('reorder');
        const log = await db.aiUsageLog.findFirst({ where: { organizationId: f.org.id }, orderBy: { createdAt: 'desc' } });
        expect(log).toMatchObject({ status: 'FAILED', provider: 'stub', categories: 'reorder' });
        expect((await aiUsageToday(f.org.id)).used).toBe(0);
        vi.unstubAllEnvs();
    });

    it('a successful answer records latency and sizes, and returns the explanation with the card', async () => {
        vi.stubEnv('AI_PROVIDER', 'gemini');
        vi.stubEnv('GEMINI_API_KEY', 'test-only');
        state.chat = async () => 'اطلب الصنف الأول';
        const body = await (await chat(new NextRequest('http://t/api/ai/chat', { method: 'POST', body: JSON.stringify({ message: 'شنو أطلب اليوم؟' }) }))).json();
        expect(body).toMatchObject({ response: 'اطلب الصنف الأول' });
        expect(body.cards).toHaveLength(1);
        const log = await db.aiUsageLog.findFirst({ where: { organizationId: f.org.id, status: 'OK' } });
        expect(log?.latencyMs).not.toBeNull();
        expect(log?.inputChars).toBeGreaterThan(0);
        expect(log?.cardCount).toBe(1);
        vi.unstubAllEnvs();
    });

    const ask = (message: string) => chat(new NextRequest('http://t/api/ai/chat', { method: 'POST', body: JSON.stringify({ message }) }));
    const rows = () => db.aiUsageLog.count({ where: { organizationId: f.org.id } });

    it.each([
        ['openai selected, only a Gemini key', { AI_PROVIDER: 'openai', OPENAI_API_KEY: '', GEMINI_API_KEY: 'g' }, 'OPENAI_API_KEY'],
        ['gemini selected, only an OpenAI key', { AI_PROVIDER: 'gemini', GEMINI_API_KEY: '', OPENAI_API_KEY: 'o' }, 'GEMINI_API_KEY'],
    ])('%s: cards still returned, nothing reserved, clear message', async (_n, env, keyName) => {
        await db.aiUsageLog.deleteMany({ where: { organizationId: f.org.id } });
        for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
        let called = false;
        state.chat = async () => { called = true; return 'x'; };
        const res = await ask('شنو أطلب اليوم؟');
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body).toMatchObject({ response: null, notice: expect.stringContaining('غير مفعّل') });
        expect(body.cards[0].kind).toBe('reorder');
        // Without a card the answer is 503 naming the missing key, not "invalid key".
        const plain = await ask('مرحبا');
        expect(plain.status).toBe(503);
        expect((await plain.json()).error).toContain(keyName);
        expect(called).toBe(false);
        // The panel's status uses the same check, so it never shows the assistant as enabled here.
        state.session = { user: { role: 'ADMIN' } };
        expect(await (await aiStatus()).json()).toEqual({ provider: null, configured: false });
        state.session = null;
        expect(await rows()).toBe(0);
        expect((await aiUsageToday(f.org.id)).used).toBe(0);
        vi.unstubAllEnvs();
    });

    it('a provider that cannot be constructed is treated as not configured (no reservation)', async () => {
        await db.aiUsageLog.deleteMany({ where: { organizationId: f.org.id } });
        vi.stubEnv('AI_PROVIDER', 'gemini');
        vi.stubEnv('GEMINI_API_KEY', 'test-only');
        state.createProvider = () => { throw new Error('SDK init failed'); };
        const body = await (await ask('شنو أطلب اليوم؟')).json();
        expect(body).toMatchObject({ response: null });
        expect(body.cards).toHaveLength(1);
        expect(await rows()).toBe(0);
        vi.unstubAllEnvs();
    });

    it('a hanging provider is aborted at the timeout, recorded FAILED and not charged', async () => {
        await db.aiUsageLog.deleteMany({ where: { organizationId: f.org.id } });
        vi.stubEnv('AI_PROVIDER', 'gemini');
        vi.stubEnv('GEMINI_API_KEY', 'test-only');
        let signal: AbortSignal | undefined;
        state.chat = (_s: string, _c: string, _m: string, _h: unknown, sig: AbortSignal) => { signal = sig; return new Promise(() => {}); };
        const started = Date.now();
        const body = await (await ask('شنو أطلب اليوم؟')).json();
        expect(Date.now() - started).toBeLessThan(10_000);
        expect(body).toMatchObject({ response: null, notice: expect.stringContaining('تعذر') });
        expect(signal?.aborted).toBe(true);
        const log = await db.aiUsageLog.findFirst({ where: { organizationId: f.org.id } });
        expect(log).toMatchObject({ status: 'FAILED', error: expect.stringContaining('timeout') });
        expect((await aiUsageToday(f.org.id)).used).toBe(0);
        vi.unstubAllEnvs();
    });

    it('an abandoned reservation stops counting after the stale limit; a recent one still counts', async () => {
        await db.aiUsageLog.deleteMany({ where: { organizationId: f.org.id } });
        // A fixed reference time (noon two days ago) so the Baghdad day boundary never interferes.
        const ref = new Date(aiDayStart(new Date(now)).getTime() - 2 * DAY + 12 * 3600e3);
        await db.aiUsageLog.createMany({ data: [
            { organizationId: f.org.id, status: 'RESERVED', createdAt: new Date(ref.getTime() - AI_RESERVATION_STALE_MS - 60e3) },
            { organizationId: f.org.id, status: 'RESERVED', createdAt: new Date(ref.getTime() - 60e3) },
            { organizationId: f.org.id, status: 'OK', createdAt: new Date(ref.getTime() - 3600e3) },
            { organizationId: f.org.id, status: 'FAILED', createdAt: new Date(ref.getTime() - 60e3) },
        ] });
        expect((await aiUsageToday(f.org.id, ref)).used).toBe(2);
        // Limit 3: one more slot, then full; the stale row never blocks it.
        expect(await reserveAiRequest(f.org.id, ref)).not.toBeNull();
        expect(await reserveAiRequest(f.org.id, ref)).toBeNull();
        await db.aiUsageLog.deleteMany({ where: { organizationId: f.org.id } });
    });
});
