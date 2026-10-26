export type AIScope = 'assistant' | 'prescription';
export interface AIDisclosure {
    scope: AIScope; provider: string | null; available: boolean; revision: string;
    recipient: string; data: string; purpose: string; privacyUrl: string; providerPrivacyUrl: string;
}
type Dependencies = {
    owner: () => Promise<string>;
    generation: () => number;
    disclosure: (scope: AIScope) => Promise<AIDisclosure>;
    read: (key: string) => Promise<string | null>;
    write: (key: string, value: string) => Promise<void>;
    remove: (key: string) => Promise<void>;
};
export function createAIConsentService(deps: Dependencies) {
    const key = (owner: string, scope: AIScope) => `ai_consent_${scope}_${owner}`;
    async function current(scope: AIScope) {
        const generation = deps.generation();
        const owner = await deps.owner();
        if (!/^[a-zA-Z0-9._-]{1,150}$/.test(owner)) throw new Error('يلزم تسجيل الدخول قبل مشاركة البيانات.');
        const disclosure = await deps.disclosure(scope);
        if (disclosure.scope !== scope || !disclosure.available || !disclosure.provider || !disclosure.revision)
            throw new Error('خدمة الذكاء الاصطناعي غير جاهزة؛ لم تُرسل بياناتك.');
        const valid = async () => {
            if (deps.generation() !== generation || await deps.owner() !== owner) throw new Error('تغير الحساب؛ أعد فتح الشاشة من الحساب الحالي.');
        };
        await valid();
        return { owner, disclosure, valid, storageKey: key(owner, scope) };
    }
    return {
        async authorize(scope: AIScope, confirm: (d: AIDisclosure) => Promise<boolean>) {
            const c = await current(scope);
            if (await deps.read(c.storageKey) === c.disclosure.revision) { await c.valid(); return true; }
            if (!await confirm(c.disclosure)) return false;
            await c.valid();
            await deps.write(c.storageKey, c.disclosure.revision);
            if (await deps.read(c.storageKey) !== c.disclosure.revision) throw new Error('تعذر حفظ الموافقة؛ لم تُرسل بياناتك.');
            await c.valid();
            return true;
        },
        async require(scope: AIScope): Promise<Record<string, string>> {
            const c = await current(scope);
            if (await deps.read(c.storageKey) !== c.disclosure.revision) throw new Error('راجع موافقة مشاركة البيانات قبل استخدام هذه الخدمة.');
            await c.valid();
            return { 'x-faramace-client': 'mobile-privacy-v1', 'x-faramace-ai-consent': c.disclosure.revision };
        },
        async status(scope: AIScope) {
            const c = await current(scope);
            const granted = await deps.read(c.storageKey) === c.disclosure.revision;
            await c.valid();
            return { disclosure: c.disclosure, granted };
        },
        async revoke(scope: AIScope) {
            const owner = await deps.owner();
            if (!/^[a-zA-Z0-9._-]{1,150}$/.test(owner)) throw new Error('يلزم تسجيل الدخول.');
            const storageKey = key(owner, scope);
            await deps.remove(storageKey);
            if (await deps.read(storageKey) != null) throw new Error('تعذر سحب الموافقة؛ حاول مجدداً.');
        },
    };
}
