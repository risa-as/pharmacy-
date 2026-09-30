import { prisma } from '@/app/lib/prisma';
import type { TenantContext } from '@/app/lib/tenant-utils';
import { validatePlanningOptions, type PlanningOptions } from '@/app/lib/smart-purchasing';
import { computeDraftMetrics, DRAFT_SOURCES, type DraftSource } from '@/app/lib/purchase-draft-metrics';
import { isDraftId, MAX_DRAFT_LINES } from '@/app/lib/purchase-draft-client';

/**
 * OPEN-14: purchase drafts (smart purchasing page / assistant card → order form).
 * Measurement only: a draft never creates or sends an order, and a failure here
 * must never block purchasing (the client continues without a draft id).
 */

const SETTINGS_SOURCES = ['BRANCH', 'ORGANIZATION', 'DEFAULT', 'CUSTOM'];
const int = (v: unknown, min: number, max: number) => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;

export class DraftError extends Error {
    constructor(readonly status: number, message: string) { super(message); }
}

export interface DraftInput {
    id: string;
    branchId: string;
    source: DraftSource;
    settingsSource: string;
    options: PlanningOptions;
    lines: { drugId: string; barcode?: string | null; suggestedUnits: number; draftUnits: number; unitsPerPack: number }[];
}

/** Create-if-absent: the client generates the id, so a retry is harmless. */
export async function createDraft(ctx: TenantContext, input: DraftInput) {
    if (!ctx.userPermissions.canCreateWarehouseOrder) throw new DraftError(403, 'ليس لديك صلاحية إنشاء طلبات المذاخر');
    if (!isDraftId(input?.id)) throw new DraftError(400, 'معرّف المسودة غير صالح');
    if (!(DRAFT_SOURCES as readonly string[]).includes(input.source)) throw new DraftError(400, 'مصدر المسودة غير صالح');
    if (!SETTINGS_SOURCES.includes(input.settingsSource)) throw new DraftError(400, 'مصدر الإعدادات غير صالح');
    const options = input.options;
    try { validatePlanningOptions(options); } catch { throw new DraftError(400, 'إعدادات المسودة غير صالحة'); }
    const lines = Array.isArray(input.lines) ? input.lines : [];
    if (!lines.length || lines.length > MAX_DRAFT_LINES) throw new DraftError(400, `المسودة تحتاج من 1 إلى ${MAX_DRAFT_LINES} صنف`);
    if (lines.some(l => typeof l?.drugId !== 'string' || !int(l.suggestedUnits, 0, 1_000_000) || !int(l.draftUnits, 0, 1_000_000) || !int(l.unitsPerPack, 1, 100_000)))
        throw new DraftError(400, 'سطر غير صالح في المسودة');
    const ids = new Set(lines.map(l => l.drugId));
    if (ids.size !== lines.length) throw new DraftError(400, 'صنف مكرر في المسودة');

    const branch = await prisma.branch.findFirst({ where: { AND: [ctx.branchModelWhere, { id: input.branchId }] }, select: { id: true, organizationId: true } });
    if (!branch) throw new DraftError(403, 'الفرع خارج نطاق صلاحياتك');

    const existing = await prisma.purchaseDraft.findUnique({ where: { id: input.id }, select: { id: true, branchId: true, userId: true } });
    if (existing) {
        if (existing.branchId !== branch.id || existing.userId !== ctx.user.id) throw new DraftError(409, 'معرّف المسودة مستخدم لمسودة أخرى');
        return { id: existing.id, created: false };
    }
    // Every line must be an item this branch stocks (the draft came from its planning rows).
    const known = await prisma.inventory.count({ where: { branchId: branch.id, drugId: { in: Array.from(ids) } } });
    if (known !== ids.size) throw new DraftError(400, 'المسودة تحتوي أصنافاً ليست في مخزون الفرع');

    try {
        await prisma.purchaseDraft.create({
            data: {
                id: input.id, organizationId: branch.organizationId, branchId: branch.id, userId: ctx.user.id,
                source: input.source, settingsSource: input.settingsSource,
                coverageDays: options.coverageDays, leadDays: options.leadDays, safetyDays: options.safetyDays, fromArrival: options.fromArrival,
                lineCount: lines.length,
                lines: { create: lines.map(l => ({
                    drugId: l.drugId, barcode: l.barcode || null, suggestedUnits: l.suggestedUnits, draftUnits: l.draftUnits,
                    unitsPerPack: l.unitsPerPack, draftPacks: Math.ceil(l.draftUnits / l.unitsPerPack),
                })) },
            },
        });
        return { id: input.id, created: true };
    } catch (e: any) {
        // A concurrent retry with the same id won the race: same answer as a replay.
        if (e?.code === 'P2002') {
            const again = await prisma.purchaseDraft.findUnique({ where: { id: input.id }, select: { branchId: true, userId: true } });
            if (again && again.branchId === branch.id && again.userId === ctx.user.id) return { id: input.id, created: false };
            throw new DraftError(409, 'معرّف المسودة مستخدم لمسودة أخرى');
        }
        throw e;
    }
}

/** Marks the draft as opened in the order form, once (a repeat changes nothing). */
export async function markDraftImported(ctx: TenantContext, id: string) {
    if (!isDraftId(id)) throw new DraftError(400, 'معرّف المسودة غير صالح');
    const { count } = await prisma.purchaseDraft.updateMany({
        where: { id, importedAt: null, branch: ctx.branchModelWhere },
        data: { importedAt: new Date() },
    });
    return { imported: count === 1 };
}

/**
 * Closes the draft, once: the order form reports that every line was sent, or
 * the user confirms the rest will not be. Until then an unsent line counts as
 * "not sent yet" (another warehouse may be pending), never as removed.
 */
export async function markDraftCompleted(ctx: TenantContext, id: string) {
    if (!isDraftId(id)) throw new DraftError(400, 'معرّف المسودة غير صالح');
    const { count } = await prisma.purchaseDraft.updateMany({
        where: { id, completedAt: null, branch: ctx.branchModelWhere },
        data: { completedAt: new Date() },
    });
    return { completed: count === 1 };
}

/**
 * The draft an order may be linked to: same branch as the order (the branch
 * already belongs to the caller's organization). Anything else is ignored so a
 * bad or stale id never blocks sending the order.
 */
export async function draftForOrder(tx: Pick<typeof prisma, 'purchaseDraft'>, draftId: unknown, branchId: string) {
    if (!isDraftId(draftId)) return null;
    const draft = await tx.purchaseDraft.findFirst({ where: { id: draftId, branchId }, select: { id: true } });
    if (!draft) console.warn('[purchase-drafts] ignored draft id for order (not this branch)', draftId);
    return draft?.id ?? null;
}

export async function draftMetrics(ctx: TenantContext, opts: { days?: number; branchId?: string | null; now?: Date } = {}) {
    const days = Math.min(365, Math.max(1, Math.round(opts.days ?? 30)));
    const now = opts.now ?? new Date();
    const since = new Date(now.getTime() - days * 86_400_000);
    const drafts = await prisma.purchaseDraft.findMany({
        where: { AND: [{ branch: ctx.branchModelWhere }, ...(opts.branchId ? [{ branchId: opts.branchId }] : []), { createdAt: { gte: since } }] },
        select: {
            id: true, source: true, createdAt: true, importedAt: true, completedAt: true,
            lines: { select: { drugId: true, barcode: true, suggestedUnits: true, draftUnits: true, unitsPerPack: true, draftPacks: true } },
            orders: { select: { createdAt: true, items: { select: { drugId: true, quantity: true, unitsPerPack: true, drug: { select: { barcode: true } } } } } },
        },
    });
    const metrics = computeDraftMetrics(drafts.map(d => ({
        ...d, orders: d.orders.map(o => ({ createdAt: o.createdAt, items: o.items.map(i => ({ drugId: i.drugId, quantity: i.quantity, unitsPerPack: i.unitsPerPack, barcode: i.drug?.barcode ?? null })) })),
    })));
    return { days, since: since.toISOString(), branchId: opts.branchId ?? null, ...metrics };
}
