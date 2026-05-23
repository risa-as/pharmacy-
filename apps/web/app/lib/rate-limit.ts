import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Distributed rate limiter (Upstash Redis) with in-memory fallback.
//
// When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set the limiter
// uses a sliding-window backed by Upstash Redis — counters are shared across
// every serverless instance, making the limit a true global guarantee.
//
// Without those vars (local dev, CI, or before Upstash is configured) it falls
// back to a per-process fixed-window map.  That is best-effort on serverless
// (each cold-start resets counters) but still protects single-instance deploys.
// ─────────────────────────────────────────────────────────────────────────────

// ── Upstash (lazy-initialised once per process) ───────────────────────────────

let _upstashReady: boolean | null = null;
let _Ratelimit: any = null;
let _Redis: any = null;
let _redis: any = null;

async function tryLoadUpstash(): Promise<boolean> {
    if (_upstashReady !== null) return _upstashReady;
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
        _upstashReady = false;
        return false;
    }
    try {
        const [rl, redis] = await Promise.all([
            import('@upstash/ratelimit'),
            import('@upstash/redis'),
        ]);
        _Ratelimit = rl.Ratelimit;
        _Redis     = redis.Redis;
        _redis     = _Redis.fromEnv();
        _upstashReady = true;
        return true;
    } catch {
        _upstashReady = false;
        return false;
    }
}

// Cache one Ratelimit instance per (routeId, limit, windowMs) combination.
const _instanceCache = new Map<string, any>();

async function getUpstashLimiter(routeId: string, limit: number, windowMs: number): Promise<any | null> {
    if (!(await tryLoadUpstash())) return null;
    const cacheKey = `${routeId}:${limit}:${windowMs}`;
    if (!_instanceCache.has(cacheKey)) {
        const seconds = Math.max(1, Math.ceil(windowMs / 1000));
        _instanceCache.set(cacheKey, new _Ratelimit({
            redis:   _redis,
            limiter: _Ratelimit.slidingWindow(limit, `${seconds} s`),
            prefix:  `rl:${routeId}`,
        }));
    }
    return _instanceCache.get(cacheKey);
}

// ── In-memory fallback ────────────────────────────────────────────────────────

interface Bucket { count: number; resetAt: number; }
const _buckets = new Map<string, Bucket>();
let _lastSweep = 0;

function inMemoryCheck(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    if (now - _lastSweep > 60_000) {
        _lastSweep = now;
        _buckets.forEach((b, k) => { if (b.resetAt <= now) _buckets.delete(k); });
    }
    const bucket = _buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
        _buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSec: 0 };
    }
    bucket.count++;
    if (bucket.count > limit) {
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
    }
    return { allowed: true, retryAfterSec: 0 };
}

// ── Public helpers ────────────────────────────────────────────────────────────

export function getClientIp(req: Request): string {
    const fwd = (req.headers as Headers).get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
    return (req.headers as Headers).get('x-real-ip') ?? 'unknown';
}

/**
 * Async rate-limit guard for route handlers.
 * Returns a 429 NextResponse when over the limit, or null when the request
 * may proceed.
 *
 * Uses Upstash Redis (distributed, shared across all serverless instances)
 * when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.
 * Falls back to a per-process in-memory map otherwise.
 */
export async function enforceRateLimit(
    req: Request,
    routeId: string,
    limit: number,
    windowMs: number,
): Promise<NextResponse | null> {
    const ip  = getClientIp(req);
    const key = `${routeId}:${ip}`;

    const upstash = await getUpstashLimiter(routeId, limit, windowMs);
    if (upstash) {
        const { success, reset } = await upstash.limit(ip);
        if (!success) {
            const retryAfter = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : 60;
            return NextResponse.json(
                { error: 'عدد كبير جدًا من المحاولات. يرجى المحاولة لاحقًا.', code: 'RATE_LIMITED' },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
        }
        return null;
    }

    // In-memory fallback
    const { allowed, retryAfterSec } = inMemoryCheck(key, limit, windowMs);
    if (!allowed) {
        return NextResponse.json(
            { error: 'عدد كبير جدًا من المحاولات. يرجى المحاولة لاحقًا.', code: 'RATE_LIMITED' },
            { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
        );
    }
    return null;
}
