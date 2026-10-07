// In-memory page cache for the desktop renderer (stale-while-revalidate).
//
// Pages unmount on every navigation (App.tsx renders only the current page), so
// each visit used to start empty and wait for the main process. With this cache a
// page shows what it last loaded at once and refreshes in the background.
//
// Isolation: entries are keyed by user + branch + page (+ parameters), the whole
// cache is cleared on logout / user switch, and a refresh result is accepted only
// if it was started for the key that is still current — a late answer for another
// user, branch or search never replaces what is on screen.
// Memory only (never localStorage): nothing survives the process or a logout.

const entries = new Map<string, { value: unknown; at: number }>();
let generation = 0;
// Latest refresh started per key: an older answer for the same key arriving
// after a newer one must never be stored or shown.
const latestRequest = new Map<string, number>();
let requestCounter = 0;

export function cacheKey(userId: string | null | undefined, branchId: string | null | undefined, page: string, params: unknown = null) {
    return JSON.stringify([userId ?? '', branchId ?? '', page, params]);
}

export function readCache<T>(key: string): { value: T; at: number } | undefined {
    return entries.get(key) as { value: T; at: number } | undefined;
}

export function writeCache<T>(key: string, value: T, now = Date.now()) {
    entries.set(key, { value, at: now });
}

/** Logout or user switch: drop everything, and invalidate refreshes still in flight. */
export function clearPageCache() {
    entries.clear();
    latestRequest.clear();
    generation++;
}

/**
 * Starts a background refresh for `key`. `isCurrent` says whether the page still
 * shows that key when the answer arrives; the answer is stored and applied only
 * then, never after a clearPageCache() that happened meanwhile, and never when a
 * newer refresh of the same key was started after it (out-of-order answers).
 * A failed load stores nothing: the last good value stays.
 */
export async function revalidate<T>(key: string, load: () => Promise<T>, isCurrent: (key: string) => boolean, apply: (value: T) => void): Promise<'applied' | 'stale' | 'failed'> {
    const started = generation;
    const request = ++requestCounter;
    latestRequest.set(key, request);
    let value: T;
    try {
        value = await load();
    } catch {
        // An older request failing after a newer one started says nothing about what is shown.
        if (started !== generation || latestRequest.get(key) !== request) return 'stale';
        return 'failed';
    }
    if (started !== generation || latestRequest.get(key) !== request) return 'stale';
    writeCache(key, value);
    if (!isCurrent(key)) return 'stale';
    apply(value);
    return 'applied';
}

export function cacheSize() {
    return entries.size;
}
