/**
 * OPEN-14: draft → order measurement (pure, no database). In this system
 * creating a warehouse order sends it, so "ordered" means a sent order exists.
 * Final quantities are read from the orders linked to the draft, summed across
 * warehouses; each order is a distinct row, so nothing is counted twice.
 *
 * Quantities are compared in base (inventory) units, split so that
 *   final = pageChange + rounding + formChange
 * for every sent line:
 *   pageChange  = draftUnits − suggestedUnits        (user edit on the smart purchasing page)
 *   rounding    = draftPacks × upp − draftUnits      (whole packs; never a user choice)
 *   formChange  = sentPacks × upp − draftPacks × upp (user edit in the order form)
 *   final       = sentPacks × upp − suggestedUnits
 */

export const DRAFT_SOURCES = ['SMART_PAGE', 'AI_CARD'] as const;
export type DraftSource = (typeof DRAFT_SOURCES)[number];

export interface DraftForMetrics {
    id: string;
    source: string;
    createdAt: Date;
    importedAt: Date | null;
    /** Closed: every line was sent, or the user confirmed the rest will not be. */
    completedAt: Date | null;
    lines: { drugId: string; barcode: string | null; suggestedUnits: number; draftUnits: number; unitsPerPack: number; draftPacks: number }[];
    orders: { createdAt: Date; items: { drugId: string; barcode: string | null; quantity: number; unitsPerPack?: number | null }[] }[];
}

/** Increases and decreases kept apart: opposite edits must not cancel out in a net figure. */
export interface UnitChange { increase: number; decrease: number; net: number }

export interface DraftMetrics {
    drafts: number;
    bySource: Record<DraftSource, number>;
    /** Opened in the order form. */
    imported: number;
    /** At least one order was sent from the draft. */
    ordered: number;
    /** Closed drafts (all sent, or the rest dropped on purpose). */
    completed: number;
    orderRate: number | null;
    orderRateOfImported: number | null;
    orders: number;
    lines: {
        total: number;
        /** The user changed the engine suggestion before handing it to the form. */
        changedBeforeDraft: number;
        /** Sent with a quantity (any warehouse). */
        ordered: number;
        /** Sent with a different pack count than the draft. */
        changedInForm: number;
        /** Unsent line of a CLOSED draft (dropped). */
        removed: number;
        /** Unsent line of a draft that is still open (e.g. another warehouse not sent yet). */
        notSentYet: number;
        /** Sent in a linked order but not in the draft. */
        added: number;
        /** Sent with a pack size different from the draft's: left out of the unit figures. */
        packSizeMismatch: number;
    };
    /** Base units over the sent lines (packSizeMismatch excluded). */
    units: {
        suggested: number;
        sent: number;
        pageChange: UnitChange;
        rounding: number;
        formChange: UnitChange;
        final: UnitChange;
    };
    medianMinutesToFirstOrder: number | null;
}

const rate = (a: number, b: number) => (b > 0 ? a / b : null);
const change = (): UnitChange => ({ increase: 0, decrease: 0, net: 0 });
function add(c: UnitChange, v: number) {
    if (v > 0) c.increase += v; else c.decrease += -v;
    c.net += v;
}

function median(values: number[]) {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a - b), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computeDraftMetrics(drafts: DraftForMetrics[]): DraftMetrics {
    const bySource = { SMART_PAGE: 0, AI_CARD: 0 } as Record<DraftSource, number>;
    let imported = 0, ordered = 0, completed = 0, orders = 0;
    let total = 0, changedBeforeDraft = 0, orderedLines = 0, changedInForm = 0, removed = 0, notSentYet = 0, added = 0, packSizeMismatch = 0;
    const units = { suggested: 0, sent: 0, pageChange: change(), rounding: 0, formChange: change(), final: change() };
    const minutes: number[] = [];

    for (const d of drafts) {
        if ((DRAFT_SOURCES as readonly string[]).includes(d.source)) bySource[d.source as DraftSource]++;
        if (d.importedAt) imported++;
        if (d.completedAt) completed++;
        total += d.lines.length;
        changedBeforeDraft += d.lines.filter(l => l.draftUnits !== l.suggestedUnits).length;
        if (!d.orders.length) continue;
        ordered++;
        orders += d.orders.length;
        minutes.push(Math.max(0, (Math.min(...d.orders.map(o => o.createdAt.getTime())) - d.createdAt.getTime()) / 60000));

        // Match each sent item to a draft line: same drug, else same barcode
        // (orders may resolve a barcode to the shared catalogue drug).
        const sent = new Map<number, number>();
        const mismatch = new Set<number>();
        const extra = new Set<string>();
        for (const o of d.orders) for (const it of o.items) {
            let i = d.lines.findIndex(l => l.drugId === it.drugId);
            if (i < 0 && it.barcode) i = d.lines.findIndex(l => !!l.barcode && l.barcode === it.barcode);
            if (i < 0) { extra.add(it.drugId); continue; }
            if (it.unitsPerPack && it.unitsPerPack !== d.lines[i].unitsPerPack) mismatch.add(i);
            sent.set(i, (sent.get(i) ?? 0) + it.quantity);
        }
        added += extra.size;
        d.lines.forEach((l, i) => {
            const packs = sent.get(i) ?? 0;
            if (packs <= 0) {
                // Another warehouse may still be pending: "removed" only once the draft is closed.
                if (d.completedAt) removed++; else notSentYet++;
                return;
            }
            orderedLines++;
            if (packs !== l.draftPacks) changedInForm++;
            if (mismatch.has(i)) { packSizeMismatch++; return; }
            const upp = l.unitsPerPack;
            units.suggested += l.suggestedUnits;
            units.sent += packs * upp;
            add(units.pageChange, l.draftUnits - l.suggestedUnits);
            units.rounding += l.draftPacks * upp - l.draftUnits;
            add(units.formChange, (packs - l.draftPacks) * upp);
            add(units.final, packs * upp - l.suggestedUnits);
        });
    }
    return {
        drafts: drafts.length, bySource, imported, ordered, completed,
        orderRate: rate(ordered, drafts.length), orderRateOfImported: rate(ordered, imported), orders,
        lines: { total, changedBeforeDraft, ordered: orderedLines, changedInForm, removed, notSentYet, added, packSizeMismatch },
        units,
        medianMinutesToFirstOrder: median(minutes),
    };
}
