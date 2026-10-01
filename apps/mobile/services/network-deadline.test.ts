import { afterEach, expect, it, vi } from 'vitest';
import { withNetworkDeadline } from './network-deadline';
afterEach(() => vi.useRealTimers());
it('aborts a stalled response read at the deadline', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const pending = withNetworkDeadline(signal => new Promise((_, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
    }));
    const result = expect(pending).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(8_000);
    await result;
    expect(aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
});
it('preserves a definite security denial and clears the timer', async () => {
    vi.useFakeTimers();
    const denial = new Error('session refused');
    await expect(withNetworkDeadline(async () => { throw denial; })).rejects.toBe(denial);
    expect(vi.getTimerCount()).toBe(0);
});
it('does not abort a completed successful request later', async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    await expect(withNetworkDeadline(async s => { signal = s; return 'ready'; })).resolves.toBe('ready');
    await vi.advanceTimersByTimeAsync(9_000);
    expect(signal.aborted).toBe(false);
});
