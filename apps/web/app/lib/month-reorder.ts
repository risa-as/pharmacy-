import { baghdadDate, dateStart } from './smart-purchasing';

/** Narrow purchase intent; explicit expiry requests are not interpreted as stockouts. */
export function monthlyStockoutRequest(message: string): { coverageDays?: number } | null {
    const text = message.replace(/[ً-ْٰـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
        .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    if (/صلاحي|الشهر الماضي/.test(text)) return null;
    if (!/اطلب|نطلب|بطلب|طلب|اشتري|شراء|جهز/.test(text)
        || !/نافد|ناڤد|نفد|نفذ|خلص|منتهي/.test(text)
        || !/هذا الشهر|هالشهر|الشهر الحالي/.test(text)) return null;
    const days = text.match(/(?:تكفي|تغطيه|لمده|لـ?)?\s*([-+]?\d+(?:[.,]\d+)?)\s*(?:ايام|يوما|يوم)/);
    const coverageDays = days ? Number(days[1].replace(',', '.')) : /اسبوعين/.test(text) ? 14 : undefined;
    return { coverageDays };
}

/** Includes sales up to now; denominator is calendar days including the partial current day. */
export function currentMonthPeriod(now: Date) {
    const to = baghdadDate(now);
    const from = to.slice(0, 8) + '01';
    return { from, to, start: dateStart(from), end: now, days: Number(to.slice(8, 10)) };
}
