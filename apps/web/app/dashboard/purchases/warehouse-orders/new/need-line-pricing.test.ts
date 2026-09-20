import { describe, it, expect } from 'vitest';
import { resolveLinePrice, PACKET_PRICE_LABEL } from './need-line-pricing';
import { STRIP_PRICE_LABEL } from '@/app/lib/pack-units';

describe('resolveLinePrice', () => {
    it('تعبئة موثَّقة ⇒ سعر الباكيت = سعر الشريط × العدد، ووسم الباكيت', () => {
        expect(resolveLinePrice(500, 10)).toEqual({ amount: 5000, label: PACKET_PRICE_LABEL });
    });

    it('تعبئة غير موثَّقة (null) ⇒ سعر الشريط كما هو بلا ضرب، ووسم الشريط', () => {
        expect(resolveLinePrice(500, null)).toEqual({ amount: 500, label: STRIP_PRICE_LABEL });
    });

    it('تعبئة غير موثَّقة (undefined) ⇒ نفس نتيجة null', () => {
        expect(resolveLinePrice(500, undefined)).toEqual({ amount: 500, label: STRIP_PRICE_LABEL });
    });

    it('لا سعر مصدر أصلاً ⇒ بلا مبلغ إطلاقاً، لا يُخترَع رقم', () => {
        expect(resolveLinePrice(null, 10)).toEqual({ amount: null, label: STRIP_PRICE_LABEL });
        expect(resolveLinePrice(null, null)).toEqual({ amount: null, label: STRIP_PRICE_LABEL });
    });

    it('عدد أشرطة غير صالح (صفر أو سالب أو كسري) يُعامَل كمجهول فلا يُضرَب', () => {
        expect(resolveLinePrice(500, 0)).toEqual({ amount: 500, label: STRIP_PRICE_LABEL });
        expect(resolveLinePrice(500, -3)).toEqual({ amount: 500, label: STRIP_PRICE_LABEL });
        expect(resolveLinePrice(500, 2.5)).toEqual({ amount: 500, label: STRIP_PRICE_LABEL });
    });

    it('سعر شريط صفر (سطر بونص) مع تعبئة موثَّقة يبقى صفراً موسوماً بالباكيت', () => {
        expect(resolveLinePrice(0, 10)).toEqual({ amount: 0, label: PACKET_PRICE_LABEL });
    });
});
