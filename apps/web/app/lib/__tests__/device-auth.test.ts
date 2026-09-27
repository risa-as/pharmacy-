import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';

const db = vi.hoisted(() => ({ key: null as any, nonceCreate: vi.fn() }));
vi.mock('../prisma', () => ({ prisma: {
    deviceSigningKey: { findFirst: vi.fn(async () => db.key) },
    deviceSigningNonce: { create: db.nonceCreate, deleteMany: vi.fn(async () => ({ count: 0 })) },
} }));
import { enforceDeviceSignature } from '../device-auth';
import { deviceRequestMessage, normalizeDevicePublicKey } from '../device-signature';

const enrolled = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = normalizeDevicePublicKey(enrolled.publicKey.export({ type: 'spki', format: 'pem' }).toString());
const LICENSE = 'LICENSE-SECRET-123', TOKEN = 'TOKEN-SECRET-456';

function request(privateKey = enrolled.privateKey) {
    const time = String(Date.now()), nonce = randomUUID(), url = 'https://app.test/api/sync/sales?query=QUERY-SECRET', body = 'BODY-SECRET';
    const signature = sign('sha256', Buffer.from(deviceRequestMessage('POST', url, body, time, nonce, TOKEN, LICENSE, '', 'key-1')), privateKey).toString('base64');
    return new Request(url, { method: 'POST', body, headers: { 'x-device-time': time, 'x-device-nonce': nonce, 'x-sync-token': TOKEN,
        'x-device-license-key': LICENSE, 'x-device-fingerprint': key.fingerprint, 'x-device-key-id': 'key-1', 'x-device-signature': signature } });
}
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    vi.stubEnv('TPM_DEVICE_AUTH_ENABLED', 'true');
    db.key = { id: 'key-1', status: 'ACTIVE', publicKey: key.publicKey, fingerprint: key.fingerprint, license: { isActive: true, expiresAt: null, licenseKey: LICENSE } };
    db.nonceCreate.mockReset().mockResolvedValue({});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); vi.unstubAllEnvs(); });
const logged = () => warn.mock.calls.map(call => call.join(' ')).join('\n');

describe('server-side reason for a refused device proof', () => {
    it('accepts the enrolled key without logging', async () => {
        expect(await enforceDeviceSignature(request())).toBeNull();
        expect(warn).not.toHaveBeenCalled();
    });

    it('logs signature-mismatch for a device signing with another key, keeping the generic response', async () => {
        const response = await enforceDeviceSignature(request(other.privateKey));
        expect(response?.status).toBe(403);
        expect(await response!.json()).toMatchObject({ code: 'DEVICE_SIGNATURE_INVALID' });
        expect(logged()).toContain('"reason":"signature-mismatch"');
        expect(logged()).toContain('"path":"/api/sync/sales"');
    });

    it('names why an enrollment is refused', async () => {
        db.key.license.isActive = false;
        await enforceDeviceSignature(request());
        db.key.license.isActive = true; db.key.status = 'REVOKED';
        await enforceDeviceSignature(request());
        expect(logged()).toContain('"reason":"license-inactive"');
        expect(logged()).toContain('"reason":"key-status-revoked"');
    });

    it('logs a replayed nonce', async () => {
        db.nonceCreate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
        expect((await enforceDeviceSignature(request()))?.status).toBe(409);
        expect(logged()).toContain('"code":"DEVICE_REPLAY"');
    });

    it('never logs the license, token, signature, fingerprint, public key, query or body', async () => {
        await enforceDeviceSignature(request(other.privateKey));
        const text = logged();
        for (const secret of [LICENSE, TOKEN, 'QUERY-SECRET', 'BODY-SECRET', key.fingerprint, 'BEGIN PUBLIC KEY'])
            expect(text).not.toContain(secret);
    });
});
