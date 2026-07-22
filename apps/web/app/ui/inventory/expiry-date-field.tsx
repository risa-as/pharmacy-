"use client";

import { useState } from "react";

/**
 * Normalizes and sanity-checks an expiry date from a form.
 * Employees frequently type "27" for the year instead of "2027" — the native
 * date input happily stores year 0027, which then shows the batch as expired.
 */
export function checkExpiry(raw: string | null | undefined): {
    value: string;
    corrected: boolean;
    warning: string | null;
    severity: "danger" | "warning" | null;
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
    let severity: "danger" | "warning" | null = null;
    const parsed = new Date(`${fixed}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!isNaN(parsed.getTime())) {
        if (parsed < today) {
            warning =
                `تاريخ الانتهاء المدخل (${fixed}) منتهي بالفعل!\n` +
                `تأكد من السنة — هل تقصد ${today.getFullYear() + 1} بدلاً من ${year}؟`;
            severity = "danger";
        } else if (year > today.getFullYear() + 15) {
            warning =
                `تاريخ الانتهاء المدخل (${fixed}) بعيد جداً (أكثر من 15 سنة).\n` +
                `تأكد من صحة السنة.`;
            severity = "warning";
        }
    }

    return { value: fixed, corrected, warning, severity };
}

/**
 * Date input that auto-corrects 2-digit years on blur ("27" → "2027")
 * and shows inline warnings for expired / implausible dates.
 */
export default function ExpiryDateField({
    name = "expiryDate",
    required = false,
}: {
    name?: string;
    required?: boolean;
}) {
    const [value, setValue] = useState("");
    const [correctedTo, setCorrectedTo] = useState<string | null>(null);

    const handleBlur = () => {
        if (!value) {
            setCorrectedTo(null);
            return;
        }
        const res = checkExpiry(value);
        if (res.corrected) {
            setValue(res.value);
            setCorrectedTo(res.value.slice(0, 4));
        }
    };

    const year = parseInt(value.slice(0, 4), 10) || 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const parsed = value ? new Date(`${value}T00:00:00`) : null;
    // Only warn once a full 4-digit year is typed — avoids noise mid-typing.
    const isPast = !!parsed && !isNaN(parsed.getTime()) && year >= 1000 && parsed < today;
    const isFar = year > today.getFullYear() + 15;

    return (
        <div>
            <input
                type="date"
                name={name}
                required={required}
                value={value}
                onChange={(e) => {
                    setValue(e.target.value);
                    setCorrectedTo(null);
                }}
                onBlur={handleBlur}
                className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
            />
            {correctedTo && (
                <p className="text-xs font-bold text-primary mt-1 flex items-center gap-1">
                    <span>✓</span> تم تصحيح السنة تلقائياً إلى {correctedTo}
                </p>
            )}
            {isPast && (
                <p className="text-xs font-bold text-destructive mt-1 flex items-center gap-1">
                    <span>⚠</span> هذا التاريخ منتهي بالفعل — تأكد من السنة (2027 وليس 27)
                </p>
            )}
            {!isPast && isFar && (
                <p className="text-xs font-bold text-warning mt-1 flex items-center gap-1">
                    <span>⚠</span> السنة تبدو بعيدة جداً — تأكد من صحتها
                </p>
            )}
        </div>
    );
}
