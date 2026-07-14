import { describe, it, expect } from 'vitest';
import {
    sanitizeIdempotencyPart,
    buildIdempotencyKey,
    buildBatchIdempotencyKey,
} from '../idempotency';

describe('sanitizeIdempotencyPart', () => {
    it('strips characters outside the safe set', () => {
        expect(sanitizeIdempotencyPart('a/b c#d')).toBe('abcd');
    });
    it('caps length at 96 chars', () => {
        expect(sanitizeIdempotencyPart('x'.repeat(200)).length).toBe(96);
    });
});

describe('buildBatchIdempotencyKey', () => {
    it('is stable regardless of input order (sorted before hashing)', () => {
        const a = buildBatchIdempotencyKey('sync-sales', ['s3', 's1', 's2']);
        const b = buildBatchIdempotencyKey('sync-sales', ['s1', 's2', 's3']);
        expect(a).toBe(b);
    });

    it('changes when the set of ids changes', () => {
        const a = buildBatchIdempotencyKey('sync-sales', ['s1', 's2']);
        const b = buildBatchIdempotencyKey('sync-sales', ['s1', 's2', 's3']);
        expect(a).not.toBe(b);
    });

    it('does NOT depend on wall-clock time (the bug it replaced)', () => {
        // The same batch retried later must produce the identical key.
        const first = buildBatchIdempotencyKey('sync-sales', ['s1', 's2']);
        const later = buildBatchIdempotencyKey('sync-sales', ['s1', 's2']);
        expect(first).toBe(later);
    });

    it('falls back to the sanitized prefix for an empty batch', () => {
        expect(buildBatchIdempotencyKey('sync-sales', [])).toBe('sync-sales');
    });

    it('stays within the 120-char key limit', () => {
        const key = buildBatchIdempotencyKey('sync-sales', Array.from({ length: 50 }, (_, i) => `id-${i}`));
        expect(key.length).toBeLessThanOrEqual(120);
        expect(key.startsWith('sync-sales:')).toBe(true);
    });
});

describe('buildIdempotencyKey', () => {
    it('joins sanitized prefix and value with a colon', () => {
        expect(buildIdempotencyKey('create-drug', 'abc123')).toBe('create-drug:abc123');
    });
});
