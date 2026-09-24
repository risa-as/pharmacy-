import { createHash, createPublicKey, verify } from 'node:crypto';

export const deviceSigningEnabled = () => process.env.TPM_DEVICE_AUTH_ENABLED === 'true';
export function normalizeDevicePublicKey(pem: string) {
  if (typeof pem !== 'string' || pem.length > 2000 || !pem.startsWith('-----BEGIN PUBLIC KEY-----')) throw Error('Invalid public key');
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails?.modulusLength !== 2048) throw Error('RSA-2048 required');
  const publicKey = key.export({type: 'spki', format: 'pem'}).toString();
  return {publicKey, fingerprint: createHash('sha256').update(publicKey).digest('hex')};
}
export function deviceRequestMessage(method: string, url: string, body: string, timestamp: string, nonce: string, token: string, license: string, idempotencyKey = '', keyId = '') {
  const parsed = new URL(url);
  const hash = (v: string) => createHash('sha256').update(v).digest('hex');
  return JSON.stringify(['faramace-device-request:v1', method.toUpperCase(), parsed.pathname + parsed.search, timestamp, nonce, hash(body), hash(token), hash(license), hash(idempotencyKey), keyId]);
}
export async function verifyDeviceRequest(request: Request, key: {publicKey: string; fingerprint: string; id?: string}, now = Date.now()) {
  const h = request.headers;
  const timestamp = h.get('x-device-time') || '';
  const nonce = h.get('x-device-nonce') || '';
  const signature = h.get('x-device-signature') || '';
  if (!/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 120000 || !/^[a-f0-9-]{36}$/.test(nonce)
    || (key.id !== undefined && h.get('x-device-key-id') !== key.id) || h.get('x-device-fingerprint') !== key.fingerprint || signature.length > 512) return null;
  const message = deviceRequestMessage(request.method, request.url, await request.clone().text(), timestamp, nonce,
    h.get('x-sync-token') || '', h.get('x-device-license-key') || '', h.get('x-idempotency-key') || '', h.get('x-device-key-id') || '');
  return verify('sha256', Buffer.from(message), key.publicKey, Buffer.from(signature, 'base64')) ? nonce : null;
}
