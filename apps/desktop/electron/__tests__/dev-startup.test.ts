import { describe, expect, it, vi } from 'vitest';
import { createDevStartup } from '../../scripts/dev-startup.cjs';

describe('Electron development startup', () => {
    it('starts once across simultaneous main/preload rebuilds in normal mode', async () => {
        const startup = vi.fn().mockResolvedValue(undefined);
        const log = vi.fn();
        const start = createDevStartup(false, log);
        await Promise.all([start({startup}), start({startup}), start({startup})]);
        await start({startup});
        expect(startup).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledTimes(1);
    });
    it('serializes explicit watch restarts', async () => {
        let running = 0;
        let maximum = 0;
        const startup = vi.fn(async () => {
            maximum = Math.max(maximum, ++running);
            await Promise.resolve();
            running--;
        });
        const start = createDevStartup(true);
        await Promise.all([start({startup}), start({startup})]);
        expect(startup).toHaveBeenCalledTimes(2);
        expect(maximum).toBe(1);
    });
    it('allows a later build to retry a failed initial launch', async () => {
        const startup = vi.fn().mockRejectedValueOnce(Error('launch failed')).mockResolvedValue(undefined);
        const start = createDevStartup(false, vi.fn());
        await start({startup});
        await start({startup});
        expect(startup).toHaveBeenCalledTimes(2);
    });
});
