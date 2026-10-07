import type { ReorderCard } from './assistant';
export function reorderFixture(): ReorderCard {
    return { kind: 'reorder', title: 'طلب الشهر', scope: { branchId: 'branch-a', branchName: 'الفرع الرئيسي', generatedAt: '2026-10-01T10:00:00Z', notes: [] }, options: { coverageDays: 10, leadDays: 2, safetyDays: 1, fromArrival: false, source: 'CUSTOM' }, totalCandidates: 2, canDraft: true, draftBlockedReason: null, links: [], lines: [
        { inventoryId: 'i1', drugId: 'd1', drugName: 'دواء', scientificName: '', barcode: '101', currentStock: 0, averageDailySales: 1.1, coverageDays: 0, pending: 0, suggestedQty: 11, unitsPerPack: 10, packs: 2, urgent: true, out: true, reasons: [], limits: [] },
        { inventoryId: 'i2', drugId: 'd2', drugName: 'عبوة غير معروفة', scientificName: '', barcode: '102', currentStock: 0, averageDailySales: 2, coverageDays: 0, pending: 0, suggestedQty: 20, unitsPerPack: null, packs: null, urgent: true, out: true, reasons: [], limits: [] },
    ] };
}
