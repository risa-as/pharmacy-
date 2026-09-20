import { beforeEach, describe, expect, it, vi } from 'vitest';

const deferred = <T = void>() => {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const flush = async () => {
    for (let i = 0; i < 8; i++) {
        await Promise.resolve();
    }
};

async function loadPollingService() {
    vi.resetModules();

    let appStateHandler: ((state: string) => void) | undefined;
    vi.doMock('react-native', () => ({
        AppState: {
            addEventListener: vi.fn((_event: string, handler: (state: string) => void) => {
                appStateHandler = handler;
                return { remove: vi.fn() };
            }),
        },
    }));

    const module = await import('./polling');
    return {
        pollingService: module.pollingService,
        setAppState: (state: string) => appStateHandler?.(state),
    };
}

describe('pollingService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.restoreAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('drops interval ticks but queues one manual trigger while a job is already running', async () => {
        const first = deferred();
        const second = deferred();
        const fetchFn = vi.fn()
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);
        const { pollingService } = await loadPollingService();

        pollingService.register('inventory', fetchFn, 1000);
        await flush();
        vi.advanceTimersByTime(1000);
        pollingService.trigger('inventory');
        await flush();

        expect(fetchFn).toHaveBeenCalledTimes(1);

        first.resolve();
        await flush();
        expect(fetchFn).toHaveBeenCalledTimes(2);

        second.resolve();
        await flush();
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('does not run a queued follow-up after the app moves to the background', async () => {
        const first = deferred();
        const fetchFn = vi.fn()
            .mockReturnValueOnce(first.promise)
            .mockResolvedValueOnce(undefined);
        const { pollingService, setAppState } = await loadPollingService();

        pollingService.register('inventory', fetchFn, 1000);
        await flush();
        vi.advanceTimersByTime(1000);
        pollingService.trigger('inventory');
        setAppState('background');
        await flush();

        expect(fetchFn).toHaveBeenCalledTimes(1);

        first.resolve();
        await flush();

        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('coalesces a foreground refresh with a slow in-flight job', async () => {
        const first = deferred();
        const second = deferred();
        const fetchFn = vi.fn()
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);
        const { pollingService, setAppState } = await loadPollingService();

        pollingService.register('alerts', fetchFn, 1000);
        await flush();
        setAppState('background');
        setAppState('active');
        await flush();

        expect(fetchFn).toHaveBeenCalledTimes(1);

        first.resolve();
        await flush();
        expect(fetchFn).toHaveBeenCalledTimes(2);

        second.resolve();
        await flush();
    });

    it('catches rejected poll requests and keeps future intervals running', async () => {
        const fetchFn = vi.fn()
            .mockRejectedValueOnce(new Error('network failed'))
            .mockResolvedValueOnce(undefined);
        const { pollingService } = await loadPollingService();

        pollingService.register('debts', fetchFn, 1000);
        await flush();

        expect(console.error).toHaveBeenCalledWith(
            'Polling job "debts" failed:',
            expect.any(Error),
        );

        vi.advanceTimersByTime(1000);
        await flush();

        expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('catches synchronous poll failures and keeps the job usable', async () => {
        const fetchFn = vi.fn()
            .mockImplementationOnce(() => { throw new Error('sync failed'); })
            .mockResolvedValueOnce(undefined);
        const { pollingService } = await loadPollingService();

        pollingService.register('reports', fetchFn, 1000);
        await flush();

        expect(console.error).toHaveBeenCalledWith(
            'Polling job "reports" failed:',
            expect.any(Error),
        );

        vi.advanceTimersByTime(1000);
        await flush();

        expect(fetchFn).toHaveBeenCalledTimes(2);
    });
});
