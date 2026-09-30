import type { SendGroupPlan } from '@/app/lib/warehouse-order-grouping';
import type { NeedLine } from './types';

/**
 * May a new smart-purchasing draft replace the list stored for this branch?
 * Only when nothing can be lost: no stored list, or an empty one (what "بدء
 * قائمة جديدة" leaves after everything was sent). Any group (sent, pending,
 * failed or of unknown outcome), blocked line, draft line, or an unreadable
 * record keeps the refusal.
 */
export function storedListIsEmpty(raw: string | null): boolean {
    if (raw === null) return true;
    try {
        const saved = JSON.parse(raw);
        if (!saved || saved.version !== 2) return false;
        const empty = (v: unknown) => Array.isArray(v) && v.length === 0;
        return empty(saved.groups) && empty(saved.blocked) && (saved.draft === undefined || empty(saved.draft));
    } catch {
        return false;
    }
}

/** Only confirmed failures may become a new, editable request. */
export function resumeUnsentLines(groups: SendGroupPlan[], blocked: NeedLine[], originals: NeedLine[]): NeedLine[] {
    if (groups.some(g => g.status === 'UNKNOWN' || g.status === 'SENDING' || g.hasUncertainOutcome)) {
        throw new Error('يجب حسم نتيجة الإرسال قبل تعديل الأصناف.');
    }
    const remaining = groups.filter(g => g.status !== 'SENT').flatMap(g => g.lines.map(l => {
        const original = originals.find(o => o.drugId === l.drugId);
        if (original) return { ...original, quantity: l.quantity, comparison: null };
        // Older snapshots contain only order lines. Recheck prices and request a
        // fresh quote instead of treating the frozen historical price as verified.
        return {
            drugId: l.drugId, globalDrugId: l.drugId, barcode: l.barcode,
            tradeName: l.tradeName ?? l.barcode, scientificName: null, currentStock: 0,
            orderability: 'MAPPED_BY_BARCODE' as const, orderabilityReason: null,
            quantity: l.quantity, comparison: null, selectedSupplierId: null,
            manuallyChosen: false, chosenPriceAtSelection: null, unitConfirmed: false,
            manualWarehouseId: g.warehouseId, manualWarehouseName: g.warehouseName,
        };
    }));
    return [...remaining, ...blocked.map(l => ({ ...l, comparison: null }))];
}
