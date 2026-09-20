import { describe, expect, it } from 'vitest';
import { createCoalescedRun } from '../sync-coalescer';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe('createCoalescedRun', () => {
    it('shares one in-flight run across overlapping callers', async () => {
        const firstRun = deferred<string>();
        let runs = 0;
        let joins = 0;

        const run = createCoalescedRun(
            async () => {
                runs++;
                return await firstRun.promise;
            },
            {
                timeoutMs: 1000,
                timeoutResult: 'timeout',
                onJoin: () => { joins++; },
            },
        );

        const first = run();
        const second = run();

        firstRun.resolve('synced');

        await expect(first).resolves.toBe('synced');
        await expect(second).resolves.toBe('synced');
        expect(runs).toBe(1);
        expect(joins).toBe(1);
    });

    it('clears the in-flight run after a failure so the next call can retry', async () => {
        let runs = 0;
        const run = createCoalescedRun(
            async () => {
                runs++;
                if (runs === 1) throw new Error('network down');
                return 'recovered';
            },
            {
                timeoutMs: 1000,
                timeoutResult: 'timeout',
            },
        );

        await expect(run()).rejects.toThrow('network down');
        await expect(run()).resolves.toBe('recovered');
        expect(runs).toBe(2);
    });
});
