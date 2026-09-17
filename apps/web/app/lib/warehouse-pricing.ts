// المرحلة 5 من نظام المذاخر B2B (الصقل التجاري): منطق نقي بالكامل — بلا
// استيراد Prisma وبلا next/*، قابل للاختبار مباشرة تحت إعداد vitest في هذا
// المستودع (الذي لا يحل alias "@/*")، مطابقاً لنفس انضباط
// app/lib/warehouse-quote.ts وapp/lib/warehouse-accounts.ts.
//
// يغطي هذا الملف قسمين مستقلّين تماماً من §Part 2 و§Part 3 في مواصفة
// المرحلة 5:
//   - resolveTierPrice: أي سعر تراه صيدلية معيّنة لصنف معيّن، بحسب شريحة
//     تسعيرها لدى هذا المذخر (WarehouseCustomer.priceTier).
//   - applyBulkPriceChange: تعديل سعر جماعي (نسبة أو مبلغ ثابت) على أصناف
//     الكتالوج، بحماية صارمة ضد إنتاج سعر صفري أو سالب.

// ── شريحة التسعير ────────────────────────────────────────────────────────────

export type TierPriceSource = "TIER" | "LIST";

export interface ResolveTierPriceInput {
  listPrice: number;
  tier?: string | null;
  tierPrices?: Array<{ tier: string; price: number }>;
}

export interface ResolveTierPriceResult {
  price: number;
  source: TierPriceSource;
}

/**
 * يطبّع اسم شريحة التسعير للمقارنة: قص المسافات + تحويل لحروف كبيرة. الشريحة
 * نص حر يضبطه المذخر (لا enum مشترك) — priceTier في CustomersClient.tsx حقل
 * إدخال حر، و"GOLD"/"gold"/" Gold " يجب أن تُطابَق كنفس الشريحة، وإلا ينكسر
 * ربط سعر شريحة أُدخلت بحالة أحرف مختلفة عن التي حُفظت على العميل بصمت.
 * الكتابة (مسار إنشاء/تعديل سعر شريحة، ومسار حفظ شروط العميل) يجب أن تُطبِّع
 * بنفس القاعدة عند التخزين حتى لا يتراكم صفّان لنفس الشريحة فعلياً بحالة أحرف
 * مختلفة تحت قيد @@unique([catalogItemId, tier]) الحساس لحالة الأحرف.
 */
function normalizeTier(tier: string): string {
  return tier.trim().toUpperCase();
}

/**
 * يحسم السعر الذي تراه صيدلية معيّنة لصنف واحد من كتالوج مذخر:
 * - لا شريحة للعميل (tier فارغ/null/undefined) → سعر القائمة (LIST).
 * - شريحة موجودة لكن لا سعر شريحة مطابق لها → سعر القائمة (LIST) — لا خطأ،
 *   هذا الوضع الطبيعي لصنف لم يُسعَّر بعد لهذه الشريحة تحديداً.
 * - شريحة موجودة وسعرها <= 0 أو غير منتهٍ (NaN/Infinity) → يُتجاهَل ويُرجَع
 *   سعر القائمة (LIST). سعر شريحة صفري أو سالب شبه مؤكَّد خطأ إدخال (لا
 *   "تنزيلة مجانية" شرعية)، فلا يجب أن يتسرَّب كسعر بيع فعلي أبداً.
 * - شريحة موجودة وسعرها موجب صالح → هذا السعر (TIER).
 * المطابقة بين tier والقيم في tierPrices تمر عبر normalizeTier أعلاه — غير
 * حسّاسة لحالة الأحرف أو المسافات الزائدة.
 */
export function resolveTierPrice(input: ResolveTierPriceInput): ResolveTierPriceResult {
  const listPrice = typeof input.listPrice === "number" && Number.isFinite(input.listPrice) ? input.listPrice : 0;

  const tier = input.tier?.trim();
  if (!tier) {
    return { price: listPrice, source: "LIST" };
  }

  const normalizedTier = normalizeTier(tier);
  const match = (input.tierPrices ?? []).find((tp) => normalizeTier(tp.tier) === normalizedTier);
  if (!match) {
    return { price: listPrice, source: "LIST" };
  }

  if (typeof match.price !== "number" || !Number.isFinite(match.price) || match.price <= 0) {
    return { price: listPrice, source: "LIST" };
  }

  return { price: match.price, source: "TIER" };
}

// ── تعديل سعر جماعي ──────────────────────────────────────────────────────────

export type BulkPriceChangeMode = "PERCENT" | "AMOUNT";

export interface ApplyBulkPriceChangeInput {
  currentPrice: number;
  mode: BulkPriceChangeMode;
  value: number;
  /** التقريب لأقرب مضاعف لهذا الرقم؛ الافتراضي 1 (أقرب دينار صحيح). <= 0 يعني "بلا تقريب". */
  roundTo?: number;
}

export type ApplyBulkPriceChangeResult =
  | { ok: true; newPrice: number }
  | { ok: false; error: string };

/**
 * يطبّق تغييراً جماعياً على سعر صنف واحد (نسبة مئوية أو مبلغ ثابت)، ويرفض أي
 * نتيجة لا يمكن أن تكون سعر بيع حقيقياً.
 *
 * ترتيب حاسم ومختبَر: **التقريب أولاً، ثم الرفض** — سعر 0.4 مع percent -10%
 * ينتج 0.36 التي تبدو موجبة، لكنها تُقرَّب لأقرب دينار فتصبح 0. لو رُفض القرار
 * على 0.36 (قبل التقريب) لمرّ هذا التغيير موافقاً عليه بينما السعر الفعلي
 * المخزَّن صفر — بالضبط الخطأ الذي تحظره هذه الدالة. القرار الوحيد الصحيح هو
 * الحكم على السعر **بعد** التقريب، وهو ما سيُخزَّن فعلياً.
 *
 * قواعد الرفض:
 * - value غير منتهٍ (NaN/Infinity) → مرفوض دائماً.
 * - mode PERCENT وvalue <= -100 → مرفوض دائماً (يعني سعراً صفرياً أو سالباً
 *   حسابياً، بصرف النظر عن قيمة currentPrice).
 * - أي نتيجة (بعد التقريب) <= 0 → مرفوضة، برسالة عربية واضحة.
 *
 * roundTo <= 0 يُعامَل كـ"بلا تقريب" (يحمي من قسمة على صفر)؛ الافتراضي 1
 * (أقرب دينار صحيح) كما تنص المواصفة.
 */
export function applyBulkPriceChange(input: ApplyBulkPriceChangeInput): ApplyBulkPriceChangeResult {
  const { currentPrice, mode, value } = input;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: "قيمة التعديل يجب أن تكون رقماً صالحاً." };
  }

  if (mode === "PERCENT" && value <= -100) {
    return { ok: false, error: "نسبة تخفيض -100% أو أقل غير مسموحة — تنتج سعراً صفرياً أو سالباً." };
  }

  const safeCurrent =
    typeof currentPrice === "number" && Number.isFinite(currentPrice) ? currentPrice : 0;

  const rawNewPrice = mode === "PERCENT" ? safeCurrent * (1 + value / 100) : safeCurrent + value;

  // roundTo غير مُمرَّر إطلاقاً → الافتراضي: أقرب دينار صحيح (كما تنص
  // المواصفة). roundTo مُمرَّر صراحة لكن <= 0 أو غير صالح → "بلا تقريب" (يحمي
  // من قسمة على صفر) — فرق متعمَّد بين "لم يُطلَب تقريب محدَّد" و"طُلِب عدم
  // التقريب صراحة".
  let roundedPrice: number;
  if (input.roundTo === undefined) {
    roundedPrice = Math.round(rawNewPrice);
  } else if (typeof input.roundTo === "number" && Number.isFinite(input.roundTo) && input.roundTo > 0) {
    roundedPrice = Math.round(rawNewPrice / input.roundTo) * input.roundTo;
  } else {
    roundedPrice = rawNewPrice;
  }

  if (!Number.isFinite(roundedPrice) || roundedPrice <= 0) {
    return { ok: false, error: "هذا التعديل ينتج سعراً صفرياً أو سالباً — غير مسموح." };
  }

  return { ok: true, newPrice: roundedPrice };
}

/** يقرّب لمنزلة عشرية واحدة — نفس القاعدة المستخدَمة في warehouse-reports.ts كي تتّسق الواجهة. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── هامش الربح المعروض في صف كتالوج واحد ─────────────────────────────────────
// سدّ فجوة هيكلية (انظر تعليق رأس CatalogClient.tsx/route.ts): costPrice كان
// يُخزَّن دائماً كصفر لعدم وجود أي حقل إدخال له، فكان marginByItem في
// warehouse-reports.ts يُرجِع marginPercent: null للأبد. هذه الدالة توفّر نفس
// منطق "التكلفة المجهولة" لعرض هامش صنف واحد في صفحة الكتالوج (بمعزل عن
// تجميع التقارير)، فلا تُكرَّر حسابات JSX مباشرة داخل CatalogClient.tsx.

/**
 * هامش الربح لصنف كتالوج واحد بسعره وتكلفته الحاليين (لا تجميع مبيعات — انظر
 * marginByItem في warehouse-reports.ts لهذا). costPrice غائب أو صفر أو سالب
 * يعني "تكلفة غير معروفة" → null، **وليس 100%** أبداً (إظهار 100% لعدم وجود
 * تكلفة كان ليضلّل قراراً تسعيرياً فعلياً). تكلفة معروفة >= السعر تُنتج هامشاً
 * صفرياً أو سالباً بعلامته الصحيحة — البيع بالتكلفة أو دونها واقع حقيقي يجب أن
 * يظهر، لا أن يُخفى خلف "مجهول". السعر <= 0 (لا ينبغي أن يحدث فعلياً — price
 * دائماً موجب عبر تحقق POST/PATCH) يُعامَل أيضاً بحذر كـ"غير محسوب" لتفادي
 * قسمة على صفر أو نسبة بلا معنى.
 */
export function catalogMarginPercent(input: {
  price: number;
  costPrice: number | null | undefined;
}): number | null {
  const price = typeof input.price === "number" && Number.isFinite(input.price) ? input.price : 0;
  const costPrice = input.costPrice;

  if (typeof costPrice !== "number" || !Number.isFinite(costPrice) || costPrice <= 0) {
    return null;
  }
  if (price <= 0) {
    return null;
  }

  return round1(((price - costPrice) / price) * 100);
}

// ── التحقق من كلفة الشراء وحدّ إعادة الطلب (WarehouseCatalogItem) ────────────
// دوال نقية يستدعيها كل من POST/PATCH في app/api/warehouse-portal/catalog/
// route.ts واستيراد Excel في .../catalog/import/route.ts — قاعدة تحقق واحدة
// بدل تكرارها في ثلاثة مواضع (نفس فلسفة applyBulkPriceChange أعلاه).

export type FieldValidationResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * كلفة الشراء (costPrice) اختيارية دائماً في كل مسارات الكتابة — غيابها يعني
 * "لم تُدخَل بعد"، وهذا مسموح ومقصود (انظر catalogMarginPercent وmarginByItem:
 * كلاهما يعامل الغياب/الصفر بصفتها "مجهولة" لا خطأ). القيد الوحيد عند إرسالها
 * فعلاً: رقم منتهٍ (لا NaN/Infinity) وغير سالب. صفر صريح مقبول (يُعامَل لاحقاً
 * كـ"مجهول" في الحسابات، لا كخطأ إدخال).
 */
export function validateCostPrice(value: unknown): FieldValidationResult {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: "كلفة الشراء يجب أن تكون رقماً صالحاً." };
  }
  if (value < 0) {
    return { ok: false, error: "كلفة الشراء يجب ألا تكون سالبة." };
  }
  return { ok: true, value };
}

/**
 * حد إعادة الطلب (minStock) اختياري — عدد صحيح غير سالب فقط. صفر يعني
 * صراحةً "بلا تنبيه" (انظر isLowStock في warehouse-stock.ts) وهو قيمة صالحة
 * تماماً، لا حالة خاصة يجب رفضها. قيمة كسرية (مثل 5.5) مرفوضة لأنها لا تعني
 * شيئاً كحد لعدد وحدات صحيح.
 */
export function validateMinStock(value: unknown): FieldValidationResult {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, error: "حد إعادة الطلب يجب أن يكون عدداً صحيحاً." };
  }
  if (value < 0) {
    return { ok: false, error: "حد إعادة الطلب يجب ألا يكون سالباً." };
  }
  return { ok: true, value };
}

// ── ميزة البونص: قاعدة بونص قياسية لصنف كتالوج (bonusThreshold/bonusQuantity) ─
// نفس شكل التحقق أعلاه بالضبط (عدد صحيح غير سالب) لكن برسائل مخصَّصة — يستدعيها
// POST/PATCH في app/api/warehouse-portal/catalog/route.ts. 0 قيمة صالحة دائماً
// لكلا الحقلين (تعني "لا قاعدة بونص" — انظر computeBonusUnits في warehouse-bonus.ts)،
// فلا حالة خاصة يجب رفضها هنا؛ الفحص الوحيد اللازم هو "عدد صحيح غير سالب".

/** عتبة الشراء («اشترِ هذا العدد») — عدد صحيح غير سالب. 0 يعني "لا قاعدة بونص". */
export function validateBonusThreshold(value: unknown): FieldValidationResult {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, error: "عتبة البونص (اشترِ) يجب أن تكون عدداً صحيحاً." };
  }
  if (value < 0) {
    return { ok: false, error: "عتبة البونص (اشترِ) يجب ألا تكون سالبة." };
  }
  return { ok: true, value };
}

/** الوحدات المجانية («واحصل على هذا العدد») — عدد صحيح غير سالب. 0 يعني "لا قاعدة بونص". */
export function validateBonusQuantity(value: unknown): FieldValidationResult {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, error: "كمية البونص (احصل على) يجب أن تكون عدداً صحيحاً." };
  }
  if (value < 0) {
    return { ok: false, error: "كمية البونص (احصل على) يجب ألا تكون سالبة." };
  }
  return { ok: true, value };
}
