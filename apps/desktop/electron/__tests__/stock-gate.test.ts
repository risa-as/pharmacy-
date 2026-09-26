import { expect, it } from 'vitest';
import { tryWithStockGate, withStockGate } from '../stock-gate';

const tick = () => new Promise(r => setTimeout(r, 5));

it('runs an online return after a stock apply, never in between, so it restocks once', async () => {
    const order: string[] = [];
    let finishApply!: () => void;
    const apply = tryWithStockGate(async () => {
        order.push('snapshot-read');
        await new Promise<void>(r => { finishApply = r; });
        order.push('snapshot-applied');
    });
    await tick();
    const ret = withStockGate(async () => { order.push('return-server'); await tick(); order.push('return-local'); });
    await tick();
    expect(order).toEqual(['snapshot-read']); // the return waits
    finishApply();
    await Promise.all([apply, ret]);
    expect(order).toEqual(['snapshot-read', 'snapshot-applied', 'return-server', 'return-local']);
});

it('skips a sync upload while the gate is held instead of waiting', async () => {
    let release!: () => void;
    const held = withStockGate(() => new Promise<void>(r => { release = r; }));
    await tick();
    expect(await tryWithStockGate(async () => 'upload')).toEqual({ ran: false });
    release();
    await held;
    expect(await tryWithStockGate(async () => 'upload')).toEqual({ ran: true, value: 'upload' });
});

it('gives up waiting with a clear message instead of freezing the return', async () => {
    let release!: () => void;
    const held = withStockGate(() => new Promise<void>(r => { release = r; }));
    await tick();
    await expect(withStockGate(async () => 'late', 20)).rejects.toThrow('مزامنة المخزون جارية');
    release();
    await held;
    expect(await tryWithStockGate(async () => 'free')).toEqual({ ran: true, value: 'free' });
});
