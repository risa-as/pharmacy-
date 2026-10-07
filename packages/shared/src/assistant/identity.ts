/** Product identity answers do not require a model or pharmacy data. */
export const ASSISTANT_IDENTITY_RESPONSE = 'أنا مساعد فاراماس الذكي الخاص بك، موجود لمساعدتك في متابعة شغل الصيدلية وفهم مبيعاتك ومخزونك وتقاريرك.';

export function isAssistantIdentityQuestion(message: string): boolean {
    const text = message.toLowerCase().replace(/[ً-ْٰـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim();
    const identity = /(?:ما|شنو|شني|ايش|وش|what).*(?:اسمك|موديلك|نموذجك|دورك|وظيفتك|model|your name|are you)|(?:من|ماذا|شنو|شني|ايش|وش)\s+(?:(?:هو|هي|هوا)\s+)?انت|(?:اي|يا|which)\s+(?:موديل|نموذج|model)|(?:عرف|عرّف|قدم)\s+(?:نفسك|عن نفسك)|(?:من|مين)\s+(?:صنعك|طورك|برمجك)|(?:هل انت|انت)\s+(?:ذكاء اصطناعي|روبوت|بوت|chatgpt|gemini|gpt)|who (?:are|made) you|introduce yourself/.test(text);
    // A mixed business request still needs its data; its identity part is handled
    // by the provider instructions instead of swallowing the business question.
    const iraqiIdentity = /منو\s+انت|انت\s+(?:منو|شنو)|اسمك\s+(?:شنو|شني)|شنو\s+(?:تكدر|تقدر)\s+تسوي|شلون تساعدني|كيف تساعدني|ماذا تستطيع/.test(text);
    return (identity || iraqiIdentity) && !/مبيعات|مخزون|ارباح|ربحنا|كم ربح|مصاريف|ديون|فاتوره|فاتورة|الادويه|دواء|sales|inventory|profit/.test(text);
}
