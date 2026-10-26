import { NextResponse } from 'next/server';

export type AIScope = 'assistant' | 'prescription';
export const AI_POLICY_VERSION = '2026-10-26.1';
/** Public descriptions only. Never return keys, model credentials or prompts. */
export function aiDisclosure(scope: AIScope, env: Record<string, string | undefined> = process.env) {
    const selected = scope === 'prescription' ? (env.PRESCRIPTION_SCAN_PROVIDER || 'gemini').toLowerCase() : env.AI_PROVIDER?.trim().toLowerCase();
    const provider = selected === 'openai' && scope === 'assistant' ? 'openai'
        : selected === 'gemini' ? 'google-gemini' : selected === 'vision' && scope === 'prescription' ? 'google-vision' : null;
    const credential = provider === 'openai' ? env.OPENAI_API_KEY : provider === 'google-vision' ? env.GOOGLE_VISION_API_KEY : env.GEMINI_API_KEY;
    return {
        scope, provider, available: !!provider && !!credential?.trim(),
        revision: `${AI_POLICY_VERSION}:${scope}:${provider ?? 'unavailable'}`,
        recipient: provider === 'openai' ? 'OpenAI' : provider === 'google-vision' ? 'Google Cloud Vision' : 'Google Gemini',
        data: scope === 'prescription' ? 'صورة الوصفة بما قد تحتويه من اسم المريض أو بيانات صحية.' : 'نص سؤالك وسجل المحادثة والسياق اللازم من مبيعات المؤسسة ومخزونها وحساباتها؛ قد يتضمن أسماء زبائن عند السؤال عن ديونهم.',
        purpose: scope === 'prescription' ? 'استخراج أسماء الأدوية ومطابقتها بالمخزون. لا تصدر الخدمة وصفة أو قراراً علاجياً؛ راجع النتيجة مع الوصفة الأصلية.' : 'إعداد إجابة عن بيانات المؤسسة. لا تستخدم المساعد لإرسال تفاصيل علاجية أو لطلب تشخيص أو وصف علاج.',
        privacyUrl: 'https://www.faramace.com/privacy#ai',
        providerPrivacyUrl: provider === 'openai' ? 'https://openai.com/policies/privacy-policy/' : 'https://policies.google.com/privacy',
    };
}
export function mobileAIConsentDenied(req: Request, scope: AIScope) {
    // Existing web/desktop clients have their own UI; enforce the new mobile
    // contract without silently enabling a different provider after consent.
    if (req.headers.get('x-faramace-client') !== 'mobile-privacy-v1') return null;
    const disclosure = aiDisclosure(scope);
    if (!disclosure.available || req.headers.get('x-faramace-ai-consent') !== disclosure.revision)
        return NextResponse.json({ error: 'تغير إعداد خدمة الذكاء الاصطناعي؛ راجع الموافقة قبل الإرسال.', code: 'AI_CONSENT_REQUIRED' }, { status: 428 });
    return null;
}
