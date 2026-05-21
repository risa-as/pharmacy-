// Iraq is UTC+3, no DST. Hermes does not reliably honour timeZone in Intl
// options, so we manually shift timestamps instead of passing { timeZone }.
const IRAQ_OFFSET_MS = 3 * 60 * 60 * 1000;

function toIraqDate(d: Date): Date {
    return new Date(d.getTime() + IRAQ_OFFSET_MS);
}

/** Format a date for display in Iraq timezone with Arabic locale. */
export function formatDate(date: Date | string, options: Intl.DateTimeFormatOptions = {}): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return toIraqDate(d).toLocaleDateString('ar-EG', options);
}

/** Format a time for display in Iraq timezone with Arabic locale. */
export function formatTime(date: Date | string, options: Intl.DateTimeFormatOptions = {}): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return toIraqDate(d).toLocaleTimeString('ar-EG', options);
}

/**
 * Return an ISO date string (YYYY-MM-DD) for the given timestamp in Iraq
 * timezone. Uses UTC methods on the shifted date so device timezone is
 * irrelevant. This is the correct comparison key for day-boundary filters.
 */
export function iraqDateString(date: Date | string): string {
    const shifted = toIraqDate(typeof date === 'string' ? new Date(date) : date);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const d = String(shifted.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** ISO date string (YYYY-MM-DD) for today in Iraq timezone. */
export function todayIraq(): string {
    return iraqDateString(new Date());
}
