import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { importSPKI, jwtVerify, decodeJwt } from 'jose';

// `server-only` throws outside a React Server Component graph; stub it so the
// module under test can be imported by the node-environment runner.
vi.mock('server-only', () => ({}));

const { signOfflineLicense } = await import('../offline-license');

// Offline license codes are verified entirely on the customer's machine, so the
// expiry lives inside the signed JWT. The `plan` claim and the `exp` claim must
// therefore always agree — a token claiming PERPETUAL while carrying an `exp`
// would render as "دائم" in the admin table while dying on the customer's device.

let publicPem: string;

beforeAll(() => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    publicPem = publicKey;
    process.env.OFFLINE_LICENSE_PRIVATE_KEY_B64 = Buffer.from(privateKey).toString('base64');
});

const base = { hardwareId: 'HW-TEST-0001', pharmacyName: 'صيدلية الاختبار' };

async function verify(code: string) {
    const key = await importSPKI(publicPem, 'RS256');
    const { payload } = await jwtVerify(code, key);
    return payload;
}

describe('signOfflineLicense', () => {
    it('signs a perpetual code with no exp', async () => {
        const res = await signOfflineLicense({ ...base });
        const payload = await verify(res.code);

        expect(res.plan).toBe('PERPETUAL');
        expect(res.expiresAt).toBeNull();
        expect(payload.plan).toBe('PERPETUAL');
        expect(payload.exp).toBeUndefined();
        expect(payload.hw).toBe(base.hardwareId);
    });

    it('signs a relative expiryDays code as ANNUAL', async () => {
        const res = await signOfflineLicense({ ...base, expiryDays: 365 });
        const payload = await verify(res.code);

        expect(res.plan).toBe('ANNUAL');
        expect(payload.plan).toBe('ANNUAL');
        expect(payload.exp).toBeDefined();
    });

    // Renewal path: an absolute target date rather than "N days from now".
    it('signs an absolute expiresAt, and the exp claim matches it to the second', async () => {
        const target = new Date(Date.now() + 200 * 86_400_000);
        const res = await signOfflineLicense({ ...base, expiresAt: target });
        const payload = await verify(res.code);

        expect(res.expiresAt?.getTime()).toBe(target.getTime());
        expect(payload.exp).toBe(Math.floor(target.getTime() / 1000));
    });

    it('marks an absolute-dated code ANNUAL, not PERPETUAL', async () => {
        const target = new Date(Date.now() + 30 * 86_400_000);
        const res = await signOfflineLicense({ ...base, expiresAt: target });

        expect(res.plan).toBe('ANNUAL');
        expect(decodeJwt(res.code).plan).toBe('ANNUAL');
    });

    it('treats an explicit null expiresAt as perpetual', async () => {
        const res = await signOfflineLicense({ ...base, expiresAt: null });

        expect(res.plan).toBe('PERPETUAL');
        expect(res.expiresAt).toBeNull();
        expect(decodeJwt(res.code).exp).toBeUndefined();
    });

    it('lets an absolute date override a stale relative day count', async () => {
        const target = new Date(Date.now() + 10 * 86_400_000);
        const res = await signOfflineLicense({ ...base, expiryDays: 365, expiresAt: target });

        expect(res.expiresAt?.getTime()).toBe(target.getTime());
    });

    it('rejects a code signed for a different device', async () => {
        const res = await signOfflineLicense({ ...base });
        const payload = await verify(res.code);

        expect(payload.hw).not.toBe('SOME-OTHER-DEVICE');
    });
});
