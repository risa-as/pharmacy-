import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ secure: new Map<string, string>(), legacy: new Map<string, string>() }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(async (k: string) => state.secure.get(k) ?? null), setItemAsync: vi.fn(async (k: string, v: string) => { state.secure.set(k, v); }), deleteItemAsync: vi.fn(async (k: string) => { state.secure.delete(k); }) }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(async (k: string) => state.legacy.get(k) ?? null), setItem: vi.fn(async (k: string, v: string) => { state.legacy.set(k, v); }), removeItem: vi.fn(async (k: string) => { state.legacy.delete(k); }) } }));
import * as secure from 'expo-secure-store';
import legacy from '@react-native-async-storage/async-storage';
import { readPrivateValue, writePrivateValue, removePrivateValue } from './private-storage';
beforeEach(() => { vi.clearAllMocks(); state.secure.clear(); state.legacy.clear(); });
it('migrates a legacy token only after verifying secure storage and preserves pending sales', async () => {
    state.legacy.set('authToken', 'old'); state.legacy.set('pendingSales', 'must remain');
    await expect(readPrivateValue('authToken')).resolves.toBe('old');
    expect(state.secure.get('authToken')).toBe('old'); expect(state.legacy.has('authToken')).toBe(false); expect(state.legacy.get('pendingSales')).toBe('must remain');
});
it('does not fall back to a legacy token when secure reads fail', async () => {
    state.legacy.set('authToken', 'old'); vi.mocked(secure.getItemAsync).mockRejectedValueOnce(new Error('locked'));
    await expect(readPrivateValue('authToken')).rejects.toThrow('locked'); expect(legacy.getItem).not.toHaveBeenCalled();
});
it('does not save a new token in plaintext when secure writes fail', async () => {
    vi.mocked(secure.setItemAsync).mockRejectedValueOnce(new Error('full'));
    await expect(writePrivateValue('authToken', 'new')).rejects.toThrow('full'); expect(legacy.setItem).not.toHaveBeenCalled();
});
it('retains legacy data if the secure store silently ignores migration', async () => {
    state.legacy.set('authToken', 'old'); vi.mocked(secure.setItemAsync).mockResolvedValueOnce(undefined);
    await expect(readPrivateValue('authToken')).rejects.toThrow(); expect(state.legacy.get('authToken')).toBe('old');
});
it('serializes migration then logout so an old token cannot come back', async () => {
    state.legacy.set('authToken', 'old'); const migration = readPrivateValue('authToken'); const removal = removePrivateValue('authToken');
    await migration; await removal; expect(state.secure.has('authToken')).toBe(false); expect(state.legacy.has('authToken')).toBe(false);
});
it('does not migrate an old consent out of plaintext', async () => {
    state.legacy.set('ai_consent_assistant_u1', 'old'); await expect(readPrivateValue('ai_consent_assistant_u1')).resolves.toBeNull();
});
