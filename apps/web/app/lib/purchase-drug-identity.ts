/** Conservative identity matching: barcode alone never merges different medicines. */
export interface PurchaseDrugIdentity {
    id: string;
    barcode: string;
    tradeName: string;
    scientificName: string | null;
    organizationId: string | null;
}
const normalized = (s: string | null) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function resolvePurchaseIdentity(drug: PurchaseDrugIdentity, candidates: PurchaseDrugIdentity[]) {
    const barcode = drug.barcode.trim();
    if (!barcode) return { ids: [drug.id], globalDrugId: null, reason: 'NO_BARCODE' as const };
    const matches = candidates.filter(d => d.barcode.trim() === barcode);
    const globals = matches.filter(d => d.organizationId === null);
    const sameMedicine = matches.every(d => normalized(d.tradeName) === normalized(drug.tradeName)
        && normalized(d.scientificName) === normalized(drug.scientificName));
    if (!sameMedicine || globals.length > 1) {
        return { ids: [drug.id], globalDrugId: null, reason: 'AMBIGUOUS_BARCODE' as const };
    }
    if (globals.length !== 1) return { ids: [drug.id], globalDrugId: null, reason: 'NO_GLOBAL_MATCH' as const };
    return { ids: matches.map(d => d.id), globalDrugId: globals[0].id,
        reason: drug.organizationId === null ? 'GLOBAL' as const : 'MAPPED_BY_BARCODE' as const };
}
