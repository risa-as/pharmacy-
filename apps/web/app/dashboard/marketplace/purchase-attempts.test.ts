import { describe, expect, it } from 'vitest';
import { classifyReply, loadAttempts, addAttempt, removeAttempt, shouldResend, PurchaseAttempt } from './purchase-attempts';

// Minimal Storage: two "tabs" of one browser share the same instance.
const memory = () => {
    const m = new Map<string, string>();
    return {
        getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); },
        removeItem: (k: string) => { m.delete(k); }, key: (i: number) => [...m.keys()][i] ?? null,
        get length() { return m.size; },
    };
};
const attempt = (key: string, createdAt = '2026-09-23T10:00:00Z'): PurchaseAttempt =>
    ({ key, listingId: 'l1', quantity: 1, label: 'x', createdAt, organizationId: 'orgA', branchId: 'branch-a' });

describe('purchase attempts: only the server settles an attempt', () => {
    it('settles on the server\'s explicit outcome only', () => {
        expect(classifyReply(201, { settled: true, status: 'SUCCEEDED', order: { id: 'o' } })).toEqual({ kind: 'succeeded', order: { id: 'o' } });
        expect(classifyReply(409, { settled: true, status: 'REJECTED', error: 'Not enough stock' })).toEqual({ kind: 'rejected', error: 'Not enough stock' });
    });

    it('keeps the attempt pending for every unknown outcome, including plain 4xx', () => {
        expect(classifyReply(null, null)).toMatchObject({ kind: 'pending', reason: 'network' });
        expect(classifyReply(401, { error: 'Unauthorized' })).toMatchObject({ kind: 'pending', reason: 'auth' });
        expect(classifyReply(403, { error: 'Branch not in scope' })).toMatchObject({ kind: 'pending', reason: 'scope' });
        expect(classifyReply(202, { status: 'PROCESSING', settled: false })).toMatchObject({ kind: 'pending', reason: 'processing' });
        expect(classifyReply(404, { status: 'UNKNOWN', settled: false })).toMatchObject({ kind: 'pending', reason: 'unknown' });
        expect(classifyReply(502, null)).toMatchObject({ kind: 'pending', reason: 'server' });
        expect(classifyReply(409, { error: 'Idempotency key reused for a different request' })).toMatchObject({ kind: 'pending' });
    });

    it('resends the SAME attempt when the server never got it or still shows it PROCESSING (it decides takeover)', () => {
        expect(shouldResend({ kind: 'pending', reason: 'unknown' })).toBe(true);
        expect(shouldResend({ kind: 'pending', reason: 'processing' })).toBe(true);
        for (const reason of ['auth', 'scope', 'server', 'network'] as const) expect(shouldResend({ kind: 'pending', reason })).toBe(false);
        expect(shouldResend({ kind: 'succeeded', order: {} })).toBe(false);
    });
});

describe('purchase attempts: storage', () => {
    it('two tabs adding attempts at the same moment both keep theirs (one entry per attempt, no shared list)', () => {
        const store = memory();
        // Both tabs read "no attempts", then each adds its own: nothing is overwritten.
        const seenByTab1 = loadAttempts('u', store), seenByTab2 = loadAttempts('u', store);
        expect([seenByTab1, seenByTab2]).toEqual([[], []]);
        expect(addAttempt('u', attempt('k1', '2026-09-23T10:00:00Z'), store)).toBe(true);
        expect(addAttempt('u', attempt('k2', '2026-09-23T10:00:01Z'), store)).toBe(true);
        expect(loadAttempts('u', store).map(a => a.key)).toEqual(['k1', 'k2']);
        removeAttempt('u', 'k1', store);
        expect(loadAttempts('u', store).map(a => a.key)).toEqual(['k2']);
    });

    it('keeps each user\'s attempts separate and pins the buying branch', () => {
        const store = memory();
        addAttempt('user-a', attempt('k1'), store);
        expect(loadAttempts('user-b', store)).toEqual([]);
        expect(loadAttempts('user-a', store)[0]).toMatchObject({ organizationId: 'orgA', branchId: 'branch-a' });
    });

    it('reports a failed save (unavailable, full, or not persisted) instead of hiding it', () => {
        expect(addAttempt('u', attempt('k'), null)).toBe(false);
        const full = { ...memory(), setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); } };
        expect(addAttempt('u', attempt('k'), full as any)).toBe(false);
        const dropsWrites = { ...memory(), setItem: () => { /* silently not stored */ } };
        expect(addAttempt('u', attempt('k'), dropsWrites as any)).toBe(false);
        const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => {}, removeItem: () => {}, key: () => null, length: 1 };
        expect(loadAttempts('u', broken as any)).toEqual([]);
    });
});
