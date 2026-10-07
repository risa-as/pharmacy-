import { afterEach, expect, it, vi } from 'vitest';
import { ForegroundWork } from './foreground-work';
afterEach(() => vi.useRealTimers());
it('waits for screen reads and a quiet interval before background work', async () => {
    vi.useFakeTimers();
    const gate = new ForegroundWork(); const done = gate.begin();
    const finished = vi.fn(); const waiting = gate.waitForIdle().then(finished);
    await vi.advanceTimersByTimeAsync(500); expect(finished).not.toHaveBeenCalled();
    done(); await vi.advanceTimersByTimeAsync(299); expect(finished).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await waiting; expect(finished).toHaveBeenCalledOnce();
});
it('bounds the delay even if a screen read never ends', async () => {
    vi.useFakeTimers();
    const gate = new ForegroundWork(); gate.begin();
    const finished = vi.fn(); const waiting = gate.waitForIdle().then(finished);
    await vi.advanceTimersByTimeAsync(7999); expect(finished).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await waiting; expect(finished).toHaveBeenCalledOnce();
});
it('overlapping reads and duplicate releases do not prematurely open the gate', async () => {
    vi.useFakeTimers();
    const gate = new ForegroundWork(); const first=gate.begin(), second=gate.begin();
    const finished=vi.fn(); const waiting=gate.waitForIdle().then(finished);
    first(); first(); await vi.advanceTimersByTimeAsync(500); expect(finished).not.toHaveBeenCalled();
    second(); await vi.advanceTimersByTimeAsync(300); await waiting; expect(finished).toHaveBeenCalledOnce();
});
