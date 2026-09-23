// Each reports page owns its cache. Never share financial responses across users
// or persist them in browser storage. Cache keys include every filter parameter.
export function createReportRequestCache(ttlMs = 60_000, fetcher: typeof fetch = fetch) {
    type Entry = { expires: number; pending: boolean; response: Promise<Response> };
    const entries = new Map<string, Entry>();
    return {
        clear() { entries.clear(); },
        async fetch(url: string): Promise<Response> {
            const existing = entries.get(url);
            if (existing && (existing.pending || existing.expires > Date.now())) {
                return (await existing.response).clone();
            }
            if (entries.size >= 40) entries.delete(entries.keys().next().value!);
            const entry: Entry = { expires: 0, pending: true, response: undefined! };
            entry.response = (async () => {
                try {
                    const response = await fetcher(url, { cache: 'no-store' });
                    // Finish reading before caching; an interrupted body must be retried.
                    if (response.ok) await response.clone().json();
                    entry.pending = false;
                    entry.expires = Date.now() + ttlMs;
                    if (!response.ok && entries.get(url) === entry) entries.delete(url);
                    return response;
                } catch (error) {
                    if (entries.get(url) === entry) entries.delete(url);
                    throw error;
                }
            })();
            entries.set(url, entry);
            return (await entry.response).clone();
        },
    };
}

export function reportDayRange(days: number, now = Date.now()) {
    const baghdad = now + 3 * 60 * 60 * 1000;
    return {
        from: new Date(baghdad - (days - 1) * 86400000).toISOString().slice(0, 10),
        to: new Date(baghdad).toISOString().slice(0, 10),
    };
}
