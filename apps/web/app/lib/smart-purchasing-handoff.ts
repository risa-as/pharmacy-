/**
 * Handoff of a reviewed purchase draft to the warehouse-order form
 * (/dashboard/purchases/warehouse-orders/new, NeedListClient). Shared by the
 * smart purchasing page and the AI purchase assistant so the format and the
 * storage key cannot drift. The draft is never sent: the form opens it for the
 * user to review, price and approve.
 */

export const HANDOFF_VERSION = 1;
export const MAX_HANDOFF_LINES = 500;

export const handoffKey = (userId: string, organizationId: string) => `smart-purchasing-handoff:${userId}:${organizationId}`;

export interface HandoffSource {
    drugId: string;
    tradeName: string;
    barcode: string;
    scientificName: string;
    currentStock: number;
    /** Suggested quantity in inventory units. */
    units: number;
    /** Confirmed units per pack (required: orders are placed in packs). */
    unitsPerPack: number | null;
}

export interface Handoff {
    version: typeof HANDOFF_VERSION;
    /** OPEN-14: the registered purchase draft (absent when it could not be recorded, or in older handoffs). */
    draftId?: string;
    branchId: string;
    generatedAt: string;
    lines: { drugId: string; tradeName: string; barcode: string; scientificName: string; currentStock: number; quantity: number; unitsPerPack: number }[];
}

/** Builds the draft; throws with an Arabic reason when it cannot be a valid draft. */
export function buildHandoff(branchId: string, generatedAt: string, sources: HandoffSource[], draftId?: string | null): Handoff {
    if (!branchId) throw new Error('حدد الفرع أولاً');
    if (!sources.length) throw new Error('لا توجد أصناف في المسودة');
    if (sources.length > MAX_HANDOFF_LINES) throw new Error(`الحد الأقصى ${MAX_HANDOFF_LINES} صنف في المسودة`);
    const missing = sources.filter(s => !s.unitsPerPack || s.unitsPerPack <= 0);
    if (missing.length) throw new Error(`عدد الوحدات في العبوة غير مؤكد لـ: ${missing.slice(0, 5).map(s => s.tradeName).join('، ')}`);
    return {
        version: HANDOFF_VERSION,
        ...(draftId ? { draftId } : {}),
        branchId,
        generatedAt,
        lines: sources.map(s => ({
            drugId: s.drugId, tradeName: s.tradeName, barcode: s.barcode, scientificName: s.scientificName,
            currentStock: s.currentStock,
            quantity: Math.ceil(s.units / s.unitsPerPack!),
            unitsPerPack: s.unitsPerPack!,
        })),
    };
}

/** Stores the draft for the order form; false when the browser cannot store it. */
export function saveHandoff(userId: string, organizationId: string, handoff: Handoff, storage: Pick<Storage, 'setItem'> = sessionStorage): boolean {
    try { storage.setItem(handoffKey(userId, organizationId), JSON.stringify(handoff)); return true; } catch { return false; }
}
