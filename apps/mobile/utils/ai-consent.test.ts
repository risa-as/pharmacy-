import { expect, it, vi } from 'vitest';
import { createAIConsentService, type AIDisclosure } from './ai-consent';
function setup() {
    const values = new Map<string, string>(); let user = 'u1', generation = 1;
    const disclosure: AIDisclosure = { scope: 'assistant', provider: 'google-gemini', available: true, revision: 'v1:gemini', recipient: 'Google Gemini', data: 'question', purpose: 'answer', privacyUrl: 'https://www.faramace.com/privacy#ai', providerPrivacyUrl: 'https://policies.google.com/privacy' };
    const write = vi.fn(async (k: string, v: string) => { values.set(k, v); });
    const service = createAIConsentService({ owner: async () => user, generation: () => generation, disclosure: async scope => ({ ...disclosure, scope }), read: async k => values.get(k) ?? null, write, remove: async k => { values.delete(k); } });
    return { service, disclosure, values, write, switchUser: () => { user = 'u2'; generation++; } };
}
it('blocks transmission without consent and does not persist a refusal', async () => {
    const s = setup(); await expect(s.service.require('assistant')).rejects.toThrow();
    expect(await s.service.authorize('assistant', async () => false)).toBe(false); expect(s.write).not.toHaveBeenCalled();
});
it('requires the actual recipient to be shown and then permits the same revision', async () => {
    const s = setup(); const confirm = vi.fn(async (_d: AIDisclosure) => true); await s.service.authorize('assistant', confirm);
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({ recipient: 'Google Gemini' });
    await expect(s.service.require('assistant')).resolves.toMatchObject({ 'x-faramace-ai-consent': 'v1:gemini' });
});
it('rejects changed providers until a new consent is granted', async () => {
    const s = setup(); await s.service.authorize('assistant', async () => true); s.disclosure.provider = 'openai'; s.disclosure.revision = 'v1:openai';
    await expect(s.service.require('assistant')).rejects.toThrow();
});
it('does not share consent across services or users', async () => {
    const s = setup(); await s.service.authorize('assistant', async () => true); await expect(s.service.require('prescription')).rejects.toThrow(); s.switchUser(); await expect(s.service.require('assistant')).rejects.toThrow();
});
it('does not save approval if the account changes while the prompt is open', async () => {
    const s = setup(); await expect(s.service.authorize('assistant', async () => { s.switchUser(); return true; })).rejects.toThrow('تغير الحساب'); expect(s.write).not.toHaveBeenCalled();
});
it('blocks sending when approval was not durably saved', async () => {
    const s = setup(); s.write.mockImplementationOnce(async () => {}); await expect(s.service.authorize('assistant', async () => true)).rejects.toThrow();
});
it('revocation blocks the next request without removing other saved data', async () => {
    const s = setup(); s.values.set('pending-sale', 'keep'); await s.service.authorize('assistant', async () => true); await s.service.revoke('assistant');
    await expect(s.service.require('assistant')).rejects.toThrow(); expect(s.values.get('pending-sale')).toBe('keep');
});
