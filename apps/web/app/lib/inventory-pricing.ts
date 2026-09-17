// جزء ألف من المرحلة 2 لميزة المذاخر: تسعير أول دفعة تُنشئ سطر مخزون جديد.
// Inventory.price و Inventory.cost إلزاميان بلا قيمة افتراضية في المخطط — عند استلام
// دواء لم يُخزَّن من قبل (الحالة الطبيعية عند الشراء من مذخر) يجب اشتقاق سعر بيع
// ابتدائي بدل ترك الاستلام يفشل أو يُسقط الكمية بصمت.
export interface DecideNewInventoryPricingInput {
  cost: number;
  /** هامش الربح الأدنى للمنظمة (Organization.minProfitMargin) كنسبة مئوية — قد يغيب. */
  minProfitMargin: number | null | undefined;
}

export interface DecideNewInventoryPricingResult {
  price: number;
  cost: number;
}

/** الهامش الافتراضي عند غياب/عطب minProfitMargin — يطابق Organization.minProfitMargin @default(5). */
const DEFAULT_MIN_PROFIT_MARGIN = 5;

/**
 * price = cost * (1 + minProfitMargin/100)، مع سقوط الهامش إلى 5% إن كان
 * null/undefined/غير منتهٍ (NaN/Infinity). كلفة غير منتهية أو سالبة تُرجع
 * {price: 0, cost: 0} بدل NaN — سطر مخزون بسعر NaN يكسر كل حساب لاحق (فاتورة
 * بيع، هامش ربح، تقرير) بصمت، فرفض القيمة عند المصدر أوضح من نشرها.
 *
 * التقريب: أقرب دينار عراقي صحيح (Math.round) — لا كسور دون الدينار في التسعير
 * أو الفوترة محلياً، فالتقريب الحسابي المعتاد (0.5 لأعلى) هو الأبسط والأتوقع هنا.
 */
export function decideNewInventoryPricing(
  input: DecideNewInventoryPricingInput
): DecideNewInventoryPricingResult {
  const { cost } = input;

  if (!Number.isFinite(cost) || cost < 0) {
    return { price: 0, cost: 0 };
  }

  const margin = Number.isFinite(input.minProfitMargin)
    ? (input.minProfitMargin as number)
    : DEFAULT_MIN_PROFIT_MARGIN;

  const price = Math.round(cost * (1 + margin / 100));
  return { price, cost };
}
