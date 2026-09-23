import { beforeAll, describe, expect, it } from 'vitest';
import { issueOperatorProof, verifyOperatorProof, OPERATOR_PROOF_TTL_MS } from '../operator-proof';
import { generateSyncToken } from '../sync-token';

beforeAll(() => { process.env.SYNC_TOKEN_SECRET ||= 'unit-test-sync-secret'; });
const op = { id: 'u1', branchId: 'b1', sessionVersion: 3 };

describe('operator proof (N16)', () => {
    it('verifies a proof issued for this employee, branch and session version', () => {
        expect(verifyOperatorProof(issueOperatorProof('u1', 'b1', 3), op, 'b1')).toBe('verified');
    });

    it('rejects a forged, another employee\'s, another branch\'s, or a revoked proof', () => {
        const now = Date.now();
        expect(verifyOperatorProof(`${now}.deadbeef`, op, 'b1')).toBe('invalid');
        expect(verifyOperatorProof(issueOperatorProof('u2', 'b1', 3), op, 'b1')).toBe('invalid');
        expect(verifyOperatorProof(issueOperatorProof('u1', 'b2', 3), { ...op, branchId: 'b2' }, 'b1')).toBe('invalid');
        expect(verifyOperatorProof(issueOperatorProof('u1', 'b1', 2), op, 'b1')).toBe('invalid');
        expect(verifyOperatorProof(undefined, op, 'b1')).toBe('missing');
    });

    it('measures the offline window on the server clock and refuses future-dated proofs', () => {
        const issued = Date.now() - OPERATOR_PROOF_TTL_MS - 1000;
        expect(verifyOperatorProof(issueOperatorProof('u1', 'b1', 3, null, issued), op, 'b1')).toBe('expired');
        expect(verifyOperatorProof(issueOperatorProof('u1', 'b1', 3, null, Date.now() + 3600000), op, 'b1')).toBe('invalid');
    });

    it('verifies only on the device license it was issued to', () => {
        const bound = issueOperatorProof('u1', 'b1', 3, 'device-A');
        expect(verifyOperatorProof(bound, op, 'b1', 'device-A')).toBe('verified');
        expect(verifyOperatorProof(bound, op, 'b1', 'device-B')).toBe('invalid');
        expect(verifyOperatorProof(bound, op, 'b1', null)).toBe('invalid');
        expect(verifyOperatorProof(issueOperatorProof('u1', 'b1', 3), op, 'b1', 'device-A')).toBe('invalid');
    });

    it('is domain-separated from the sync token: neither verifies as the other', () => {
        const token = generateSyncToken('u1', 'b1', 'org', 'CASHIER', 3);
        expect(verifyOperatorProof(`${Date.now()}.${token}`, op, 'b1')).toBe('invalid');
        expect(issueOperatorProof('u1', 'b1', 3).split('.')[1]).not.toBe(token);
    });
});
