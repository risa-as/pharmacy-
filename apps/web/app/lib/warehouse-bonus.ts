// ميزة البونص (بونص/سلع مجانية) في نظام المذاخر B2B: منطق نقي بالكامل — بلا
// استيراد Prisma وبلا next/*، قابل للاختبار مباشرة تحت إعداد vitest في هذا
// المستودع (الذي لا يحل alias "@/*")، بنفس انضباط app/lib/warehouse-quote.ts
// وapp/lib/warehouse-stock.ts.
//
// لماذا هذه الميزة أصلاً: مذاخر الأدوية العراقية تخصم بالدرجة الأولى عبر
// وحدات مجانية («اشترِ ١٠ تأخذ ١١»)، لا نسبة مئوية أو مبلغ. بدون تمثيل صريح
// لهذا، كان المذخر يُضطَر لتزييف السعر لتمثيل البونص، وهو بالضبط ما أفسد
// تكاليف الدفعات والمبيعات في حادثة "أفسحة/شريط" الموثَّقة سابقاً في هذا
// المشروع (انظر ملاحظة الذاكرة project_strips_per_packet_entry_errors) —
// خطأ إدخال واحد لوّث تكلفة دفعة كاملة لثلاثة أشهر. هذه الميزة تمنع تكرار
// نفس الفئة من الخطأ عبر مسار بيانات صريح (بونص عدد وحدات، لا سعر مزيَّف)
// + تحقّق صارم (validateBonus أدناه) يرفض بالضبط الخطأ الأكثر ترجيحاً: بونص
// أكبر من المُباع، وهو غالباً رقم مقلوب أو خانة إضافية بالغلط لا قراراً
// تجارياً حقيقياً.
//
// القاعدة المالية الحاسمة (مطبَّقة في المستهلكين، لا هنا — هذا الملف نقي بلا
// أي معرفة بالإيراد/effectiveLine):
//   وحدات البونص تحمل إيراداً صفرياً دائماً (الصيدلية لا تدفع ثمنها) لكن
//   تكلفة كاملة (هي بضاعة خرجت فعلياً من مخزون المذخر) — فهي تدخل خصم
//   المخزون والهامش كاملة، ولا تدخل أبداً حساب effectiveLine()/الإجمالي.

// ── قاعدة البونص القياسية لصنف كتالوج ────────────────────────────────────────

function isNonNegativeFiniteInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n >= 0;
}

/**
 * كم وحدة مجانية تستحقها كمية مُشتراة معيّنة وفق قاعدة بونص صنف كتالوج
 * (WarehouseCatalogItem.bonusThreshold/bonusQuantity) — تُستخدَم فقط
 * لاقتراح قيمة أولية عند تسعير طلب؛ القيمة المعتمدة فعلياً على السطر تبقى
 * حقلاً مستقلاً (WarehouseOrderItem.bonusQuantity) يُعدِّله المذخر بحرّية.
 *
 * القواعد (حاسمة ومختبَرة عند كل حافة):
 * - bonusThreshold <= 0 أو bonusQuantity <= 0 → 0 دائماً ("لا قاعدة بونص").
 *   لا يُفسَّر threshold <= 0 كـ"وحدة مجانية لكل وحدة مُشتراة" — ذلك يعني
 *   عملياً "أعطِ كل شيء مجاناً"، وهو خطأ إعداد شبه مؤكَّد لا قاعدة تجارية.
 * - وإلا: floor(quantity / bonusThreshold) * bonusQuantity — عتبة 10 وبونص 1
 *   تعطي 0 عند الكمية 9، و1 عند 10، و1 عند 19، و2 عند 20 بالضبط.
 * - أي مدخل غير عدد صحيح غير سالب ومنتهٍ (كسري، سالب، NaN/Infinity) لأي من
 *   الحقول الثلاثة → 0 دفاعياً، لا رمي ولا NaN يتسرَّب لحساب لاحق.
 */
export function computeBonusUnits(input: {
  quantity: number;
  bonusThreshold: number;
  bonusQuantity: number;
}): number {
  const { quantity, bonusThreshold, bonusQuantity } = input;

  if (!isNonNegativeFiniteInt(bonusThreshold) || !isNonNegativeFiniteInt(bonusQuantity)) {
    return 0;
  }
  if (bonusThreshold <= 0 || bonusQuantity <= 0) {
    return 0;
  }
  if (!isNonNegativeFiniteInt(quantity)) {
    return 0;
  }

  return Math.floor(quantity / bonusThreshold) * bonusQuantity;
}

// ── إجمالي الوحدات الخارجة فعلياً من المخزون ─────────────────────────────────

/** رقم غير سالب ومنتهٍ، وإلا صفر — نفس انضباط safeNonNegative في warehouse-quote.ts. */
function safeNonNegative(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * إجمالي الوحدات الخارجة فعلياً من المخزون لسطر واحد = المباعة (soldQuantity،
 * عادة effectiveLine(...).quantity) + المجانية (bonusQuantity). هذا هو الرقم
 * الذي يُستخدَم لخصم المخزون فعلياً (allocateFEFO) — البونص بضاعة حقيقية
 * تغادر الرفوف، فلا يجوز خصم المُباع وحده وترك البونص بلا خصم (سيظهر مخزون
 * وهمي أعلى من الحقيقي). مدخلان غير صالحين (كسري/سالب/NaN/Infinity) يُعامَلان
 * كصفر دفاعياً، لا رمي.
 */
export function totalUnitsLeavingStock(input: { soldQuantity: number; bonusQuantity: number }): number {
  return safeNonNegative(input.soldQuantity) + safeNonNegative(input.bonusQuantity);
}

// ── التحقق من بونص أدخله المذخر يدوياً ────────────────────────────────────────

export type ValidateBonusResult = { ok: true } | { ok: false; error: string };

/**
 * يتحقق من صحة بونص أدخله المذخر يدوياً على سطر طلب واحد — يُستدعى من مسار
 * التسعير (PATCH /api/warehouse-portal/orders/[id]/quote) قبل أي كتابة.
 *
 * القواعد:
 * - bonusQuantity يجب أن يكون عدداً صحيحاً غير سالب (كسري أو NaN/Infinity أو
 *   سالب → رفض برسالة عربية واضحة).
 * - صفر صالح دائماً (لا بونص — الحالة الشائعة).
 * - bonusQuantity أكبر من soldQuantity مرفوض: منح مجاني أكثر مما يُباع فعلياً
 *   شبه مؤكَّد خطأ إدخال (رقم مقلوب أو خانة زائدة)، وهذا بالضبط نمط الخطأ الذي
 *   أفسد تكاليف دفعات سابقة في هذا المشروع — يُرفض عند المصدر بدل أن يُكتشَف
 *   لاحقاً في تقرير هامش مشوَّه. المساواة (بونص = المباع بالكامل، "خذ ضعف
 *   الكمية مجاناً") حالة تجارية نادرة لكنها ليست خطأ إدخال بذاتها، فتبقى مقبولة.
 *   soldQuantity غير صالح (سالب/NaN) يُعامَل كصفر دفاعياً، فأي بونص موجب معه
 *   يُرفَض تلقائياً (0 لا يمكن أن يكون "أكبر منه" إلا بونص > 0).
 */
export function validateBonus(input: { soldQuantity: number; bonusQuantity: number }): ValidateBonusResult {
  const { bonusQuantity } = input;

  if (typeof bonusQuantity !== "number" || !Number.isFinite(bonusQuantity) || !Number.isInteger(bonusQuantity)) {
    return { ok: false, error: "كمية البونص يجب أن تكون عدداً صحيحاً." };
  }
  if (bonusQuantity < 0) {
    return { ok: false, error: "كمية البونص يجب ألا تكون سالبة." };
  }
  if (bonusQuantity === 0) {
    return { ok: true };
  }

  const soldQuantity = safeNonNegative(input.soldQuantity);
  if (bonusQuantity > soldQuantity) {
    return {
      ok: false,
      error: `كمية البونص (${bonusQuantity}) أكبر من الكمية المباعة (${soldQuantity}) — يبدو خطأ إدخال، تحقق من الرقم قبل الإرسال.`,
    };
  }

  return { ok: true };
}
