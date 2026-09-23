export const stocktakeReasons = [
  { value: "UNKNOWN", label: "غير معروف — يحتاج متابعة" },
  { value: "CORRECTION", label: "تصحيح رصيد" },
  { value: "UNRECORDED", label: "حركة غير مسجلة" },
  { value: "DAMAGE", label: "تلف مؤكد" },
] as const;

// Store readable classifications in the existing reason field; preserve legacy notes.
export function readStocktakeReason(reason: string | null | undefined) {
  const text = reason || "";
  for (const option of stocktakeReasons) {
    const prefix = `تصنيف الجرد: ${option.label}\n`;
    if (text.startsWith(prefix))
      return { reasonCode: option.value, reason: text.slice(prefix.length) };
  }
  return { reasonCode: "UNKNOWN", reason: text };
}
