import { beforeEach, expect, it, vi } from 'vitest';
import type { TenantContext } from './tenant-utils';
const mocks = vi.hoisted(() => ({ tx: { $executeRaw: vi.fn(), auditLog: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() } } }));
vi.mock('./prisma', () => ({ prisma: { $transaction: (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx) } }));
import { createPrivacyRequest, updatePrivacyRequest } from './privacy-requests';
const ctx = { user: { id: 'u1', name: 'Owner', role: 'ADMIN', branchId: 'b1' }, organizationId: 'o1' } as TenantContext;
const row = { id: 'u1.request', userId: 'u1', userName: 'Owner', entity: 'PRIVACY_REQUEST', action: 'REQUEST', branchId: 'b1', createdAt: new Date(), details: JSON.stringify({ status: 'REQUESTED', organizationId: 'o1' }) };
beforeEach(() => { vi.resetAllMocks(); mocks.tx.auditLog.findMany.mockResolvedValue([]); mocks.tx.auditLog.findUnique.mockResolvedValue(null); });
it('returns the durable receipt on replay without creating another request', async () => {
    mocks.tx.auditLog.findUnique.mockResolvedValue(row);
    expect((await createPrivacyRequest(ctx, 'request')).id).toBe(row.id); expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
});
it('deduplicates a second identifier while the user has an open request', async () => {
    mocks.tx.auditLog.findMany.mockResolvedValue([row]); await createPrivacyRequest(ctx, 'another'); expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }));
});
it('does not acknowledge a request when the durable write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('database unavailable'));
    await expect(createPrivacyRequest(ctx, 'new')).rejects.toThrow('database unavailable');
});
it('takes organization and user identity from the authenticated context', async () => {
    mocks.tx.auditLog.create.mockImplementation(async ({ data }) => ({ ...data, createdAt: new Date() }));
    await createPrivacyRequest(ctx, 'new'); const data = mocks.tx.auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'u1', branchId: 'b1', entityId: 'u1' }); expect(JSON.parse(data.details).organizationId).toBe('o1');
});
it('stores the operator response and a separate history event without deleting business data', async () => {
    mocks.tx.auditLog.findUnique.mockResolvedValue(row); mocks.tx.auditLog.findUniqueOrThrow.mockResolvedValue(row);
    mocks.tx.auditLog.update.mockImplementation(async ({ data }) => ({ ...row, ...data }));
    const result = await updatePrivacyRequest(ctx, row.id, 'IN_REVIEW', 'التحقق من الهوية جارٍ، وسنوضح نطاق المعالجة.');
    expect(result?.status).toBe('IN_REVIEW'); expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'UPDATE', entityId: row.id }) }));
});
