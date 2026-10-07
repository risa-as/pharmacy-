import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
    getItem: vi.fn(async (k: string) => state.values.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => { state.values.set(k, v); }),
    removeItem: vi.fn(async (k: string) => { state.values.delete(k); }),
} }));
vi.mock('expo-secure-store', () => ({
    getItemAsync: vi.fn(async (k: string) => state.values.get(k) ?? null),
    setItemAsync: vi.fn(async (k: string, v: string) => { state.values.set(k, v); }),
    deleteItemAsync: vi.fn(async (k: string) => { state.values.delete(k); }),
}));
vi.mock('./api', () => ({ getBaseUrl: async () => 'https://test.invalid/api',
    getSessionGeneration: () => 1, setCachedToken: vi.fn(), rotateCachedToken: () => true, resetSessionExpired: vi.fn(),
}));
import { authService, MobileSessionLimitError, SessionInvalidError } from './auth';
beforeEach(() => {
    state.values.clear(); state.values.set('authToken', 'stored'); state.values.set('user', JSON.stringify({ id: 'u', role: 'ADMIN' }));
    state.values.set('deviceToken', 'device');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('still rejects revoked credentials during renewal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'disabled' }), { status: 401 })));
    await expect(authService.refreshAccessToken()).rejects.toBeInstanceOf(SessionInvalidError);
});
it('still rejects a seat-limit refusal during startup', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'limit' }), { status: 403 })));
    await expect(authService.verifySessionOnStartup('u')).rejects.toBeInstanceOf(MobileSessionLimitError);
});
it.each(['renewal', 'seat'])('stops a stalled %s request without deleting saved credentials', async kind => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: unknown, options: RequestInit) => new Promise<Response>((_, reject) => {
        options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })));
    const pending = kind === 'renewal' ? authService.refreshAccessToken() : authService.verifySessionOnStartup('u');
    await vi.advanceTimersByTimeAsync(8_100);
    await expect(pending).resolves.toBeUndefined();
    expect(state.values.get('authToken')).toBe('stored');
});
