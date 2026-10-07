import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: vi.fn() }));
vi.mock('@/app/lib/ai-assistant', () => ({ providerConfig: vi.fn() }));
import { getTenantContext } from '@/app/lib/tenant-utils';
import { providerConfig } from '@/app/lib/ai-assistant';
import { GET } from '@/app/api/ai/status/route';
describe('AI status uses the shared mobile/web tenant authentication', () => {
    beforeEach(() => vi.resetAllMocks());
    it('returns status for an authenticated administrator without exposing keys', async () => {
        vi.mocked(getTenantContext).mockResolvedValue({ user: { role: 'ADMIN' } } as any);
        vi.mocked(providerConfig).mockReturnValue({ ok: true, provider: 'gemini' } as any);
        expect(await (await GET()).json()).toEqual({ configured: true, provider: 'gemini' });
    });
    it.each(['MANAGER', 'PHARMACIST', 'CASHIER', 'WAREHOUSE', 'SUPER_ADMIN'])('denies %s like chat', async role => {
        vi.mocked(getTenantContext).mockResolvedValue({ user: { role } } as any);
        expect((await GET()).status).toBe(403); expect(providerConfig).not.toHaveBeenCalled();
    });
    it.each([401, 403])('propagates authentication/revocation denial %i', async status => {
        const denied = NextResponse.json({ error: 'denied' }, { status }); vi.mocked(getTenantContext).mockResolvedValue(denied);
        expect(await GET()).toBe(denied); expect(providerConfig).not.toHaveBeenCalled();
    });
});
