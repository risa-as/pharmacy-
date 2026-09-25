import { afterEach, describe, expect, it } from 'vitest';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { ensureWebCrypto } from '../runtime-crypto';

const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
afterEach(() => { if (original) Object.defineProperty(globalThis, 'crypto', original); });
describe('Electron Web Crypto compatibility', () => {
    it('verifies a real JWT when Electron has no global crypto', async () => {
        Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
        ensureWebCrypto();
        const { publicKey, privateKey } = await generateKeyPair('RS256');
        const token = await new SignJWT({ organizationId: 'fixture' }).setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
        expect((await jwtVerify(token, publicKey)).payload.organizationId).toBe('fixture');
        const wrongKeys = await generateKeyPair('RS256');
        await expect(jwtVerify(token, wrongKeys.publicKey)).rejects.toThrow();
    });
    it('preserves an existing Web Crypto implementation', () => {
        const existing = globalThis.crypto;
        ensureWebCrypto();
        expect(globalThis.crypto).toBe(existing);
    });
});
