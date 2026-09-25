import { expect, it, vi } from 'vitest';

it('times out before replacing the database and reopens access without running a late restore', async () => {
    vi.resetModules(); vi.useFakeTimers();
    try {
        const gate = await import('../database-maintenance');
        let finish!: () => void;
        const running = gate.withDatabaseQuery(() => new Promise<void>(resolve => { finish=resolve; }));
        const replace = vi.fn(async () => ({success:true}));
        const restore = gate.withDatabaseRestore(replace);
        const rejected = expect(restore).rejects.toThrow('30');
        await vi.advanceTimersByTimeAsync(30_000); await rejected;
        expect(replace).not.toHaveBeenCalled();
        expect(await gate.withDatabaseQuery(async()=>42)).toBe(42);
        finish(); await running;
        expect(replace).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
});

it('drains current queries, blocks new background queries, and stays locked after successful restore', async () => {
    vi.resetModules();
    const gate = await import('../database-maintenance');
    let finish!: () => void;
    const running = gate.withDatabaseQuery(() => new Promise<void>(resolve => { finish = resolve; }));
    const restore = vi.fn(async () => {
        await gate.withDatabaseQuery(async () => 'restore checkpoint');
        return { success: true };
    });
    const result = gate.withDatabaseRestore(restore);
    expect(restore).not.toHaveBeenCalled();
    await expect(gate.withDatabaseQuery(async () => 'sync')).rejects.toThrow();
    finish(); await running;
    expect((await result).success).toBe(true);
    await expect(gate.withDatabaseQuery(async () => 'new sale')).rejects.toThrow();
});

it('reopens access when restore is rejected or throws', async () => {
    vi.resetModules();
    const gate = await import('../database-maintenance');
    await gate.withDatabaseRestore(async () => ({success:false}));
    expect(await gate.withDatabaseQuery(async () => 1)).toBe(1);
    await expect(gate.withDatabaseRestore(async () => {throw Error('failure');})).rejects.toThrow('failure');
    expect(await gate.withDatabaseQuery(async () => 2)).toBe(2);
});
