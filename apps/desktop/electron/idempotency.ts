/**
 * Idempotency key helpers for desktop → cloud sync.
 *
 * Extracted into their own pure module (no electron/prisma imports) so they can
 * be unit-tested in isolation and reused across sync routines.
 */
import crypto from 'node:crypto';

export function sanitizeIdempotencyPart(value: string): string {
    return value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96);
}

export function buildIdempotencyKey(prefix: string, value: string): string {
    const safePrefix = sanitizeIdempotencyPart(prefix);
    const safeValue = sanitizeIdempotencyPart(value);
    return `${safePrefix}:${safeValue}`.slice(0, 120);
}

/**
 * Stable idempotency key for a *batch* of records: derived from the sorted
 * record IDs, so a retry of the exact same batch reuses the same key (unlike a
 * Date.now()-based key, which changes every call and defeats deduplication if
 * the server ever honours the header). Empty batches fall back to the prefix.
 */
export function buildBatchIdempotencyKey(prefix: string, ids: string[]): string {
    if (ids.length === 0) return sanitizeIdempotencyPart(prefix);
    const digest = crypto
        .createHash('sha256')
        .update([...ids].sort().join('|'))
        .digest('hex')
        .slice(0, 32);
    return buildIdempotencyKey(prefix, digest);
}
