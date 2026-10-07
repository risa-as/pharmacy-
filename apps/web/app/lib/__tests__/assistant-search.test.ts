import { describe, expect, it } from 'vitest';
import { drugSearchTerms, extractDebtName } from '../assistant-search';
import { resolveQuestion, classifyQuestion, extractDateRange } from '../ai-assistant';
import { vi } from 'vitest';
vi.mock('@/app/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/app/lib/saas-guards', () => ({ checkFeatureAccess: vi.fn() }));
describe('explicit assistant searches', () => {
    it('recognizes Iraqi drug questions and calendar periods',()=>{
        expect(classifyQuestion('هل عدنا ليبيتور؟')).toContain('drug_info');
        expect(classifyQuestion('شكد سعر ليبيتور؟')).toContain('drug_info');
        expect(classifyQuestion('شكد بعنا اليوم؟')).toEqual(['sales_summary']);
        expect(classifyQuestion('ما هي الطلبات التي لم تصل بعد؟')).toEqual(['purchases']);
        const now=new Date('2026-10-06T10:00:00Z');
        expect(extractDateRange('شكد ربحنا هالشهر؟',now)).toEqual(extractDateRange('كم ربحنا هذا الشهر؟',now));
    });
    it('re-reads a selected catalog name after a candidate list',()=>{
        const h=[{role:'assistant' as const,content:'## مرشحون للبحث\n1. **Lipitor 20** — Atorvastatin'}];
        expect(resolveQuestion('1',h).dataMessage).toBe('معلومات دواء Lipitor 20');
        expect(resolveQuestion('Lipitor 20',h).categories).toEqual(['drug_info']);
    });
    it.each([['باراسيتامول','paracetamol'],['البندول','panadol'],['أموكسيسيلين','amoxicillin'],['إيبوبروفين','ibuprofen'],['الأسبرين','aspirin']])('maps %s to %s without inventing treatment alternatives', (input, term) => expect(drugSearchTerms(input)).toContain(term));
    it('keeps unknown names instead of guessing', () => expect(drugSearchTerms('ميدازيل')).toEqual(['ميدازيل']));
    it('extracts the requested party', () => {
        expect(extractDebtName('كم دين المريض أحمد علي؟','patient')).toBe('أحمد علي');
        expect(extractDebtName('ما ديون المورد مذخر التفوق؟','supplier')).toBe('مذخر التفوق');
        expect(extractDebtName('كم دين المريض؟','patient')).toBeNull();
        expect(extractDebtName('ما ديون الموردين؟','supplier')).toBeNull();
    });
    it('uses a name supplied after a clarification without swallowing thanks or a new question', () => {
        const history = [{ role:'user' as const, content:'كم دين المريض؟' }];
        expect(resolveQuestion('أحمد علي',history).dataMessage).toContain('أحمد علي');
        expect(resolveQuestion('أحمد علي',history).categories).toEqual(['customer_debts']);
        expect(resolveQuestion('شكرا',history).categories).toEqual(['general']);
        expect(resolveQuestion('كم مبيعات اليوم؟',history).categories).toEqual(['sales_summary']);
    });
});
