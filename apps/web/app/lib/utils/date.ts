const TZ = "Asia/Baghdad";

export function formatDateIQ(date: Date | string): string {
    return new Date(date).toLocaleDateString("ar-IQ", { timeZone: TZ });
}

export function formatTimeIQ(date: Date | string): string {
    return new Date(date).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function formatDateTimeIQ(date: Date | string): string {
    return new Date(date).toLocaleString("ar-IQ", { timeZone: TZ });
}

export function formatDateEN(date: Date | string): string {
    return new Date(date).toLocaleDateString("en-GB", { timeZone: TZ });
}

/** Returns { year, month (1-based), day } in Iraq local time */
export function toIraqDate(date: Date | string) {
    const d = new Date(date);
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(d);
    const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value, 10);
    return { year: get("year"), month: get("month"), day: get("day") };
}

/** Today's date string (YYYY-MM-DD) in Iraq timezone */
export function todayIraq(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
