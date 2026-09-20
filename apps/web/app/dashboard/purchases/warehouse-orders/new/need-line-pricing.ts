// المرحلة 3: قاعدة اختيار السعر المعروض/المُرسَل لكل سطر في قائمة الاحتياج.
//
// المذخر يسعّر بالباكيت دوماً، والكمية المكتوبة في هذا السطر عدد باكيتات
// (خلفية الميزة). لكن السعر المخزَّن في السطر (opt.price / chosenPriceAtSelection)
// سعر شريط دوماً — يأتي من Batch.costPrice عبر api/purchases/supplier-prices.
// عرض سعر الشريط بجانب كمية بالباكيت بلا تحويل ولا وسم هو الخلل المُصلَح هنا:
// كل مبلغ كان يظهر على هذه الشاشة أصغر من الفاتورة الفعلية بمقدار عدد الأشرطة،
// بصمت. toPacketPrice في app/lib/pack-units.ts هي القاعدة الحسابية الوحيدة —
// هذا الملف لا يُكرّرها، بل يقرر متى تُستعمل ومتى لا، والوسم في الحالتين.
//
// نقطة التحويل الوحيدة عند حدود العرض والحمولة. لا تُخزَّن نتيجتها أبداً داخل
// NeedLine: opt.price و chosenPriceAtSelection يبقيان سعر شريط دائماً، لأن
// priceDrift في types.ts يقارنهما وسيكسر لو خُزِّن محوَّل في أحدهما دون الآخر.
//
// منطق نقيّ بلا React عمداً: vitest.config.ts يحمّل app/**/*.test.ts فقط.
import { toPacketPrice, STRIP_PRICE_LABEL } from '@/app/lib/pack-units';

/** وسم سعر الباكيت — يُعرض دوماً حين يكون المبلغ مشتقاً من ضرب سعر الشريط بالعدد. */
export const PACKET_PRICE_LABEL = 'للباكيت';

export interface LinePriceDisplay {
    /** المبلغ المعروض والمُستخدَم في الإجمالي والحمولة، أو null إن لم يوجد سعر مصدر. */
    amount: number | null;
    /** الوسم الواجب عرضه دوماً بجانب amount — الوحدتان لا تظهران معاً بلا وسم أبداً. */
    label: string;
}

/**
 * سعر السطر الذي يُعرض ويُستخدم في الحساب:
 * - تعبئة موثَّقة (unitsPerPack رقم صالح) ⇒ سعر الباكيت = سعر الشريط × العدد
 *   (toPacketPrice)، ووسمه PACKET_PRICE_LABEL.
 * - تعبئة غير موثَّقة (null/undefined/غير صالحة) ⇒ سعر الشريط كما هو دون أي
 *   ضرب، ووسمه STRIP_PRICE_LABEL صراحةً — لا يبقى بلا وسم أبداً.
 * - لا سعر مصدر أصلاً (stripPrice === null) ⇒ لا مبلغ إطلاقاً؛ لا يُخترَع رقم.
 */
export function resolveLinePrice(
    stripPrice: number | null,
    unitsPerPack: number | null | undefined
): LinePriceDisplay {
    if (stripPrice === null) return { amount: null, label: STRIP_PRICE_LABEL };
    const packetPrice = toPacketPrice(stripPrice, unitsPerPack);
    if (packetPrice !== null) return { amount: packetPrice, label: PACKET_PRICE_LABEL };
    return { amount: stripPrice, label: STRIP_PRICE_LABEL };
}
