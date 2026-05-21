const TZ = 'Asia/Baghdad'; // UTC+3, no DST

/** Format a date for display in Iraq timezone with Arabic locale. */
export function formatDate(date: Date | string, options: Intl.DateTimeFormatOptions = {}): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('ar-EG', { timeZone: TZ, ...options });
}

/** Format a time for display in Iraq timezone with Arabic locale. */
export function formatTime(date: Date | string, options: Intl.DateTimeFormatOptions = {}): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('ar-EG', { timeZone: TZ, ...options });
}

/**
 * Return an ISO date string (YYYY-MM-DD) for the given date in Iraq timezone.
 * Use this instead of toDateString() for day-boundary comparisons.
 */
export function iraqDateString(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-CA', { timeZone: TZ }); // en-CA gives YYYY-MM-DD
}

/** ISO date string for today in Iraq timezone. */
export function todayIraq(): string {
    return iraqDateString(new Date());
}
