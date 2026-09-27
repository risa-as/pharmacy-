import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getUserPermissions } from '../permissions';
import { RECEIPT_ERROR_CODES } from '../../../../../packages/shared/src/receipt-outcome';

const h = vi.hoisted(() => ({ context: vi.fn(), receive: vi.fn() }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: h.context }));
vi.mock('@/app/lib/prisma', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app/lib/notifications/notificationTriggers', () => ({ sendAndPersistNotification: vi.fn() }));
vi.mock('@/app/lib/purchase-receipt', async (original) => ({ ...(await original<object>()), receivePurchaseStock: h.receive }));

import { PurchaseReceiptError, receivePurchaseStock } from '../purchase-receipt';
import { POST as receivePost } from '../../api/purchases/[id]/receive/route';
import { receivePurchase } from '../actions/purchase-actions';

const real = (await vi.importActual<typeof import('../purchase-receipt')>('../purchase-receipt')).receivePurchaseStock;
const line = { itemId: 'item', quantity: 5, batchNumber: 'A', expiryDate: '2099-01-01T00:00:00.000Z', cost: 100 };
const dbWithStatus = (status: string) => {
  const tx: any = {
    $queryRaw: vi.fn(),
    warehouseOrderEvent: { findFirst: vi.fn().mockResolvedValue(null) },
    warehouseOrder: { findUnique: vi.fn() },
    purchase: { findFirst: vi.fn().mockResolvedValue({ id: 'p', status, items: [] }) },
    batch: { create: vi.fn() },
  };
  return { tx, db: { $transaction: vi.fn((fn: any) => fn(tx)) } as any };
};
const params = { params: Promise.resolve({ id: 'p' }) };
const req = () => new NextRequest('http://local/api/purchases/p/receive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [line] }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.context.mockResolvedValue({ user: { id: 'u', role: 'MANAGER', branchId: 'b' }, organizationId: 'org', tenantBranchWhere: { branchId: 'b' }, userPermissions: getUserPermissions({ role: 'MANAGER', permissions: '{}' }) });
});

it('an already received purchase fails with its own code and message', async () => {
  const { db, tx } = dbWithStatus('COMPLETED');
  const error = await real(db, 'p', {}, [line]).catch((e) => e);
  expect(error).toBeInstanceOf(PurchaseReceiptError);
  expect(error).toMatchObject({ status: 409, code: RECEIPT_ERROR_CODES.ALREADY_RECEIVED });
  expect(error.message).toContain('مستلم');
  expect(tx.batch.create).not.toHaveBeenCalled();
});

it('a cancelled purchase fails with its own code and message', async () => {
  const { db, tx } = dbWithStatus('CANCELLED');
  const error = await real(db, 'p', {}, [line]).catch((e) => e);
  expect(error).toMatchObject({ status: 409, code: RECEIPT_ERROR_CODES.CANCELLED });
  expect(error.message).toContain('ملغ');
  expect(tx.batch.create).not.toHaveBeenCalled();
});

it('the HTTP route returns the code with the 409', async () => {
  h.receive.mockRejectedValue(new PurchaseReceiptError('ملغاة', 409, RECEIPT_ERROR_CODES.CANCELLED));
  const res = await receivePost(req(), params);
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ code: RECEIPT_ERROR_CODES.CANCELLED });
});

it('the server action returns a receipt failure instead of throwing, so production keeps the reason', async () => {
  h.receive.mockRejectedValue(new PurchaseReceiptError('استُلمت سابقاً', 409, RECEIPT_ERROR_CODES.ALREADY_RECEIVED));
  await expect(receivePurchase('p', [{ ...line, expiryDate: new Date(line.expiryDate) }])).resolves.toMatchObject({
    ok: false, status: 409, code: RECEIPT_ERROR_CODES.ALREADY_RECEIVED, message: 'استُلمت سابقاً',
  });
});

it('the server action reports success explicitly', async () => {
  h.receive.mockResolvedValue({ id: 'p', status: 'COMPLETED', receivedCount: 1, createdInventoryCount: 0 });
  await expect(receivePurchase('p', [{ ...line, expiryDate: new Date(line.expiryDate) }])).resolves.toMatchObject({ ok: true });
  expect(receivePurchaseStock).toHaveBeenCalledOnce();
});
