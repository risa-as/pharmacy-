import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ tenant: vi.fn(), feature: vi.fn(), branch: vi.fn(), list: vi.fn(), count: vi.fn(), create: vi.fn() }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: mocks.tenant }));
vi.mock('@/app/lib/saas-guards', () => ({ checkFeatureAccess: mocks.feature }));
vi.mock('@/app/lib/prisma', () => ({ prisma: {
    branch: { findFirst: mocks.branch },
    marketplaceListing: { findMany: mocks.list, count: mocks.count, create: mocks.create },
} }));
import { GET, POST } from './route';

const ctx = { user: { id: 'u1', role: 'PHARMACIST', branchId: 'own' }, organizationId: 'orgA', branchModelWhere: { id: 'own' } };
const post = (body: object) => POST(new Request('http://localhost/api/marketplace', { method: 'POST', body: JSON.stringify(body) }) as any);

describe('marketplace listings (N06, N07)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.tenant.mockResolvedValue(ctx);
        mocks.feature.mockResolvedValue({ allowed: true });
        mocks.branch.mockImplementation(async (args: any) => (args.where.AND[1].id === 'own' ? { id: 'own' } : null));
        mocks.list.mockResolvedValue([]);
        mocks.count.mockResolvedValue(0);
        mocks.create.mockImplementation(async ({ data }: any) => ({ id: 'l1', ...data }));
    });

    it('no longer lets an unauthenticated caller browse listings', async () => {
        mocks.tenant.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
        expect((await GET(new Request('http://localhost/api/marketplace') as any)).status).toBe(401);
        expect(mocks.list).not.toHaveBeenCalled();
    });

    it('refuses to list stock on behalf of a foreign branch', async () => {
        expect((await post({ drugId: 'd1', quantity: 3, unitPrice: 5, branchId: 'foreign' })).status).toBe(403);
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('creates the listing for the caller\'s own branch', async () => {
        expect((await post({ drugId: 'd1', quantity: 3, unitPrice: 5 })).status).toBe(201);
        expect(mocks.create.mock.calls[0][0].data).toMatchObject({ sellerId: 'own', quantity: 3 });
    });
});
