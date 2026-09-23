/** Reject ambiguous snapshots before the local barcode reconciliation deletes rows. */
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
