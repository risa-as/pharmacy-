import { expect, it, vi } from 'vitest';
import { checkSessionAndAccess } from './startup-checks';
it('starts both checks without serial waiting and waits for both', async () => {
    let release!: () => void;
    const access = vi.fn(async () => {});
    const pending = checkSessionAndAccess(() => new Promise<void>(r => { release = r; }), access);
    let completed = false; void pending.then(() => { completed = true; });
    await Promise.resolve(); await Promise.resolve();
    expect(access).toHaveBeenCalledTimes(1); expect(completed).toBe(false);
    release(); await pending; expect(completed).toBe(true);
});
it('keeps session denial after access finishes, with no late access write', async () => {
    const denial = new Error('seat limit');
    let release!: () => void;
    const pending = checkSessionAndAccess(async () => { throw denial; }, () => new Promise<void>(r => { release = r; }));
    const result = expect(pending).rejects.toBe(denial);
    await Promise.resolve(); release(); await result;
});
