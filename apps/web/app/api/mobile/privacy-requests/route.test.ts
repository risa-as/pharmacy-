import { beforeEach, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
const m = vi.hoisted(() => ({ ctx: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: m.ctx }));
vi.mock('@/app/lib/prisma', () => ({ prisma: { auditLog: { findMany: m.find, count: m.count } } }));
vi.mock('@/app/lib/privacy-requests', () => ({ PRIVACY_ENTITY: 'PRIVACY_REQUEST', PRIVACY_STATUSES: ['REQUESTED', 'IN_REVIEW', 'COMPLETED', 'REJECTED'], privacyRequestView: (r: unknown) => r, createPrivacyRequest: m.create, updatePrivacyRequest: m.update }));
import { GET, POST } from './route';
import { GET as adminGET, PATCH } from '../../admin/privacy-requests/route';
const body = { id: 'e68ee047-4130-4ea8-a1e9-de1d30559e58', confirmed: true };
beforeEach(() => { vi.resetAllMocks(); m.ctx.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' }, organizationId: 'o1' }); m.find.mockResolvedValue([]); });
it('refuses unauthenticated reads and writes before touching persistence', async () => {
    m.ctx.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    expect((await GET()).status).toBe(401); expect((await POST(new Request('http://test', { method: 'POST', body: JSON.stringify(body) }))).status).toBe(401); expect(m.create).not.toHaveBeenCalled(); expect(m.find).not.toHaveBeenCalled();
});
it('returns only requests owned by the authenticated user', async () => {
    await GET(); expect(m.find).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', entity: 'PRIVACY_REQUEST', action: 'REQUEST' } }));
});
it('requires explicit confirmation', async () => {
    expect((await POST(new Request('http://test', { method: 'POST', body: JSON.stringify({ ...body, confirmed: false }) }))).status).toBe(400); expect(m.create).not.toHaveBeenCalled();
});
it('acknowledges persistence only and never claims that an account was deleted', async () => {
    m.create.mockResolvedValue({ id: 'u1.' + body.id, status: 'REQUESTED' });
    const r = await POST(new Request('http://test', { method: 'POST', body: JSON.stringify(body) }));
    expect(r.status).toBe(201); expect(await r.json()).toMatchObject({ status: 'REQUESTED' });
});
it('returns a retryable failure on persistence error', async () => {
    m.create.mockRejectedValue(new Error('offline')); expect((await POST(new Request('http://test', { method: 'POST', body: JSON.stringify(body) }))).status).toBe(503);
});
it('blocks every pharmacy role from the platform request queue and updates', async () => {
    expect((await adminGET(new Request('http://test'))).status).toBe(403);
    expect((await PATCH(new Request('http://test', { method: 'PATCH', body: JSON.stringify({ id: 'other', status: 'COMPLETED', response: 'anything long enough' }) }))).status).toBe(403);
    expect(m.find).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
});
