/** Narrow purchase intent; explicit expiry requests are not interpreted as stockouts. */
export function monthlyStockoutRequest(message: string): { coverageDays?: number } | null {
    const text = message.replace(/[ً-ْٰـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
        .replace(/[٠-٩۰-۹]/g, d => String('٠١٢٣٤٥٦٧٨٩'.includes(d) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(d) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    if (/صلاحي|الشهر الماضي/.test(text)) return null;
    if (!/اطلب|نطلب|بطلب|طلب|اشتري|شراء|جهز/.test(text)
        || !/نافد|ناڤد|نفد|نفذ|خلص|منتهي/.test(text)
        || !/هذا الشهر|هالشهر|الشهر الحالي/.test(text)) return null;
    const days = text.match(/(?:تكفي|تغطيه|لمده|لـ?)?\s*([-+]?\d+(?:[.,]\d+)?)\s*(?:ايام|يوما|يوم)/);
    const coverageDays = days ? Number(days[1].replace(',', '.')) : /اسبوعين/.test(text) ? 14 : undefined;
    return { coverageDays };
}
