import { describe, expect, it } from 'vitest';
import { ASSISTANT_IDENTITY_RESPONSE, isAssistantIdentityQuestion } from '../assistant-identity';
describe('Faramace product identity', () => {
    it.each(['ما هو اسمك؟', 'ماذا أنت؟', 'اي موديل انت', 'أي نموذج تستخدم؟', 'شنو اسمك', 'منو انت؟', 'انت شنو؟', 'اسمك شنو؟', 'شنو تكدر تسوي؟', 'من أنت؟', 'عرّف نفسك', 'من برمجك؟', 'هل انت ذكاء اصطناعي؟', 'what is your name?', 'who are you?', 'which model are you?', 'what model are you using?'])('recognizes %s', question => {
        expect(isAssistantIdentityQuestion(question)).toBe(true);
    });
    it.each(['كم مبيعات اليوم؟', 'ما ديون الموردين؟', 'شنو اسم الدواء؟', 'هل هناك حركات مشبوهة؟', 'ما هو اسمك وكم مبيعات اليوم؟'])('keeps pharmacy questions on their data path: %s', question => {
        expect(isAssistantIdentityQuestion(question)).toBe(false);
    });
    it('identifies the product without inventing a provider model', () => {
        expect(ASSISTANT_IDENTITY_RESPONSE).toContain('مساعد فاراماس');
        expect(ASSISTANT_IDENTITY_RESPONSE).not.toMatch(/GPT|Gemini|إنسان/);
    });
});
