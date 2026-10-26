import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => 'device' } }));
vi.mock('./private-storage', () => ({ readPrivateValue: vi.fn(), writePrivateValue: vi.fn(), removePrivateValue: vi.fn() }));
vi.mock('./api', () => ({ getBaseUrl: async () => 'https://test.invalid/api', setCachedToken: vi.fn(), resetSessionExpired: vi.fn(), rotateCachedToken: vi.fn(), getSessionGeneration: () => 1 }));
import { authService } from './auth';
import { readPrivateValue, writePrivateValue, removePrivateValue } from './private-storage';
import { setCachedToken } from './api';
beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(removePrivateValue).mockResolvedValue();
    vi.mocked(writePrivateValue).mockResolvedValue();
});
afterEach(() => vi.unstubAllGlobals());
it('clears a partially stored login and never starts a seat session', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ token: 'new', user: { id: 'u', role: 'ADMIN' } })));
    vi.stubGlobal('fetch', fetcher);
    vi.mocked(writePrivateValue).mockResolvedValueOnce().mockRejectedValueOnce(new Error('secure write'));
    await expect(authService.login('test@example.invalid', 'not-a-real-password')).rejects.toThrow('secure write');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(setCachedToken).toHaveBeenLastCalledWith(null);
    expect(removePrivateValue).toHaveBeenCalledWith('authToken');
    expect(removePrivateValue).toHaveBeenCalledWith('user');
});
it('clears cached credentials after a seat refusal even if deleting one key fails', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: 'new', user: { id: 'u', role: 'ADMIN' } })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'limit' }), { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    vi.mocked(removePrivateValue).mockRejectedValueOnce(new Error('delete failed'));
    await expect(authService.login('test@example.invalid', 'not-a-real-password')).rejects.toThrow('limit');
    expect(setCachedToken).toHaveBeenLastCalledWith(null);
    expect(removePrivateValue).toHaveBeenCalledWith('user');
});
it('attempts both removals and clears memory when logout cannot read the user', async () => {
    vi.mocked(readPrivateValue).mockRejectedValue(new Error('secure read'));
    vi.mocked(removePrivateValue).mockRejectedValueOnce(new Error('delete failed'));
    await expect(authService.logout()).rejects.toThrow('delete failed');
    expect(setCachedToken).toHaveBeenLastCalledWith(null);
    expect(removePrivateValue).toHaveBeenCalledWith('authToken');
    expect(removePrivateValue).toHaveBeenCalledWith('user');
});
