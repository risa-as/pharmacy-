import { mapPlanningRows, yieldPlanning } from './planning-batch';
import { prisma } from '@/app/lib/prisma';
import type { TenantContext } from '@/app/lib/tenant-utils';
import { checkFeatureAccess } from '@/app/lib/saas-guards';
import { getPlanningData } from '@/app/lib/smart-purchasing-data';
import { planRow, simulateStock, saleRate, baghdadDate, dateStart, DAY, type PlanningOptions, type PlanningRow, type IncomingLot } from '@/app/lib/smart-purchasing';
import { discountPercent } from '@/app/lib/ai-data';
import { resolvePlanningSettings } from '@/app/lib/purchase-planning';
import { DEFAULT_PLANNING_OPTIONS, DEFAULT_TRANSFER_DAYS, MAX_TRANSFER_DAYS, SETTINGS_SOURCE_LABEL, describeOptions, type SettingsSource } from '@/app/lib/purchase-planning-shared';
import type { ReorderCard, ReorderLine, WasteCard, WasteLine, DailyCard, DailySignal, AssistantCard } from '@/app/lib/ai-cards';

/**
 * Deterministic assistant insights. Every number comes from the existing
 * planning engine (getPlanningData + planRow, the same one behind the smart
 * purchasing page) or from direct scoped queries; nothing is produced by the
 * language model. All reads are tenant-scoped through the TenantContext.
 */

/** Built-in defaults (used when neither the branch nor the organization saved settings). */
export const REORDER_OPTIONS: PlanningOptions = DEFAULT_PLANNING_OPTIONS;
const MAX_LINES = 15;
/** The card uses the saved settings of the branch (OPEN-14), the same ones as the smart purchasing page. */
export const settingsLine = (o: PlanningOptions, source: SettingsSource) =>
    `${SETTINGS_SOURCE_LABEL[source]}: ${describeOptions(o)}`;
const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtRate = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));

async function feature(ctx: TenantContext, flag: 'warehouseManagement' | 'interBranchTransfers') {
    return ctx.organizationId ? (await checkFeatureAccess(ctx.organizationId, flag)).allowed : false;
}

/** The branch a single-branch card is about: requested (if in scope), else the user's, else the first in scope. */
export async function resolveCardBranch(ctx: TenantContext, requested?: string | null) {
    const pick = async (id: string) => prisma.branch.findFirst({ where: { AND: [ctx.branchModelWhere, { id }] }, select: { id: true, name: true } });
    if (requested) {
        const b = await pick(requested);
        if (!b) throw new Error('الفرع خارج نطاق صلاحياتك');
        return b;
    }
    if (ctx.user.branchId) {
        const own = await pick(ctx.user.branchId);
        if (own) return own;
    }
    const first = await prisma.branch.findFirst({ where: ctx.branchModelWhere, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    if (!first) throw new Error('لا يوجد فرع ضمن نطاقك');
    return first;
}

// ─── "شنو أطلب اليوم؟" ────────────────────────────────────────────────────────

export async function buildReorderCard(ctx: TenantContext, opts: { branchId?: string | null; now?: Date; monthlyStockouts?: { coverageDays?: number } } = {}): Promise<ReorderCard> {
    const branch = await resolveCardBranch(ctx, opts.branchId);
    const request = opts.monthlyStockouts;
    if (request && request.coverageDays !== undefined && (!Number.isSafeInteger(request.coverageDays) || request.coverageDays < 1 || request.coverageDays > 365))
        throw new Error('مدة التغطية يجب أن تكون بين 1 و365 يوماً');
    const [data, settings] = await Promise.all([
        getPlanningData(ctx, branch.id, undefined, undefined, { currentMonth: !!request, now: opts.now }),
        resolvePlanningSettings(ctx, branch.id),
    ]);
    // Explicit coverage overrides saved coverage/safety for this request only.
    // Retain supplier lead time and cover the requested days AFTER arrival.
    const options = request ? { ...settings.options, coverageDays: request.coverageDays ?? settings.options.coverageDays, safetyDays: 0, fromArrival: true } : settings.options;
    const planned = (await mapPlanningRows(data.rows, r => planRow(r, options, data.today)))
        .filter(r => request ? r.out && r.sold > 0 && r.netSales > 0 && r.suggestedQty > 0 : r.action);
    // Most urgent first: out of stock, then lost sales before arrival, then shortest coverage.
    planned.sort((a, b) =>
        Number(b.out) - Number(a.out)
        || b.urgentUnits - a.urgentUnits
        || (a.coverage ?? Infinity) - (b.coverage ?? Infinity)
        || b.suggestedQty - a.suggestedQty);

    const lines: ReorderLine[] = planned.slice(0, request ? 500 : MAX_LINES).map(r => {
        const reasons: string[] = request ? [`مبيعات الشهر: ${fmtN(r.sold)} وحدة، مرتجعاتها: ${fmtN(r.returned)}، أيام الرصد: ${r.observedDays}`] : [];
        if (r.out) reasons.push('نفد المخزون القابل للبيع');
        else reasons.push(`المخزون القابل للبيع ${fmtN(r.currentStock)} وحدة`);
        if (r.averageDailySales > 0) reasons.push(`متوسط البيع ${fmtRate(r.averageDailySales)} وحدة/يوم (صافي بعد المرتجعات، ${data.days} يوماً)`);
        if (r.coverage !== null && !r.out) reasons.push(r.coverage < 1 ? 'لا يكفي يوماً كاملاً' : `يكفي نحو ${Math.floor(r.coverage)} يوم`);
        if (r.low) reasons.push(`أقل من الحد الأدنى (${r.minStock})`);
        if (r.pending > 0) reasons.push(`طلبات مفتوحة: ${fmtN(r.pending)} وحدة`);
        if (r.shortageUnits > 0) reasons.push(`نقص متوقع ${fmtN(r.shortageUnits)} وحدة خلال ${options.coverageDays} يوماً دون طلب`);
        const limits = [...r.qualityReasons];
        if (request) limits.push('المتوسط يشمل اليوم الجاري؛ أيام النفاد غير موثقة وقد تقلل تقدير الطلب.');
        if (r.cost === null) limits.push('تكلفة الشراء غير مسجلة');
        if (!r.unitsPerPack) limits.push('عدد الوحدات في العبوة غير مؤكد؛ لا يدخل مسودة الطلب');
        return {
            inventoryId: r.inventoryId, drugId: r.drugId, drugName: r.drugName, scientificName: r.scientificName, barcode: r.barcode,
            currentStock: r.currentStock, averageDailySales: r.averageDailySales, coverageDays: r.coverage === null ? null : Math.floor(r.coverage),
            pending: r.pending, suggestedQty: r.suggestedQty, unitsPerPack: r.unitsPerPack, packs: r.packs,
            urgent: r.out || r.urgentUnits > 0, out: r.out, reasons, limits,
        };
    });

    const warehouse = await feature(ctx, 'warehouseManagement');
    const draftBlockedReason = !ctx.userPermissions.canCreateWarehouseOrder ? 'ليس لديك صلاحية إنشاء طلب مذخر'
        : !warehouse ? 'ميزة طلبات المذاخر غير متاحة في باقتك'
        : !lines.some(l => l.unitsPerPack && l.suggestedQty > 0) ? 'لا توجد أصناف بكمية مقترحة وتعبئة مؤكدة'
        : null;

    return {
        kind: 'reorder',
        title: request ? `شراء النافد المباع هذا الشهر — تغطية ${options.coverageDays} يوماً — ${branch.name}` : `ماذا تطلب اليوم — ${branch.name}`,
        scope: {
            branchId: branch.id, branchName: branch.name, from: data.from, to: data.to, generatedAt: data.generatedAt,
            notes: request ? [data.notice,
                'المقصود بالمنتهية هنا: نفاد المخزون القابل للبيع، وليس طلب الدفعات منتهية الصلاحية.',
                'مبيعات الشهر الحالي حتى وقت التحديث بتوقيت بغداد؛ المتوسط على أيام الرصد التقويمية بما فيها اليوم الجاري.',
                `تغطية ${options.coverageDays} يوماً من الوصول، مدة التوريد المحفوظة ${options.leadDays} يوم، بلا أيام أمان إضافية. لم تتغير الإعدادات المحفوظة.`,
                'تُخصم الطلبات المؤكدة بحسب موعد وصولها وصلاحيتها؛ الأصناف المغطاة بالكامل لا تدخل المسودة. تُقرّب الكمية إلى عبوات كاملة.',
                ...(planned.length > 500 ? ['تتجاوز النتائج 500 صنف؛ المسودة تشمل أول 500 صنف معروض فقط.'] : []),
            ] : [data.notice, `${settingsLine(options, settings.source)}. هي نفسها المستخدمة في صفحة الشراء الذكي، وتُحفظ من هناك للفرع أو للمؤسسة.`],
        },
        options: { ...options, source: request ? 'CUSTOM' : settings.source as Exclude<SettingsSource, 'CUSTOM'> },
        lines,
        totalCandidates: planned.length,
        canDraft: draftBlockedReason === null,
        draftBlockedReason,
        links: [{ label: 'فتح الشراء الذكي', href: '/dashboard/purchases/smart-order' }],
    };
}

// ─── المخزون المعرّض للهدر ──────────────────────────────────────────────────────

/** Built-in transfer days when the source branch has no saved setting (OPEN-14 saves it per branch). */
export const TRANSFER_DAYS = DEFAULT_TRANSFER_DAYS;
/** Longest receiver simulation for a transfer (its own stock expiring later than this is not checked). */
export const MAX_TRANSFER_HORIZON = 365;
const whole = (x: number) => Math.floor(x + 1e-7);
const ceilUnits = (x: number) => Math.ceil(Math.max(0, x - 1e-7));
type PlannedRow = PlanningRow & { rate: number };

/**
 * Largest whole quantity of a lot (expiry `expiryDate`) the receiver can take,
 * arriving on `arrival`, without increasing its own expected expired units:
 * the simulation sells first-expiry-first, so this also catches a transfer that
 * would push the receiver's own stock past its expiry. `extra` holds transfers
 * already proposed to this receiver, so the same need is never covered twice.
 */
export function transferCapacity(
    receiver: Pick<PlanningRow, 'lots' | 'incoming'>, rate: number, extra: IncomingLot[],
    expiryDate: string, arrival: string, max: number, horizon: number, today: string,
): number {
    if (max <= 0 || rate <= 0 || arrival > expiryDate) return 0;
    // A lot moved in is sold first and delays the receiver's own stock, which may
    // then expire AFTER the card window. Simulate until the receiver's latest real
    // expiry (+1 day to see it expire), capped at MAX_TRANSFER_HORIZON days.
    const dayIndex = (d: string) => Math.round((dateStart(d).getTime() - dateStart(today).getTime()) / DAY);
    const expiries = [expiryDate, ...receiver.lots.map(l => l.expiryDate), ...[...receiver.incoming, ...extra].map(l => l.expiryDate ?? '')]
        .filter(d => d && d !== '9999-12-31' && d >= today);
    horizon = Math.min(MAX_TRANSFER_HORIZON, Math.max(horizon, ...expiries.map(d => dayIndex(d) + 2)));
    const run = (q: number) => simulateStock(
        { lots: receiver.lots, incoming: [...receiver.incoming, ...extra, ...(q > 0 ? [{ quantity: q, date: arrival, expiryDate, confirmed: true, reference: 'transfer' }] : [])] },
        rate, horizon, 0, 0, today).expired;
    const base = run(0);
    let lo = 0, hi = max;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (run(mid) - base <= 1e-6) lo = mid; else hi = mid - 1;
    }
    return lo;
}

/** "فرع أ: 1 يوم، فرع ب: 5 أيام" for the branches whose lines are shown. */
function describeTransferDays(shown: { row: { branchId: string; branchName: string } }[], days: Map<string, number>) {
    const names = new Map(shown.map(s => [s.row.branchId, s.row.branchName]));
    return Array.from(days.entries()).map(([id, d]) => `${names.get(id)}: ${d} يوم`).join('، ') || '—';
}

export async function buildWasteCard(ctx: TenantContext, opts: { windowDays?: number; branchId?: string | null; now?: Date; transfers?: boolean; transferDays?: number } = {}): Promise<WasteCard> {
    const windowDays = Math.min(365, Math.max(7, Math.round(opts.windowDays ?? 60)));
    // An explicit value (tests, callers) wins; otherwise each SOURCE branch uses its saved setting.
    const forcedTransferDays = opts.transferDays === undefined ? null : Math.min(MAX_TRANSFER_DAYS, Math.max(0, Math.round(opts.transferDays)));
    const branch = opts.branchId ? await resolveCardBranch(ctx, opts.branchId) : null;
    // Every branch in scope is read, even for one branch: transfer receivers are the others.
    const data = await getPlanningData(ctx, undefined, undefined, undefined, { lotCosts: true });
    const today = data.today;
    const limitDate = baghdadDate(new Date(dateStart(today).getTime() + windowDays * DAY));
    const rows: PlannedRow[] = data.rows.map(r => ({ ...r, rate: saleRate(r) }));

    let unknownValueLines = 0, incomingExpiring = 0;
    const atRisk: { row: PlannedRow; line: WasteLine; lots: { expiryDate: string; unsold: number }[] }[] = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        if (rowIndex > 0 && rowIndex % 256 === 0) await yieldPlanning();
        const r = rows[rowIndex];
        if (branch && r.branchId !== branch.id) continue;
        // No lot can expire within this window: no risk or expiring-incoming
        // count can be produced. Keep equality at limitDate excluded, as the
        // simulation ends before that day.
        if (!r.lots.some(l => l.expiryDate >= today && l.expiryDate < limitDate)
            && !r.incoming.some(l => l.expiryDate && l.expiryDate < limitDate)) continue;
        // First-expiry-first simulation at the current sale rate: units of EACH lot left unsold at its expiry.
        const sim = simulateStock(r, r.rate, windowDays, 0, 0, today);
        if (sim.expiredIncoming > 1e-7) incomingExpiring++;
        const costs = data.lotCosts?.[r.inventoryId];
        const aligned = !!costs && costs.length === r.lots.length;
        let expectedUnsold = 0, value = 0, valued = 0;
        const lots: { expiryDate: string; unsold: number }[] = [];
        r.lots.forEach((l, i) => {
            const units = ceilUnits(sim.expiredByLot[i]);
            if (!units) return;
            expectedUnsold += units;
            // The lot's own cost; the item cost when the lot has none; never 0 as a real cost.
            const lotCost = aligned && costs![i] > 0 ? costs![i] : null;
            const unitCost = lotCost ?? r.cost;
            if (unitCost && unitCost > 0) { value += units * unitCost; valued += units; }
            lots.push({ expiryDate: l.expiryDate, unsold: whole(sim.expiredByLot[i]) });
        });
        if (!expectedUnsold) continue;
        const unvaluedUnits = expectedUnsold - valued;
        if (unvaluedUnits > 0) unknownValueLines++;
        lots.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
        atRisk.push({
            row: r, lots,
            line: {
                drugId: r.drugId, drugName: r.drugName, branchId: r.branchId, branchName: r.branchName,
                stockInWindow: r.lots.filter(l => l.expiryDate >= today && l.expiryDate < limitDate).reduce((s, l) => s + l.quantity, 0),
                nearestExpiry: lots[0].expiryDate,
                averageDailySales: r.rate,
                expectedUnsold,
                valueAtRisk: valued > 0 ? value : null,
                unvaluedUnits,
                transfers: [],
            },
        });
    }
    atRisk.sort((a, b) => (b.line.valueAtRisk ?? -1) - (a.line.valueAtRisk ?? -1) || b.line.expectedUnsold - a.line.expectedUnsold);
    const shown = atRisk.slice(0, MAX_LINES);

    // Transfers: only for the lines shown (each needs several simulations), never automatic.
    const transfersAllowed = ctx.userPermissions.canTransferStock && await feature(ctx, 'interBranchTransfers');
    const computeTransfers = transfersAllowed && opts.transfers !== false;
    const daysBySource = new Map<string, number>();
    if (computeTransfers) {
        for (const branchId of Array.from(new Set(shown.map(s => s.row.branchId))))
            daysBySource.set(branchId, forcedTransferDays ?? (await resolvePlanningSettings(ctx, branchId)).transferDays);
        const assigned = new Map<string, IncomingLot[]>();
        for (const { row, line, lots } of shown) {
            const transferDays = daysBySource.get(row.branchId)!;
            const arrival = baghdadDate(new Date(dateStart(today).getTime() + transferDays * DAY));
            const receivers = rows
                .filter(s => s.drugId === row.drugId && s.branchId !== row.branchId && s.rate > 0)
                .sort((a, b) => b.rate - a.rate);
            for (const lot of lots) {
                let left = lot.unsold;
                for (const rcv of receivers) {
                    if (left <= 0) break;
                    const extra = assigned.get(rcv.inventoryId) ?? [];
                    const q = transferCapacity(rcv, rcv.rate, extra, lot.expiryDate, arrival, left, windowDays, today);
                    if (!q) continue;
                    assigned.set(rcv.inventoryId, [...extra, { quantity: q, date: arrival, expiryDate: lot.expiryDate, confirmed: true, reference: 'transfer' }]);
                    line.transfers.push({ branchId: rcv.branchId, branchName: rcv.branchName, quantity: q, expiryDate: lot.expiryDate, arrivalDate: arrival, transferDays, averageDailySales: rcv.rate });
                    left -= q;
                }
            }
        }
    }

    const lines = atRisk.map(a => a.line);
    const totalValueAtRisk = lines.reduce((s, l) => s + (l.valueAtRisk ?? 0), 0);
    return {
        kind: 'waste',
        title: `مخزون معرّض للانتهاء دون بيع خلال ${windowDays} يوماً${branch ? ` — ${branch.name}` : ''}`,
        scope: {
            branchId: branch?.id ?? null, branchName: branch?.name ?? 'كل الفروع ضمن نطاقك', from: data.from, to: data.to, generatedAt: data.generatedAt,
            notes: [
                'الكمية المتوقعة دون بيع = محاكاة يومية تبيع الدفعة الأقرب انتهاءً أولاً بمعدل البيع الحالي؛ تُحسب لكل دفعة على حدة.',
                'القيمة = كمية كل دفعة × تكلفة تلك الدفعة، أو تكلفة الصنف إن لم تُسجل تكلفة الدفعة.',
                ...(unknownValueLines ? [`${unknownValueLines} صنف فيه وحدات بلا تكلفة مسجلة؛ غير محسوبة في الإجمالي.`] : []),
                ...(incomingExpiring ? [`${incomingExpiring} صنف فيه طلبات قادمة قد تنتهي قبل بيعها؛ غير داخلة في القيمة.`] : []),
                ...(computeTransfers ? [
                    `التحويل المقترح: أكبر كمية يبيعها الفرع المستقبِل قبل انتهاء الدفعة دون أن يزيد ما ينتهي عنده، بمدة النقل المحفوظة لفرع المصدر (${describeTransferDays(shown, daysBySource)})، مع مخزونه وطلباته المؤكدة والتحويلات الأخرى المقترحة إليه، حتى آخر صلاحية في مخزونه (بحد ${MAX_TRANSFER_HORIZON} يوماً).`,
                    'التحويل اقتراح للمراجعة فقط؛ لا يُنفَّذ تلقائياً، ولا يُخصم من اقتراح الشراء للفرع المستقبِل. الطلبات غير مؤكدة الموعد لا تدخل الحساب.',
                ] : transfersAllowed ? [] : ['اقتراحات التحويل بين الفروع غير متاحة (الصلاحية أو الباقة).']),
                data.notice,
            ],
        },
        windowDays,
        transferDays: computeTransfers ? Array.from(new Set(daysBySource.values())).sort((a, b) => a - b) : null,
        lines: lines.slice(0, MAX_LINES),
        totalValueAtRisk,
        unknownValueLines,
        links: [
            { label: 'تقرير الصلاحيات', href: '/dashboard/reports/expiry' },
            ...(transfersAllowed ? [{ label: 'تحويل بين الفروع', href: '/dashboard/inventory/transfers' }] : []),
            { label: 'المنتهي والتالف', href: '/dashboard/inventory/expired-damaged' },
        ],
    };
}

// ─── ملخص المدير اليومي ────────────────────────────────────────────────────────

export async function buildDailyCard(ctx: TenantContext, opts: { now?: Date } = {}): Promise<DailyCard> {
    const now = opts.now ?? new Date();
    const today = baghdadDate(now);
    const todayStart = dateStart(today);
    const yStart = new Date(todayStart.getTime() - DAY);
    const signals: DailySignal[] = [];
    const notes: string[] = ['يعرض أهم ثلاث نقاط فقط؛ التفاصيل في الروابط.'];

    // 1. Stock that is out or runs out before a new order could arrive.
    try {
        const reorder = await buildReorderCard(ctx, { now });
        const urgent = reorder.lines.filter(l => l.out || l.urgent || (l.coverageDays !== null && l.coverageDays < 3));
        if (urgent.length) signals.push({
            id: 'reorder', severity: 'high',
            title: `${urgent.length} صنف نفد أو سينفد خلال 3 أيام — ${reorder.scope.branchName}`,
            detail: urgent.slice(0, 3).map(l => l.out ? `${l.drugName} (نفد)` : `${l.drugName} (يكفي ${l.coverageDays} يوم)`).join('، '),
            link: { label: 'ماذا أطلب اليوم', href: '/dashboard/purchases/smart-order' },
        });
    } catch (e: any) { notes.push(`تعذر تحليل الاحتياج: ${e?.message ?? 'خطأ'}`); }

    // 2. Stock value expected to expire unsold within 30 days.
    try {
        const waste = await buildWasteCard(ctx, { windowDays: 30, now, transfers: false });
        if (waste.lines.length) signals.push({
            id: 'waste', severity: waste.totalValueAtRisk > 0 ? 'medium' : 'info',
            title: waste.totalValueAtRisk > 0
                ? `بضاعة بقيمة ${fmtN(waste.totalValueAtRisk)} د.ع قد تنتهي دون بيع خلال 30 يوماً`
                : `${waste.lines.length} صنف قد ينتهي دون بيع خلال 30 يوماً (بلا تكلفة مسجلة)`,
            detail: waste.lines.slice(0, 3).map(l => `${l.drugName} (${l.expectedUnsold} وحدة)`).join('، '),
            link: { label: 'المخزون المعرض للهدر', href: '/dashboard/reports/expiry' },
        });
    } catch (e: any) { notes.push(`تعذر تحليل الصلاحيات: ${e?.message ?? 'خطأ'}`); }

    // 3. Yesterday: cash differences, then discounts above the limit. Counts only, no personal data.
    const yesterday = { gte: yStart, lt: todayStart };
    const [shifts, settings, sales] = await Promise.all([
        prisma.shift.findMany({ where: { ...ctx.tenantBranchWhere, endTime: yesterday, actualCash: { not: null } }, select: { actualCash: true, expectedCash: true } }),
        prisma.companySettings.findFirst({ where: { organizationId: ctx.organizationId }, select: { maxDiscountPercent: true } }),
        prisma.sale.findMany({ where: { ...ctx.tenantBranchWhere, createdAt: yesterday, discount: { gt: 0 } }, select: { total: true, discount: true } }),
    ]);
    const diffs = shifts.map(s => (s.actualCash ?? 0) - s.expectedCash).filter(d => Math.abs(d) >= 1);
    if (diffs.length) signals.push({
        id: 'cash', severity: 'high',
        title: `${diffs.length} وردية أمس بفرق في الكاش (المجموع المطلق ${fmtN(diffs.reduce((s, d) => s + Math.abs(d), 0))} د.ع)`,
        detail: 'راجع تقرير الورديات للتفاصيل.',
        link: { label: 'تقرير الورديات', href: '/dashboard/reports/shifts' },
    });
    const limit = settings?.maxDiscountPercent ?? 10;
    const overLimit = sales.filter(s => discountPercent(s.total, s.discount) > limit).length;
    if (overLimit) signals.push({
        id: 'discount', severity: 'medium',
        title: `${overLimit} فاتورة أمس بخصم أعلى من الحد (${limit}%)`,
        detail: 'اسأل المساعد: «هل هناك تجاوزات في الخصومات أمس؟» للتفاصيل.',
        link: null,
    });

    const order = { high: 0, medium: 1, info: 2 } as const;
    signals.sort((a, b) => order[a.severity] - order[b.severity]);
    const top = signals.slice(0, 3);
    if (!top.length) top.push({ id: 'none', severity: 'info', title: 'لا توجد نقاط تحتاج انتباهاً عاجلاً اليوم', detail: 'لا نفاد قريب، ولا مخزون معرض للانتهاء، ولا فروقات أو تجاوزات أمس.', link: null });

    return {
        kind: 'daily',
        title: `ملخص اليوم — ${today}`,
        scope: { branchId: null, branchName: 'نطاقك', generatedAt: now.toISOString(), notes },
        date: today,
        signals: top,
    };
}

export async function buildCard(kind: string, ctx: TenantContext, opts: { branchId?: string | null; windowDays?: number } = {}): Promise<AssistantCard> {
    if (kind === 'reorder') return buildReorderCard(ctx, opts);
    if (kind === 'waste') return buildWasteCard(ctx, opts);
    if (kind === 'daily') return buildDailyCard(ctx);
    throw new Error('نوع غير معروف');
}

/** Compact, numbers-only text of a card for the model to explain (no raw lists of personal data). */
export function summarizeCard(card: AssistantCard): string {
    if (card.kind === 'reorder') {
        return `## اقتراحات الشراء (بطاقة معروضة للمستخدم) — ${card.scope.branchName}
بيانات المبيعات: ${card.scope.from} إلى ${card.scope.to}. ${card.totalCandidates} صنف يحتاج إجراء، يُعرض أهم ${card.lines.length}.
${card.lines.map(l => `- ${l.drugName}: مقترح ${l.suggestedQty} وحدة${l.packs ? ` (${l.packs} عبوة)` : ''} | ${l.reasons.join('؛ ')}${l.limits.length ? ` | حدود: ${l.limits.join('؛ ')}` : ''}`).join('\n')}
${card.canDraft ? 'يستطيع المستخدم إعداد مسودة طلب للمراجعة من البطاقة.' : `مسودة الطلب غير متاحة: ${card.draftBlockedReason}`}
ملاحظات: ${card.scope.notes.join(' ')}`;
    }
    if (card.kind === 'waste') {
        return `## المخزون المعرض للانتهاء دون بيع خلال ${card.windowDays} يوماً (بطاقة معروضة) — ${card.scope.branchName}
القيمة المعرضة (بالتكلفة): ${fmtN(card.totalValueAtRisk)} د.ع${card.unknownValueLines ? ` + ${card.unknownValueLines} صنف بلا تكلفة` : ''}.
${card.lines.map(l => `- ${l.drugName} (${l.branchName}): ${l.expectedUnsold} وحدة متوقع عدم بيعها، أقرب انتهاء ${l.nearestExpiry}، بيع ${fmtRate(l.averageDailySales)}/يوم${l.valueAtRisk !== null ? `، قيمة ${fmtN(l.valueAtRisk)} د.ع` : ''}${l.unvaluedUnits ? `، ${l.unvaluedUnits} وحدة بلا تكلفة` : ''}${l.transfers.length ? `، اقتراح للمراجعة: ${l.transfers.map(t => `تحويل ${t.quantity} وحدة (انتهاء ${t.expiryDate}) إلى ${t.branchName}`).join('، ')}` : ''}`).join('\n')}
ملاحظات: ${card.scope.notes.join(' ')}`;
    }
    return `## ملخص اليوم ${card.date} (بطاقة معروضة)
${card.signals.map(s => `- [${s.severity}] ${s.title}: ${s.detail}`).join('\n')}`;
}
