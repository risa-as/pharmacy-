/** Do not lose the server number if the app exits during reconciliation. */
export async function acknowledgeSales(
  db: any, sent: { id: string; invoiceNumber?: string | null }[],
  accepted: string[], numbers: Record<string, number>,
): Promise<number> {
  let count = 0;
  for (const sale of sent) {
    if (!accepted.includes(sale.id)) continue;
    // Older servers can acknowledge a duplicate without returning its number.
    // Only an already persisted number makes that acknowledgment safe.
    const number = numbers[sale.id] ?? Number(sale.invoiceNumber);
    if (!Number.isSafeInteger(number) || number <= 0) continue;
    // The server may replace a number an older build printed (not reserved for
    // this device); keep the printed one searchable as an alternative reference.
    const printed = sale.invoiceNumber && sale.invoiceNumber !== String(number) ? sale.invoiceNumber : undefined;
    await db.sale.update({ where: { id: sale.id }, data: { invoiceNumber: String(number), synced: true, ...(printed ? { printedReference: printed } : {}) } });
    count++;
  }
  return count;
}
