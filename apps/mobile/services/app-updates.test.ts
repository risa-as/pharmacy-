import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    state: { currentState: 'active' },
    listener: undefined as undefined | ((state: string) => void),
    remove: vi.fn(),
    enabled: true,
    check: vi.fn(),
    fetch: vi.fn(),
    reload: vi.fn(),
}));
vi.mock('react-native', () => ({
    AppState: {
        get currentState() { return mocks.state.currentState; },
        addEventListener: (_: string, listener: (state: string) => void) => {
            mocks.listener = listener;
            return { remove: mocks.remove };
        },
    },
}));
vi.mock('expo-updates', () => ({
    runtimeVersion: '1.0.1',
    updateId: 'test-update-id',
    isEmbeddedLaunch: false,
    channel: 'production',
    get isEnabled() { return mocks.enabled; },
    checkForUpdateAsync: mocks.check,
    fetchUpdateAsync: mocks.fetch,
    reloadAsync: mocks.reload,
}));
import { startAutomaticUpdates } from './app-updates';

describe('automatic app updates', () => {
    let stop: (() => void) | undefined;
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
        vi.stubGlobal('__DEV__', false);
        vi.clearAllMocks();
        mocks.enabled = true;
        mocks.state.currentState = 'active';
        mocks.listener = undefined;
        mocks.check.mockResolvedValue({ isAvailable: true });
        mocks.fetch.mockResolvedValue({ isNew: true });
    });
    afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

    it('downloads once without restarting an active checkout', async () => {
        stop = startAutomaticUpdates();
        expect(mocks.check).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(15_000);
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        expect(mocks.check).toHaveBeenCalledTimes(1);
        expect(mocks.reload).not.toHaveBeenCalled();
    });
    it.each([[true, true], [false, false]])('skips unsupported runtimes (development=%s, enabled=%s)', async (dev, enabled) => {
        vi.stubGlobal('__DEV__', dev);
        mocks.enabled = enabled;
        stop = startAutomaticUpdates();
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        expect(mocks.check).not.toHaveBeenCalled();
        expect(mocks.listener).toBeUndefined();
    });
    it('does not download when the installed version is current', async () => {
        mocks.check.mockResolvedValue({ isAvailable: false });
        stop = startAutomaticUpdates();
        await vi.advanceTimersByTimeAsync(15_000);
        expect(mocks.fetch).not.toHaveBeenCalled();
    });
    it('stages a rollback without restarting the current session', async () => {
        mocks.check.mockResolvedValue({ isAvailable: false, isRollBackToEmbedded: true });
        mocks.fetch.mockResolvedValue({ isNew: false, isRollBackToEmbedded: true });
        stop = startAutomaticUpdates();
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
        expect(mocks.reload).not.toHaveBeenCalled();
    });
    it('recovers from an offline check after the retry interval', async () => {
        mocks.check.mockRejectedValueOnce(new Error('offline'));
        stop = startAutomaticUpdates();
        await vi.advanceTimersByTimeAsync(15_000);
        mocks.listener?.('active');
        expect(mocks.check).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });
    it('waits while backgrounded and checks on returning to the app', async () => {
        mocks.state.currentState = 'background';
        stop = startAutomaticUpdates();
        await vi.advanceTimersByTimeAsync(15_000);
        expect(mocks.check).not.toHaveBeenCalled();
        mocks.state.currentState = 'active';
        mocks.listener?.('active');
        await vi.advanceTimersByTimeAsync(0);
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });
    it('does not overlap a slow check or download after unmounting', async () => {
        let resolve!: (value: { isAvailable: boolean }) => void;
        mocks.check.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
        stop = startAutomaticUpdates();
        await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
        expect(mocks.check).toHaveBeenCalledTimes(1);
        stop();
        resolve({ isAvailable: true });
        await vi.advanceTimersByTimeAsync(0);
        expect(mocks.fetch).not.toHaveBeenCalled();
        expect(mocks.remove).toHaveBeenCalled();
    });
});
