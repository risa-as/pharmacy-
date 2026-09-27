import { describe, expect, it, vi } from 'vitest';
import { runWarehouseOperation, warehouseCommand, warehouseReplay } from '../warehouse-operation';

const command = warehouseCommand('w1', 'test', { amount: 5, idempotencyKey: 'key-0123456789abcdef' });
const stored = (result: object) => ({ warehouseOperation: { findUnique: vi.fn().mockResolvedValue({ scope: 'test', requestHash: command.requestHash, result }), create: vi.fn() }, $queryRaw: vi.fn() });

describe('a replayed operation says so (clients must not report it as a new one)', () => {
  it('warehouseReplay flags the stored result', async () => {
    expect(await warehouseReplay(stored({ entry: { id: 'e1' } }) as any, command)).toEqual({ entry: { id: 'e1' }, idempotentReplay: true });
  });
  it('runWarehouseOperation flags a replay and does not run the work again', async () => {
    const db = stored({ entry: { id: 'e1' } });
    const work = vi.fn();
    expect(await runWarehouseOperation(db as any, command, work)).toMatchObject({ idempotentReplay: true });
    expect(work).not.toHaveBeenCalled();
  });
  it('a first run is not flagged', async () => {
    const db = { warehouseOperation: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() }, $queryRaw: vi.fn() };
    const result = await runWarehouseOperation(db as any, command, async () => ({ entry: { id: 'new' } }));
    expect(result).toEqual({ entry: { id: 'new' } });
    expect(db.warehouseOperation.create.mock.calls[0][0].data.result).toEqual({ entry: { id: 'new' } });
  });
});
