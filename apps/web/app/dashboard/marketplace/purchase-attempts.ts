/**
 * Client side of marketplace purchase attempts (N15-R2/R3).
 *
 * An attempt is ONE explicit purchase intent with a stable idempotency key. It
 * is created only by an explicit "buy" (a second identical purchase is a new
 * attempt) and is reused by "retry" / "check". It stays pending until the
 * SERVER declares the outcome settled (succeeded, or rejected without
 * execution); a 401/403/5xx/network error/unreadable reply never settles it.
 *
 * Storage: one localStorage entry PER ATTEMPT (no shared list), keyed by user,
 * so two tabs adding attempts at the same moment cannot overwrite each other,
 * and another user on the same browser never sees or resends them. The buying
 * organization and branch are pinned when the attempt is created and sent
 * explicitly, so a later change of the user's branch never silently re-targets
 * an attempt.
 */

export interface PurchaseAttempt {
    key: string;
    listingId: string;
    quantity: number;
    label: string;
    createdAt: string;
    organizationId: string | null;
    branchId: string;
}

export type PendingReason = 'processing' | 'unknown' | 'auth' | 'scope' | 'server' | 'network';

export type AttemptOutcome =
    | { kind: 'succeeded'; order: any }
    | { kind: 'rejected'; error: string }
    | { kind: 'pending'; reason: PendingReason };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const PREFIX = 'marketplace-attempt:v2:';
const entryKey = (userId: string, key: string) => `${PREFIX}${userId}:${key}`;

function safeStorage(): StorageLike | null {
    try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export function loadAttempts(userId: string, store: StorageLike | null = safeStorage()): PurchaseAttempt[] {
    if (!store) return [];
    const mine = `${PREFIX}${userId}:`;
    const out: PurchaseAttempt[] = [];
    try {
        for (let i = 0; i < store.length; i++) {
            const k = store.key(i);
            if (!k?.startsWith(mine)) continue;
            try { const a = JSON.parse(store.getItem(k) || 'null'); if (a?.key) out.push(a); } catch { /* skip corrupt entry */ }
        }
    } catch { return []; }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Persists one attempt in its own entry and confirms it by reading it back.
 * Returns false when storage is unavailable or full, so the caller can warn
 * before sending instead of silently losing the key on a reload.
 */
export function addAttempt(userId: string, attempt: PurchaseAttempt, store: StorageLike | null = safeStorage()): boolean {
    if (!store) return false;
    try {
        const k = entryKey(userId, attempt.key);
        store.setItem(k, JSON.stringify(attempt));
        return JSON.parse(store.getItem(k) || 'null')?.key === attempt.key;
    } catch { return false; }
}

export function removeAttempt(userId: string, key: string, store: StorageLike | null = safeStorage()) {
    try { store?.removeItem(entryKey(userId, key)); } catch { /* unavailable */ }
}

export const isAttemptStorageKey = (k: string | null) => !!k?.startsWith(PREFIX);

/** Classifies a POST or status reply. Only the server's `settled` flag settles. */
export function classifyReply(httpStatus: number | null, body: any): AttemptOutcome {
    if (httpStatus === null) return { kind: 'pending', reason: 'network' };
    if (body?.settled === true && body?.status === 'SUCCEEDED') return { kind: 'succeeded', order: body.order };
    if (body?.settled === true && body?.status === 'REJECTED') return { kind: 'rejected', error: String(body.error ?? '') };
    if (httpStatus === 202 || body?.status === 'PROCESSING') return { kind: 'pending', reason: 'processing' };
    if (httpStatus === 404 && body?.status === 'UNKNOWN') return { kind: 'pending', reason: 'unknown' };
    if (httpStatus === 403 && body?.error === 'Branch not in scope') return { kind: 'pending', reason: 'scope' };
    if (httpStatus === 401 || httpStatus === 403) return { kind: 'pending', reason: 'auth' };
    return { kind: 'pending', reason: 'server' };
}

/**
 * After a status check, whether "retry" should resend the SAME attempt. Both
 * UNKNOWN (never received) and PROCESSING are resent: the server decides —
 * a live attempt answers 202 again, an abandoned one (the request died between
 * claiming and executing) is taken over and executed once.
 */
export const shouldResend = (outcome: AttemptOutcome) =>
    outcome.kind === 'pending' && (outcome.reason === 'unknown' || outcome.reason === 'processing');

/**
 * Runs `fn` while holding a cross-tab lock for this attempt key, so two tabs
 * never send or check the same attempt at the same moment. Falls back to a
 * direct call where the Web Locks API is unavailable (the server still refuses
 * a second execution of the same key).
 */
export async function withAttemptLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;
    if (!locks?.request) return fn();
    return locks.request(`marketplace-attempt:${key}`, fn);
}

async function readReply(res: Response): Promise<AttemptOutcome> {
    const body = await res.json().catch(() => null);
    return classifyReply(res.status, body);
}

export async function sendAttempt(attempt: PurchaseAttempt): Promise<AttemptOutcome> {
    return withAttemptLock(attempt.key, async () => {
        try {
            const res = await fetch('/api/marketplace/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // The pinned branch is sent explicitly; the server refuses it if
                // it is no longer in the user's scope instead of switching branch.
                body: JSON.stringify({ listingId: attempt.listingId, quantity: attempt.quantity, branchId: attempt.branchId, idempotencyKey: attempt.key }),
            });
            return await readReply(res);
        } catch { return { kind: 'pending', reason: 'network' }; }
    });
}

export async function checkAttempt(key: string): Promise<AttemptOutcome> {
    return withAttemptLock(key, async () => {
        try {
            return await readReply(await fetch(`/api/marketplace/orders/attempts/${encodeURIComponent(key)}`, { cache: 'no-store' }));
        } catch { return { kind: 'pending', reason: 'network' }; }
    });
}
