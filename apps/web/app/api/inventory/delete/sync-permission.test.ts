import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sync: vi.fn(), scope: vi.fn(), find: vi.fn(), del: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/lib/sync-auth', async (importActual) => ({
    ...(await importActual<typeof import('@/app/lib/sync-auth')>()),
    validateSyncUser: mocks.sync,
    isBranchInSyncScope: mocks.scope,
}));
vi.mock('@/app/lib/audit', () => ({ logAudit: vi.fn(), resolveUserName: vi.fn() }));
vi.mock('@/app/lib/prisma', () => ({ prisma: {
    inventory: { findUnique: mocks.find, delete: mocks.del },
    $transaction: vi.fn(),
} }));
import { POST } from './route';
import { hasSyncPermission } from '@/app/lib/sync-auth';

const del = () => POST(new Request('http://localhost/api/inventory/delete', { method: 'POST', body: JSON.stringify({ inventoryId: 'i1' }) }));

describe('granular permissions on desktop sync commands (N02)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.scope.mockResolvedValue(true);
        mocks.find.mockResolvedValue({ branchId: 'b1' });
    });

    it('rejects a desktop delete when canDeleteDrug was revoked on the web', async () => {
        mocks.sync.mockResolvedValue({ id: 'u1', role: 'PHARMACIST', branchId: 'b1', organizationId: 'o', permissions: JSON.stringify({ canDeleteDrug: false }) });
        const res = await del();
        expect(res.status).toBe(403);
        expect((await res.json()).ack.status).toBe('noop');
        expect(mocks.del).not.toHaveBeenCalled();
    });

    it('applies role defaults and overrides the same way as the web', () => {
        expect(hasSyncPermission({ id: 'u', role: 'CASHIER' }, 'canDeleteDrug')).toBe(false);
        expect(hasSyncPermission({ id: 'u', role: 'ADMIN' }, 'canDeleteDrug')).toBe(true);
        expect(hasSyncPermission({ id: 'u', role: 'PHARMACIST', permissions: JSON.stringify({ canSell: false }) }, 'canSell')).toBe(false);
    });

    it('leaves license-key devices unchecked (no person to hold permissions; tracked open)', () => {
        expect(hasSyncPermission({ id: 'lic', role: 'DEVICE' }, 'canDeleteDrug')).toBe(true);
    });
});
