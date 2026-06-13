import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { generateSyncToken } from '../sync-token';

// The sync token is the desktop's stateless auth to the cloud sync API. It must
// be deterministic (so the server can recompute and compare) and must refuse to
// exist without a secret (a hardcoded fallback would be a full tenant-auth bypass).

describe('generateSyncToken', () => {
    const ORIGINAL = process.env.SYNC_TOKEN_SECRET;

    beforeEach(() => {
        process.env.SYNC_TOKEN_SECRET = 'unit-test-secret';
    });
    afterEach(() => {
        if (ORIGINAL === undefined) delete process.env.SYNC_TOKEN_SECRET;
        else process.env.SYNC_TOKEN_SECRET = ORIGINAL;
    });

    it('is deterministic for identical inputs', () => {
        const a = generateSyncToken('u1', 'b1', 'o1', 'ADMIN');
        const b = generateSyncToken('u1', 'b1', 'o1', 'ADMIN');
        expect(a).toBe(b);
    });

    it('changes when any field changes (role is part of the signature)', () => {
        const admin = generateSyncToken('u1', 'b1', 'o1', 'ADMIN');
        const cashier = generateSyncToken('u1', 'b1', 'o1', 'CASHIER');
        expect(admin).not.toBe(cashier);
    });

    it('matches an independent HMAC of the same payload (server can verify)', () => {
        const expected = crypto
            .createHmac('sha256', 'unit-test-secret')
            .update('u1:b1:o1:ADMIN')
            .digest('hex');
        expect(generateSyncToken('u1', 'b1', 'o1', 'ADMIN')).toBe(expected);
    });

    it('throws rather than issue a forgeable token when the secret is missing', () => {
        delete process.env.SYNC_TOKEN_SECRET;
        expect(() => generateSyncToken('u', 'b', 'o', 'ADMIN')).toThrow();
    });
});
