// Iraq is UTC+3, no DST.
const TZ = 'Asia/Baghdad';
const IRAQ_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Display date in Iraq timezone using Arabic locale.
 * Uses Intl timeZone so it is correct on any device timezone.
 */
export function formatDate(date: Date | string, options: Intl.DateTimeFormatOptions = {}): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('ar-EG', { timeZone: TZ, ...options });
}

/**
 * Display time in Iraq timezone using Arabic locale.
 * Uses Intl timeZone so it is correct on any device timezone.
 */
export function formatTime(date: Date | string, options: Intl.DateTimeFormatOptions = {}): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('ar-EG', { timeZone: TZ, ...options });
}

/**
 * YYYY-MM-DD in Iraq timezone (for day-boundary comparisons).
 * Uses manual UTC+3 shift + getUTC* instead of Intl locale 'en-CA',
 * which may be absent in Hermes. This is device-timezone-independent.
 */
export function iraqDateString(date: Date | string): string {
    const shifted = new Date(
        (typeof date === 'string' ? new Date(date) : date).getTime() + IRAQ_OFFSET_MS,
    );
    return [
        shifted.getUTCFullYear(),
        String(shifted.getUTCMonth() + 1).padStart(2, '0'),
        String(shifted.getUTCDate()).padStart(2, '0'),
    ].join('-');
}

/** Today's date as YYYY-MM-DD in Iraq timezone. */
export function todayIraq(): string {
    return iraqDateString(new Date());
}
