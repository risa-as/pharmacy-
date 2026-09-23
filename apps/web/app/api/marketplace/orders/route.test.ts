import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
    tenant: vi.fn(), feature: vi.fn(), branch: vi.fn(), orders: vi.fn(),
    listing: vi.fn(), reserve: vi.fn(), create: vi.fn(), transaction: vi.fn(),
}));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: mocks.tenant }));
vi.mock('@/app/lib/saas-guards', () => ({ checkFeatureAccess: mocks.feature }));
vi.mock('@/app/lib/prisma', () => {
    const tx = {
        marketplaceListing: { findUnique: mocks.listing, updateMany: mocks.reserve },
        marketplaceOrder: { create: mocks.create },
    };
    return { prisma: {
        branch: { findFirst: mocks.branch },
        marketplaceOrder: { findMany: mocks.orders },
        $transaction: mocks.transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
    } };
});
import { GET, POST } from './route';

// Pharmacist of org A, own branch "own"; "foreign" belongs to another organization.
const ctx = { user: { id: 'u1', role: 'PHARMACIST', branchId: 'own' }, organizationId: 'orgA', branchModelWhere: { id: 'own' } };
const inScope = (args: any) => (args.where.AND[1].id === 'own' ? { id: 'own' } : null);
const get = (qs = '') => GET(new Request(`http://localhost/api/marketplace/orders${qs}`) as any);
const post = (body: object) => POST(new Request('http://localhost/api/marketplace/orders', { method: 'POST', body: JSON.stringify(body) }) as any);

describe('marketplace orders scope (N03)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.tenant.mockResolvedValue(ctx);
        mocks.feature.mockResolvedValue({ allowed: true });
        mocks.branch.mockImplementation(async (args: any) => inScope(args));
        mocks.orders.mockResolvedValue([]);
    });

    it('rejects unauthenticated and warehouse callers before any query', async () => {
        mocks.tenant.mockResolvedValue(NextResponse.json({ error: 'Warehouse accounts cannot access pharmacy data' }, { status: 403 }));
        expect((await get()).status).toBe(403);
        expect(mocks.orders).not.toHaveBeenCalled();
    });

    it('rejects an unknown role instead of returning every organization\'s orders', async () => {
        expect((await get('?role=x')).status).toBe(400);
        expect(mocks.orders).not.toHaveBeenCalled();
    });

    it('rejects a branchId outside the caller scope', async () => {
        expect((await get('?branchId=foreign')).status).toBe(403);
        expect(mocks.branch.mock.calls[0][0].where).toEqual({ AND: [{ id: 'own' }, { id: 'foreign' }] });
        expect(mocks.orders).not.toHaveBeenCalled();
    });

    it('rejects a caller with no branch instead of an empty filter', async () => {
        mocks.tenant.mockResolvedValue({ ...ctx, user: { ...ctx.user, branchId: undefined }, branchModelWhere: { organizationId: 'orgA' } });
        expect((await get()).status).toBe(403);
        expect(mocks.orders).not.toHaveBeenCalled();
    });

    it('filters buyer and seller views by the resolved own branch', async () => {
        await get();
        expect(mocks.orders.mock.calls[0][0].where).toEqual({ buyerId: 'own' });
        await get('?role=seller');
        expect(mocks.orders.mock.calls[1][0].where).toEqual({ listing: { sellerId: 'own' } });
    });

    it('enforces the marketplace plan gate', async () => {
        mocks.feature.mockResolvedValue({ allowed: false });
        expect((await get()).status).toBe(403);
        expect(mocks.orders).not.toHaveBeenCalled();
    });

    it('refuses to create an order on behalf of a foreign branch', async () => {
        expect((await post({ listingId: 'l1', quantity: 1, branchId: 'foreign' })).status).toBe(403);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
});

describe('marketplace order atomicity', () => {
    const listing = { id: 'l1', sellerId: 'seller', status: 'ACTIVE', minOrderQty: 1, quantity: 5, unitPrice: 10 };
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.tenant.mockResolvedValue(ctx);
        mocks.feature.mockResolvedValue({ allowed: true });
        mocks.branch.mockImplementation(async (args: any) => inScope(args));
        mocks.listing.mockResolvedValue(listing);
        mocks.create.mockImplementation(async ({ data }: any) => ({ id: 'o1', ...data }));
    });

    it('rejects non-integer or non-positive quantities', async () => {
        for (const quantity of [0, -2, 1.5, '3']) {
            expect((await post({ listingId: 'l1', quantity })).status).toBe(400);
        }
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it('decrements stock conditionally inside the transaction and prices from the listing', async () => {
        mocks.reserve.mockResolvedValue({ count: 1 });
        const res = await post({ listingId: 'l1', quantity: 2 });
        expect(res.status).toBe(201);
        expect(mocks.reserve.mock.calls[0][0]).toEqual({
            where: { id: 'l1', status: 'ACTIVE', quantity: { gte: 2 } },
            data: { quantity: { decrement: 2 } },
        });
        expect(mocks.create.mock.calls[0][0].data).toMatchObject({ buyerId: 'own', quantity: 2, totalPrice: 20 });
    });

    it('returns 409 and creates no order when a concurrent order took the stock', async () => {
        mocks.reserve.mockResolvedValue({ count: 0 });
        expect((await post({ listingId: 'l1', quantity: 5 })).status).toBe(409);
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('refuses buying from the caller\'s own listing', async () => {
        mocks.listing.mockResolvedValue({ ...listing, sellerId: 'own' });
        expect((await post({ listingId: 'l1', quantity: 1 })).status).toBe(400);
        expect(mocks.reserve).not.toHaveBeenCalled();
    });
});
