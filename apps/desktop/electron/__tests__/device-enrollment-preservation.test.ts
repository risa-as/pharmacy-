import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ data: {} as Record<string, any>, handlers: new Map<string, any>(), key: vi.fn(), sign: vi.fn(), fetch: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: (k: string, fn: any) => h.handlers.set(k, fn) }, net: { fetch: h.fetch } }));
vi.mock('../store', () => ({ default: { get: (k: string) => h.data[k], set: (k: string, v: any) => { h.data[k] = v; } } }));
vi.mock('../tpm-worker', () => ({ tpmCommand: h.sign, tpmPublicKey: h.key }));
vi.mock('../api-config', () => ({ getApiCandidates: () => ['https://app.test/api'], getApiBaseUrl: () => 'https://app.test/api' }));
import { registerDeviceSigning } from '../device-signing';
beforeEach(() => {
  h.data = { loggedInUserId: 'u', syncUserId: 'u', syncToken: 'token', licenseKey: 'license', deviceSigning: { fingerprint: 'a'.repeat(64), keyId: 'original', status: 'ACTIVE' }, pendingSyncActions: [{ id: 'sale' }] };
  h.key.mockReset().mockResolvedValue({ fingerprint: 'b'.repeat(64), pem: 'public' });
  h.sign.mockReset().mockResolvedValue('signature'); h.fetch.mockReset(); registerDeviceSigning();
});
it('keeps confirmed identity and pending operations on candidate conflict', async () => {
  h.fetch.mockResolvedValue(new Response(JSON.stringify({ error: 'different key' }), { status: 409 }));
  expect((await h.handlers.get('device-signing:enrol')()).success).toBe(false);
  expect(h.key).toHaveBeenCalledWith(false);
  expect(h.data.deviceSigning).toEqual({ fingerprint: 'a'.repeat(64), keyId: 'original', status: 'ACTIVE' });
  expect(h.fetch.mock.calls[0][1].headers.get('x-device-fingerprint')).toBe('b'.repeat(64));
  expect(h.data.pendingSyncActions).toEqual([{ id: 'sale' }]);
  const shown = await h.handlers.get('device-signing:status')();
  expect(shown.configured.fingerprint).toBe('b'.repeat(64));
  expect(shown.sessionReady).toBe(false);
  expect(shown.status).toBeNull();
});
it('never recreates a missing enrolled key or sends a request', async () => {
  h.key.mockRejectedValue(Error('missing key'));
  expect((await h.handlers.get('device-signing:enrol')()).success).toBe(false);
  expect(h.key).toHaveBeenCalledWith(false); expect(h.fetch).not.toHaveBeenCalled();
  expect(h.data.deviceSigning.keyId).toBe('original');
});
it('persists a candidate only after the server confirms the same fingerprint', async () => {
  h.fetch.mockResolvedValue(new Response(JSON.stringify({ keyId: 'confirmed', fingerprint: 'b'.repeat(64), status: 'ACTIVE' })));
  expect((await h.handlers.get('device-signing:enrol')()).success).toBe(true);
  expect(h.data.deviceSigning).toEqual({ fingerprint: 'b'.repeat(64), keyId: 'confirmed', status: 'ACTIVE' });
  expect(h.data.deviceSigningCandidate).toBeNull();
});
