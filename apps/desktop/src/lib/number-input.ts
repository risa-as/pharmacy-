// Thousands separators while typing an amount (pure, unit-tested).
// The field shows "1,596,050"; the state keeps the raw "1596050", so every
// calculation (difference, closing the shift) reads a plain number.

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Raw value from what was typed: digits (Arabic/Persian ones converted) and at most one decimal point. */
export function rawAmount(typed: string): string {
    let out = '';
    let dot = false;
    for (const ch of typed) {
        const a = ARABIC_DIGITS.indexOf(ch), p = PERSIAN_DIGITS.indexOf(ch);
        if (ch >= '0' && ch <= '9') out += ch;
        else if (a >= 0) out += String(a);
        else if (p >= 0) out += String(p);
        else if ((ch === '.' || ch === '٫') && !dot) { out += '.'; dot = true; }
    }
    return out;
}

/** "1596050.5" → "1,596,050.5" (the raw value is never rounded). */
export function groupAmount(raw: string): string {
    if (!raw) return '';
    const [int, frac] = raw.split('.');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return frac === undefined ? grouped : `${grouped}.${frac}`;
}

/**
 * Where the caret goes after re-formatting: after the same number of digits
 * (and decimal point) that were before it, so adding a comma never moves it.
 */
export function caretAfterFormat(typed: string, caret: number, formatted: string): number {
    const meaningful = rawAmount(typed.slice(0, caret)).length;
    if (meaningful === 0) return 0;
    let seen = 0;
    for (let i = 0; i < formatted.length; i++) {
        if (formatted[i] !== ',') seen++;
        if (seen === meaningful) return i + 1;
    }
    return formatted.length;
}
