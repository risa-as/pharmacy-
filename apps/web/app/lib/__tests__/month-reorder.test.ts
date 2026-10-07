import { describe, it, expect, vi, beforeEach } from 'vitest';
const state = vi.hoisted(() => ({ rows: [] as any[], planning: vi.fn(), settings: vi.fn() }));
vi.mock('@/app/lib/prisma', () => ({ prisma: { branch: { findFirst: async () => ({ id: 'branch-a', name: 'الفرع' }) } } }));
vi.mock('@/app/lib/saas-guards', () => ({ checkFeatureAccess: async () => ({ allowed: true }) }));
vi.mock('@/app/lib/purchase-planning', () => ({ resolvePlanningSettings: (...args: any[]) => state.settings(...args), settingsLine: () => 'saved' }));
vi.mock('@/app/lib/smart-purchasing-data', () => ({ getPlanningData: (...args: any[]) => state.planning(...args) }));
import { monthlyStockoutRequest, currentMonthPeriod } from '../month-reorder';
import { buildContext, classifyQuestion } from '../ai-assistant';
import { buildReorderCard } from '../ai-insights';
import { buildHandoff } from '../smart-purchasing-handoff';

const now = new Date('2026-09-20T09:00:00Z');
const ctx = { user: { id: 'u', branchId: 'branch-a' }, organizationId: 'org-a', branchModelWhere: { organizationId: 'org-a' }, tenantBranchWhere: { branchId: 'branch-a' }, userPermissions: { canCreateWarehouseOrder: true } } as any;
const command = 'اريد ان تقوم بطلب الادوية المنتهية والتي تم بيعها خلال هذا الشهر وتكون الكمية التي يتم طلبها تكفي لمدة 15 يوم';
const row = (extra = {}) => ({ inventoryId: 'inv', drugId: 'drug', drugName: 'دواء', scientificName: '', barcode: '123', branchId: 'branch-a', branchName: 'الفرع', minStock: 3, maxStock: 100, cost: 10, unitsPerPack: 12, sold: 40, returned: 0, observedDays: 20, lots: [], incoming: [], qualityReasons: [], ...extra });
beforeEach(() => {
    vi.clearAllMocks();
    state.rows = [row()];
    state.planning.mockImplementation(async () => ({ rows: state.rows, today: '2026-09-20', from: '2026-09-01', to: '2026-09-20', generatedAt: now.toISOString(), days: 20, notice: 'مزامنة غير مؤكدة' }));
    state.settings.mockResolvedValue({ options: { coverageDays: 40, leadDays: 0, safetyDays: 7, fromArrival: false }, source: 'BRANCH' });
});
it('recognizes the exact request and Arabic digits; excludes explicit expired-stock requests', () => {
    expect(monthlyStockoutRequest(command)).toEqual({ coverageDays: 15 });
    expect(monthlyStockoutRequest('جهز طلب النافد المباع هذا الشهر لمدة ١٥ يوم')).toEqual({ coverageDays: 15 });
    expect(monthlyStockoutRequest('اطلب الادوية المنتهية الصلاحية هذا الشهر')).toBeNull();
    expect(classifyQuestion(command)).toEqual(['reorder']);
});
it('uses Baghdad month including day one, never the previous month', () => {
    const period = currentMonthPeriod(new Date('2026-09-30T21:30:00Z'));
    expect(period.from).toBe('2026-10-01'); expect(period.days).toBe(1);
    expect(period.start.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-09-30T21:30:00.000Z');
});
it('routes the command to a scoped card, overrides coverage without saving, and rounds packs at handoff', async () => {
    const result = await buildContext(command, ctx, [], now);
    const card = result.cards[0];
    expect(card.kind).toBe('reorder'); if (card.kind !== 'reorder') throw new Error();
    expect(state.planning).toHaveBeenCalledWith(ctx, 'branch-a', undefined, undefined, { currentMonth: true, now });
    expect(card.options).toEqual({ coverageDays: 15, leadDays: 0, safetyDays: 0, fromArrival: true, source: 'CUSTOM' });
    expect(card.lines[0].suggestedQty).toBe(30); expect(card.lines[0].packs).toBe(3);
    const line = card.lines[0];
    expect(buildHandoff('branch-a', card.scope.generatedAt, [{ drugId: line.drugId, tradeName: line.drugName, barcode: line.barcode, scientificName: '', currentStock: 0, units: line.suggestedQty, unitsPerPack: line.unitsPerPack }]).lines[0].quantity).toBe(3);
});
it('excludes sellable stock, unsold and fully returned drugs, and incoming-covered needs', async () => {
    state.rows = [row({ drugId: 'in-stock', lots: [{ quantity: 1, expiryDate: '2027-01-01' }] }), row({ drugId: 'unsold', sold: 0 }), row({ drugId: 'returned', returned: 40 }), row({ drugId: 'covered', incoming: [{ quantity: 50, date: '2026-09-20', confirmed: true, reference: 'order' }] }), row({ drugId: 'expired-only', lots: [{ quantity: 100, expiryDate: '2026-09-19' }] })];
    const card = await buildReorderCard(ctx, { now, monthlyStockouts: { coverageDays: 15 } });
    expect(card.lines.map(l => l.drugId)).toEqual(['expired-only']);
});
it('subtracts confirmed incoming but not unconfirmed orders, and nets returns', async () => {
    state.rows = [row({ returned: 10, incoming: [{ quantity: 10, date: '2026-09-20', confirmed: true, reference: 'yes' }, { quantity: 200, date: null, confirmed: false, reference: 'no' }] })];
    const card = await buildReorderCard(ctx, { now, monthlyStockouts: { coverageDays: 15 } });
    expect(card.lines[0].suggestedQty).toBe(13);
});
it('covers fifteen days after saved lead time, without silently adding saved safety days', async () => {
    state.settings.mockResolvedValue({ options: { coverageDays: 40, leadDays: 3, safetyDays: 7, fromArrival: false }, source: 'BRANCH' });
    const card = await buildReorderCard(ctx, { now, monthlyStockouts: { coverageDays: 15 } });
    expect(card.lines[0].suggestedQty).toBe(30); expect(card.options.leadDays).toBe(3);
});
it('includes more than the general card limit and blocks drafting unknown packs or missing permission', async () => {
    state.rows = Array.from({ length: 20 }, (_, i) => row({ inventoryId: String(i), drugId: String(i) }));
    expect((await buildReorderCard(ctx, { now, monthlyStockouts: { coverageDays: 15 } })).lines).toHaveLength(20);
    state.rows = [row({ unitsPerPack: null })];
    expect((await buildReorderCard(ctx, { now, monthlyStockouts: { coverageDays: 15 } })).canDraft).toBe(false);
    state.rows = [row()];
    expect((await buildReorderCard({ ...ctx, userPermissions: { canCreateWarehouseOrder: false } }, { monthlyStockouts: { coverageDays: 15 } })).canDraft).toBe(false);
});
it('rejects invalid coverage and preserves the general card defaults', async () => {
    await expect(buildReorderCard(ctx, { monthlyStockouts: { coverageDays: 0 } })).rejects.toThrow();
    const card = await buildReorderCard(ctx, { now });
    expect(card.options.coverageDays).toBe(40); expect(card.options.safetyDays).toBe(7); expect(card.options.source).toBe('BRANCH');
});

it.each([
    ['تكفي 5 أيام', 5, 10], ['تكفي لمدة ١٠ أيام', 10, 20],
    ['لمدة 20 يوم', 20, 40], ['تغطية ٢٠ يوماً', 20, 40], ['لـ ٥ أيام', 5, 10],
])('uses the requested variable coverage: %s', async (duration, days, units) => {
    const text = `جهز طلب الادوية النافدة التي بيعت هذا الشهر ${duration}`;
    expect(monthlyStockoutRequest(text)?.coverageDays).toBe(days);
    const result = await buildContext(text, ctx, [], now);
    const card = result.cards[0];
    if (card.kind !== 'reorder') throw new Error();
    expect(card.options.coverageDays).toBe(days);
    expect(card.lines[0].suggestedQty).toBe(units);
});
it('uses saved coverage when the command omits days, never a hard-coded fifteen', async () => {
    const text = 'جهز طلب النافد المباع هذا الشهر';
    expect(monthlyStockoutRequest(text)?.coverageDays).toBeUndefined();
    const result = await buildContext(text, ctx, [], now);
    const card = result.cards[0];
    if (card.kind !== 'reorder') throw new Error();
    expect(card.options.coverageDays).toBe(40);
});
it.each(['0', '-5', '1.5', '366'])('does not silently replace invalid days %s with a default', async days => {
    const request = monthlyStockoutRequest(`جهز طلب النافد المباع هذا الشهر لمدة ${days} يوم`)!;
    await expect(buildReorderCard(ctx, { monthlyStockouts: request })).rejects.toThrow('مدة التغطية');
});
