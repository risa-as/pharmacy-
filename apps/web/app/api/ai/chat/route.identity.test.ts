import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
const mock = vi.hoisted(() => ({ tenant: vi.fn(), context: vi.fn(), provider: vi.fn(), reserve: vi.fn() }));
vi.mock('@/app/lib/tenant-utils', () => ({ getTenantContext: mock.tenant }));
vi.mock('@/app/lib/ai-assistant', () => ({ buildContext: mock.context, createProvider: mock.provider, providerConfig: () => ({ ok: false }), sanitizeHistory: () => [], SYSTEM_PROMPT: '' }));
vi.mock('@/app/lib/ai-usage', () => ({ reserveAiRequest: mock.reserve, completeAiRequest: vi.fn(), AI_PROVIDER_TIMEOUT_MS: 100 }));
import { POST } from './route';
describe('identity answers preserve access and bypass model usage', () => {
    beforeEach(() => { vi.clearAllMocks(); mock.tenant.mockResolvedValue({ user: { role: 'ADMIN' }, organizationId: 'demo' }); });
    it.each(['ما هو اسمك؟', 'ماذا انت؟', 'اي موديل انت؟'])('answers %s when the provider is unavailable', async message => {
        const response = await POST(new Request('http://localhost/api/ai/chat', { method: 'POST', body: JSON.stringify({ message }) }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ response: expect.stringContaining('مساعد فاراماس'), quotaUsed: false, cards: [] });
        expect(mock.context).not.toHaveBeenCalled();
        expect(mock.provider).not.toHaveBeenCalled();
        expect(mock.reserve).not.toHaveBeenCalled();
    });
    it('still requires the manager role', async () => {
        mock.tenant.mockResolvedValue({ user: { role: 'PHARMACIST' } });
        expect((await POST(new Request('http://localhost/api/ai/chat', { method: 'POST', body: JSON.stringify({message:'ما اسمك؟'}) }))).status).toBe(403);
    });
    it('still requires authentication', async () => {
        mock.tenant.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
        expect((await POST(new Request('http://localhost/api/ai/chat', { method: 'POST', body: JSON.stringify({message:'ما اسمك؟'}) }))).status).toBe(401);
    });
    it('returns catalog clarification without model invention or quota use',async()=>{
        mock.context.mockResolvedValue({context:'catalog',cards:[],categories:['drug_info'],directResponse:'## مرشحون للبحث\n1. Lipitor 20'});
        const r=await POST(new Request('http://localhost/api/ai/chat',{method:'POST',body:JSON.stringify({message:'هل عدنا ليبيتور؟'})}));
        expect(await r.json()).toMatchObject({response:expect.stringContaining('Lipitor 20'),quotaUsed:false});
        expect(mock.provider).not.toHaveBeenCalled();expect(mock.reserve).not.toHaveBeenCalled();
    });
});
