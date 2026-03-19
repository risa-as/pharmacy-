import { NextResponse } from 'next/server';

/**
 * Wraps a NextResponse with cache-control headers.
 *
 * Usage in API routes:
 *   return withCache(NextResponse.json(data), 60); // cache for 60 seconds
 */
export function withCache(response: NextResponse, maxAgeSeconds: number): NextResponse {
    response.headers.set(
        'Cache-Control',
        `public, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 2}`
    );
    return response;
}

/**
 * Standard cache durations (in seconds)
 */
export const CACHE = {
    NONE:    0,
    SHORT:   30,    // stats, alerts — refreshes every 30s
    MEDIUM:  300,   // branches, suppliers — refreshes every 5 min
    LONG:    3600,  // drugs catalog — refreshes every hour
} as const;
