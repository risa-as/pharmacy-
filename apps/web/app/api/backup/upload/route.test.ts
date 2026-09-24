import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ license: vi.fn(), branch: vi.fn(), backup: vi.fn(), upload: vi.fn() }));
vi.mock('uploadthing/server', () => ({ UTApi: class { uploadFiles = mocks.upload; } }));
vi.mock('@/app/lib/prisma', () => ({ prisma: {
    deviceLicense: { findFirst: mocks.license },
    branch: { findUnique: mocks.branch },
    backup: { create: mocks.backup },
} }));
import { POST } from './route';

const upload = (headers: Record<string, string>, branchId = 'foreign') => {
    const form = new FormData();
    form.append('file', new File(['db'], 'x.db'));
    form.append('branchId', branchId);
    return POST(new Request('http://localhost/api/backup/upload', { method: 'POST', body: form, headers }));
};

describe('backup upload auth (N05)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('BACKUP_SECRET_KEY', 'shared');
        mocks.branch.mockResolvedValue({ name: 'B', organizationId: 'orgA', organization: { name: 'O' } });
        mocks.upload.mockResolvedValue([{ data: { url: 'u', name: 'n', size: 2 } }]);
        mocks.backup.mockResolvedValue({ id: 'bk1' });
    });
    afterEach(() => vi.unstubAllEnvs());

    it('rejects the shared secret by default, so it cannot attribute a backup to any branch', async () => {
        expect((await upload({ 'x-backup-secret': 'shared' })).status).toBe(401);
        expect(mocks.backup).not.toHaveBeenCalled();
    });

    it('rejects the shared secret even when the old re-enable flag is set (the value is public)', async () => {
        vi.stubEnv('ALLOW_LEGACY_BACKUP_SECRET', 'true');
        expect((await upload({ 'x-backup-secret': 'shared' })).status).toBe(401);
        expect(mocks.backup).not.toHaveBeenCalled();
    });

    it('binds a license upload to the license branch, ignoring the body branch', async () => {
        mocks.license.mockResolvedValue({ branchId: 'own' });
        expect((await upload({ 'x-device-license-key': 'k', 'x-branch-id': 'own' })).status).toBe(200);
        expect(mocks.backup.mock.calls[0][0].data.branchId).toBe('own');
    });
});
