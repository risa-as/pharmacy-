import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock('@/app/lib/prisma', () => ({ prisma: { deviceLicense: { findFirst: db.findFirst } } }));
import { GET } from '../../api/sync/offline-token/route';

const license = { branch: { organization: { id: 'org', isSuspended: false, subscriptionEndsAt: null } } };
beforeEach(() => {
    vi.stubEnv('OFFLINE_TOKEN_PRIVATE_KEY', '');
    db.findFirst.mockReset().mockImplementation(async ({ where }: any) => (where.licenseKey === 'LIC' ? license : null));
});
const get = (query: string, headers: Record<string, string> = {}) =>
    GET(new NextRequest('https://app.test/api/sync/offline-token?' + query, { headers }));

it('accepts the license from the header (desktop 1.0.21+)', async () => {
    // 503 = license accepted, token signing not configured in this test.
    expect((await get('branchId=b', { 'x-device-license-key': 'LIC' })).status).toBe(503);
    expect(db.findFirst.mock.calls[0][0].where).toMatchObject({ branchId: 'b', licenseKey: 'LIC', isActive: true });
});

it('still accepts the query string from older desktops', async () => {
    expect((await get('branchId=b&licenseKey=LIC')).status).toBe(503);
});

it('refuses a missing or unknown license', async () => {
    expect((await get('branchId=b')).status).toBe(400);
    expect((await get('branchId=b', { 'x-device-license-key': 'OTHER' })).status).toBe(403);
});
