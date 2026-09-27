import { describe, expect, it, vi } from 'vitest';
import { isWarehouseReplay, replayHeaders, runWarehouseOperation, warehouseCommand, warehouseReplay } from '../warehouse-operation';

const command = warehouseCommand('w1', 'test', { amount: 5, idempotencyKey: 'key-0123456789abcdef' });
const stored = (result: unknown) => ({ warehouseOperation: { findUnique: vi.fn().mockResolvedValue({ scope: 'test', requestHash: command.requestHash, result }), create: vi.fn() }, $queryRaw: vi.fn() });

describe('a replayed operation says so (clients must not report it as a new one)', () => {
  it('warehouseReplay marks the stored result without changing its JSON', async () => {
    const replay = await warehouseReplay(stored({ entry: { id: 'e1' } }) as any, command);
    expect(isWarehouseReplay(replay)).toBe(true);
    expect(JSON.parse(JSON.stringify(replay))).toEqual({ entry: { id: 'e1' } });
    expect(replayHeaders(replay)).toEqual({ 'x-idempotent-replay': '1' });
  });
  it('an array result stays an array', async () => {
    const replay = await warehouseReplay(stored([{ id: 's1' }]) as any, command);
    expect(Array.isArray(replay)).toBe(true);
    expect(isWarehouseReplay(replay)).toBe(true);
  });
  it('runWarehouseOperation marks a replay and does not run the work again', async () => {
    const work = vi.fn();
    expect(isWarehouseReplay(await runWarehouseOperation(stored({ entry: { id: 'e1' } }) as any, command, work))).toBe(true);
    expect(work).not.toHaveBeenCalled();
  });
  it('a first run is not marked', async () => {
    const db = { warehouseOperation: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() }, $queryRaw: vi.fn() };
    const result = await runWarehouseOperation(db as any, command, async () => ({ entry: { id: 'new' } }));
    expect(isWarehouseReplay(result)).toBe(false);
    expect(replayHeaders(result)).toEqual({});
  });
});
