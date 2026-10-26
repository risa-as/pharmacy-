import { afterEach, expect, it, vi } from 'vitest';
import { aiDisclosure, mobileAIConsentDenied } from './ai-disclosure';
afterEach(() => vi.unstubAllEnvs());
it('returns only public disclosure data and changes revision with the provider', () => {
    const a = aiDisclosure('assistant', { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'private-key' });
    const b = aiDisclosure('assistant', { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'other-key' });
    expect(a.available).toBe(true); expect(a.revision).not.toBe(b.revision); expect(JSON.stringify(a)).not.toContain('private-key');
});
it('does not confuse Google Vision and Gemini approvals', () => {
    expect(aiDisclosure('prescription', { PRESCRIPTION_SCAN_PROVIDER: 'vision', GOOGLE_VISION_API_KEY: 'key' }).revision).not.toBe(aiDisclosure('prescription', { GEMINI_API_KEY: 'key' }).revision);
});
it('refuses a mobile request without the selected provider revision before processing', () => {
    vi.stubEnv('AI_PROVIDER', 'openai'); vi.stubEnv('OPENAI_API_KEY', 'key');
    const req = new Request('http://test', { headers: { 'x-faramace-client': 'mobile-privacy-v1', 'x-faramace-ai-consent': 'old-google-approval' } });
    expect(mobileAIConsentDenied(req, 'assistant')?.status).toBe(428);
});
it('accepts the current mobile revision and preserves legacy client behavior', () => {
    vi.stubEnv('AI_PROVIDER', 'openai'); vi.stubEnv('OPENAI_API_KEY', 'key');
    const req = new Request('http://test', { headers: { 'x-faramace-client': 'mobile-privacy-v1', 'x-faramace-ai-consent': aiDisclosure('assistant').revision } });
    expect(mobileAIConsentDenied(req, 'assistant')).toBeNull(); expect(mobileAIConsentDenied(new Request('http://test'), 'assistant')).toBeNull();
});
