import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    state: { currentState: 'active' },
    listener: undefined as undefined | ((state: string) => void),
    remove: vi.fn(),
    enabled: true,
    pending: false,
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
    get latestContext() { return { isUpdatePending: mocks.pending }; },
    runtimeVersion: '1.0.1',
    updateId: 'test-update-id',
    isEmbeddedLaunch: false,
    channel: 'production',
    get isEnabled() { return mocks.enabled; },
    checkForUpdateAsync: mocks.check,
    fetchUpdateAsync: mocks.fetch,
    reloadAsync: mocks.reload,
}));
import { checkAndDownloadAppUpdate, startAutomaticUpdates } from './app-updates';

describe('automatic app updates', () => {
    let stop: (() => void) | undefined;
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
        vi.stubGlobal('__DEV__', false);
        vi.clearAllMocks();
        mocks.enabled = true;
        mocks.pending = false;
        mocks.reload.mockResolvedValue(undefined);
        mocks.state.currentState = 'active';
        mocks.listener = undefined;
        mocks.check.mockResolvedValue({ isAvailable: true });
        mocks.fetch.mockResolvedValue({ isNew: true });
    });
    afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

    it('shares a manual check with the automatic check without reloading', async () => {
        let resolve!: (value: { isAvailable: boolean }) => void;
        mocks.check.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
        const manual = checkAndDownloadAppUpdate();
        stop = startAutomaticUpdates();
        await vi.advanceTimersByTimeAsync(15_000);
        const repeated = checkAndDownloadAppUpdate();
        expect(mocks.check).toHaveBeenCalledTimes(1);
        resolve({ isAvailable: true });
        expect(await manual).toBe('ready');
        expect(await repeated).toBe('ready');
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
        expect(mocks.reload).not.toHaveBeenCalled();
    });
    it('allows a manual retry after a network failure', async () => {
        mocks.check.mockRejectedValueOnce(new Error('offline'));
        await expect(checkAndDownloadAppUpdate()).rejects.toThrow('offline');
        expect(await checkAndDownloadAppUpdate()).toBe('ready');
    });
    it('does not claim an update is ready when downloading fails', async () => {
        mocks.fetch.mockRejectedValueOnce(new Error('download interrupted'));
        await expect(checkAndDownloadAppUpdate()).rejects.toThrow('download interrupted');
        expect(await checkAndDownloadAppUpdate()).toBe('ready');
    });
    it('reports a current version without fetching', async () => {
        mocks.check.mockResolvedValueOnce({ isAvailable: false });
        expect(await checkAndDownloadAppUpdate()).toBe('current');
        expect(mocks.fetch).not.toHaveBeenCalled();
    });
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
        await vi.advanceTimersByTimeAsync(400);
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

describe('safe ordinary reopen updates', () => {
    let stop: (() => void) | undefined;
    const state = (next: string) => { mocks.state.currentState = next; mocks.listener?.(next); };
    beforeEach(() => {
        vi.useFakeTimers(); vi.stubGlobal('__DEV__', false); vi.clearAllMocks();
        mocks.enabled = true; mocks.pending = true; mocks.state.currentState = 'active';
        mocks.check.mockResolvedValue({ isAvailable: true }); mocks.fetch.mockResolvedValue({ isNew: true }); mocks.reload.mockResolvedValue(undefined);
    });
    afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
    it('applies a native-downloaded update after Home and ordinary reopening', async () => {
        const flush = vi.fn().mockResolvedValue(undefined);
        stop = startAutomaticUpdates({ canReload: () => true, beforeReload: flush });
        await vi.advanceTimersByTimeAsync(1000);
        expect(mocks.reload).not.toHaveBeenCalled();
        state('background'); state('active');
        await vi.advanceTimersByTimeAsync(400);
        expect(flush).toHaveBeenCalledTimes(1); expect(mocks.reload).toHaveBeenCalledTimes(1);
        expect(mocks.check).not.toHaveBeenCalled();
    });
    it('does not interrupt an invoice and retries on a later safe reopening', async () => {
        let safe = false;
        stop = startAutomaticUpdates({ canReload: () => safe });
        state('background'); state('active'); await vi.advanceTimersByTimeAsync(400);
        expect(mocks.reload).not.toHaveBeenCalled();
        safe = true;
        await vi.advanceTimersByTimeAsync(1000); expect(mocks.reload).not.toHaveBeenCalled();
        state('background'); state('active'); await vi.advanceTimersByTimeAsync(400);
        expect(mocks.reload).toHaveBeenCalledTimes(1);
    });
    it('does not treat a system dialog or notification shade as closing the app', async () => {
        stop = startAutomaticUpdates({ canReload: () => true });
        state('inactive'); state('active'); await vi.advanceTimersByTimeAsync(400);
        expect(mocks.reload).not.toHaveBeenCalled();
    });
    it('checks and downloads on reopening when no update is cached', async () => {
        mocks.pending = false;
        stop = startAutomaticUpdates({ canReload: () => true });
        state('background'); state('active'); await vi.advanceTimersByTimeAsync(400);
        expect(mocks.fetch).toHaveBeenCalledTimes(1); expect(mocks.reload).toHaveBeenCalledTimes(1);
    });
    it('cancels a pending reload if the user starts interacting', async () => {
        let interaction = 0;
        stop = startAutomaticUpdates({ canReload: () => true, interactionVersion: () => interaction });
        state('background'); state('active'); interaction++;
        await vi.advanceTimersByTimeAsync(400); expect(mocks.reload).not.toHaveBeenCalled();
    });
    it('rechecks invoice safety after waiting for storage', async () => {
        let safe = true; let resolve!: () => void;
        stop = startAutomaticUpdates({ canReload: () => safe, beforeReload: () => new Promise<void>(r => { resolve = r; }) });
        state('background'); state('active'); await vi.advanceTimersByTimeAsync(400);
        safe = false; resolve(); await vi.advanceTimersByTimeAsync(0);
        expect(mocks.reload).not.toHaveBeenCalled();
    });
    it('keeps using the app if saving the draft fails', async () => {
        stop = startAutomaticUpdates({ canReload: () => true, beforeReload: () => Promise.reject(new Error('disk full')) });
        state('background'); state('active'); await vi.advanceTimersByTimeAsync(400);
        expect(mocks.reload).not.toHaveBeenCalled();
    });
    it('does not reload in background or after the controller is unmounted', async () => {
        stop = startAutomaticUpdates({ canReload: () => true });
        state('background'); state('active'); state('background');
        await vi.advanceTimersByTimeAsync(400); expect(mocks.reload).not.toHaveBeenCalled();
        state('active'); stop(); await vi.advanceTimersByTimeAsync(400);
        expect(mocks.reload).not.toHaveBeenCalled();
    });
    it('recovers from reload failure on the next reopening', async () => {
        mocks.reload.mockRejectedValueOnce(new Error('temporary reload failure'));
        stop = startAutomaticUpdates({ canReload: () => true });
        state('background'); state('active'); await vi.advanceTimersByTimeAsync(400);
        state('background'); state('active'); await vi.advanceTimersByTimeAsync(400);
        expect(mocks.reload).toHaveBeenCalledTimes(2);
    });
    it('stays on the current version when no update is available', async () => {
        mocks.pending = false; mocks.check.mockResolvedValue({ isAvailable: false });
        stop = startAutomaticUpdates({ canReload: () => true });
        state('background'); state('active'); await vi.advanceTimersByTimeAsync(400);
        expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.reload).not.toHaveBeenCalled();
    });
});
