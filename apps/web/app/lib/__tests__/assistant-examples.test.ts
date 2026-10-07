import { describe, expect, it, vi } from 'vitest';
vi.mock('@/app/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/app/lib/saas-guards', () => ({ checkFeatureAccess: vi.fn() }));
import { EXAMPLE_CATEGORIES } from '../assistant-examples';
import { classifyQuestion, extractDateRange, extractSearchTerm } from '../ai-assistant';

const expected = ['sales_summary', 'financial', 'inventory', 'purchases', 'cashier_performance', 'suspicious', 'drug_info', 'customer_debts'];
describe('every advertised chat example routes to the data needed to answer it', () => {
    EXAMPLE_CATEGORIES.forEach((category, index) => {
        it.each(category.questions)('%s', q => {
            const wanted = index === 2 && /البطيئة|لا تتحرك|دفن/.test(q) ? 'slow_movers'
                : index === 4 && /الشيفت/.test(q) ? 'shifts'
                : index === 1 && /خصم/.test(q) ? 'sales_summary' : expected[index];
            expect(classifyQuestion(q)).toContain(wanted);
            expect(classifyQuestion(q)).not.toContain('general');
        });
    });
});
describe('all advertised sales periods are exact Baghdad calendar ranges', () => {
    const now = new Date('2026-09-30T15:00:00Z');
    it.each([
        ['كم مبيعات اليوم؟', '2026-09-29T21:00:00.000Z', '2026-09-30T20:59:59.999Z'],
        ['ما هي مبيعات الأسبوع الماضي؟', '2026-09-18T21:00:00.000Z', '2026-09-25T20:59:59.999Z'],
        ['كم فاتورة صدرت هذا الأسبوع؟', '2026-09-25T21:00:00.000Z', '2026-09-30T20:59:59.999Z'],
        ['ما إجمالي المبيعات لشهر نيسان؟', '2026-03-31T21:00:00.000Z', '2026-04-30T20:59:59.999Z'],
        ['ما مبيعات شهر 3؟', '2026-02-28T21:00:00.000Z', '2026-03-31T20:59:59.999Z'],
        ['كم مبيعات الشهر الماضي؟', '2026-07-31T21:00:00.000Z', '2026-08-31T20:59:59.999Z'],
        ['ما الكمية المباعة اليوم؟', '2026-09-29T21:00:00.000Z', '2026-09-30T20:59:59.999Z'],
        ['ما إجمالي المبيعات في آخر 7 أيام؟', '2026-09-23T21:00:00.000Z', '2026-09-30T20:59:59.999Z'],
    ])('%s', (question, from, to) => {
        const period = extractDateRange(question, now);
        expect([period.from.toISOString(), period.to.toISOString()]).toEqual([from, to]);
    });
    it('week resets on Saturday at Baghdad midnight, including year boundaries', () => {
        const r = extractDateRange('هذا الأسبوع', new Date('2027-01-01T21:01:00Z'));
        expect(r.from.toISOString()).toBe('2027-01-01T21:00:00.000Z');
    });
});
describe('drug names are preserved and do not request an unrelated financial report', () => {
    it.each([
        ['كم سعر الباراسيتامول؟', 'باراسيتامول'], ['هل لدينا أموكسيسيلين؟', 'أموكسيسيلين'],
        ['هل يوجد إيبوبروفين؟', 'إيبوبروفين'], ['كم كمية البندول؟', 'بندول'],
        ['ما تكلفة الأسبرين؟', 'أسبرين'], ['كم ثمن ميدازيل؟', 'ميدازيل'],
    ])('%s', (q, name) => {
        expect(extractSearchTerm(q)).toBe(name);
        expect(classifyQuestion(q)).not.toContain('financial');
    });
});
