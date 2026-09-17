/**
 * Normalizes and sanity-checks an expiry date ("YYYY-MM-DD").
 * Employees frequently type "27" for the year instead of "2027" — the native
 * date input happily stores year 0027, which then shows the batch as expired.
 * Mirrors apps/web/app/ui/inventory/expiry-date-field.tsx.
 */
export function checkExpiry(raw: string | null | undefined): {
    value: string;
    corrected: boolean;
    warning: string | null;
    severity: "error" | "warning" | null;
} {
    const value = (raw ?? "").toString().trim();
    if (!value) return { value: "", corrected: false, warning: null, severity: null };

    const m = value.match(/^(\d{1,4})-(\d{2}-\d{2})$/);
    if (!m) return { value, corrected: false, warning: null, severity: null };

    let year = parseInt(m[1], 10);
    let corrected = false;

    // "27" → 2027; a 3-digit year is a missing-digit typo → best-effort 20xx
    if (year >= 1 && year < 100) {
        year = 2000 + year;
        corrected = true;
    } else if (year >= 100 && year < 1000) {
        year = 2000 + (year % 100);
        corrected = true;
    }

    const fixed = `${year}-${m[2]}`;

    let warning: string | null = null;
    let severity: "error" | "warning" | null = null;
    const parsed = new Date(`${fixed}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!isNaN(parsed.getTime())) {
        if (parsed < today) {
            warning =
                `تاريخ الانتهاء المدخل (${fixed}) منتهي بالفعل!\n` +
                `تأكد من السنة — هل تقصد ${today.getFullYear() + 1} بدلاً من ${year}؟`;
            severity = "error";
        } else if (year > today.getFullYear() + 15) {
            warning =
                `تاريخ الانتهاء المدخل (${fixed}) بعيد جداً (أكثر من 15 سنة).\n` +
                `تأكد من صحة السنة.`;
            severity = "warning";
        }
    }

    return { value: fixed, corrected, warning, severity };
}
