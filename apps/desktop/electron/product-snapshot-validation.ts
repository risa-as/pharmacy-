/** Identify ambiguous identities without preventing unrelated stock updates. */
export function snapshotBarcodeConflicts(drugs: { id?: string; barcode?: string | null }[]) {
  const groups = new Map<string, Set<string>>();
  for (const drug of drugs) {
    if (!drug.id) continue;
    const barcode = String(drug.barcode ?? `NOBARCODE_${drug.id}`);
    const ids = groups.get(barcode) ?? new Set<string>();
    ids.add(drug.id);
    groups.set(barcode, ids);
  }
  return new Map([...groups].filter(([, ids]) => ids.size > 1));
}

export function preserveConflictingInventory(
  row: { drugId: string }, protectedDrugIds: ReadonlySet<string>,
) { return protectedDrugIds.has(row.drugId); }

/** Retained for callers that require an entirely unambiguous snapshot. */
export function validateSnapshotBarcodes(
  drugs: { id?: string; barcode?: string | null }[],
) {
  const seen = new Map<string, string>();
  for (const drug of drugs) {
    if (!drug.id) continue;
    const barcode = String(drug.barcode ?? `NOBARCODE_${drug.id}`);
    const previous = seen.get(barcode);
    if (previous && previous !== drug.id)
      throw Error(
        `توقفت مزامنة المخزون لحماية البيانات: الباركود ${barcode} مرتبط بمعرفَي دواء مختلفين في الخادم. يلزم تصحيح بيانات المصدر؛ لم يُستبدل المخزون المحلي.`,
      );
    seen.set(barcode, drug.id);
  }
}
