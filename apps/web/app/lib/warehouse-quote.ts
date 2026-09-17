// المرحلة 3 من ميزة المذاخر: منطق تسعير/مراجعة الطلب — نقي بالكامل وقابل للاختبار.
// تُستدعى من PATCH /api/warehouse-portal/orders/[id]/quote قبل أي كتابة في قاعدة البيانات.
// القواعد (التقرير §4.3-ب): لكل صنف أحد ثلاثة أحكام — متوفر (سعر)، جزئي (سعر + كمية أقل)، نافد.

export type QuoteItemStatus = "AVAILABLE" | "PARTIAL" | "OUT_OF_STOCK";

export interface QuoteItemInput {
  itemId: string;
  status: QuoteItemStatus;
  quotedPrice?: number | null;
  quotedQuantity?: number | null;
  note?: string | null;
  /**
   * ميزة البونص: وحدات مجانية يمنحها المذخر لهذا السطر — تُتحقَّق عبر
   * validateBonus() في app/lib/warehouse-bonus.ts في مسار الـ API (وليس هنا،
   * هذا الملف لا يعرف عنها شيئاً عمداً)، وتُخزَّن في
   * WarehouseOrderItem.bonusQuantity مباشرة. **لا تدخل buildQuoteDecision أو
   * effectiveLine إطلاقاً** — البونص إيراده صفر دائماً، فلا يؤثر على سعر
   * السطر أو إجمالي الطلب بأي شكل (انظر التعليق الحرج أعلى effectiveLine).
   */
  bonusQuantity?: number | null;
}

// --- مصدر الحقيقة الوحيد لقيمة السطر الفعلية ------------------------------
// إصلاح خطأ مالي مؤكَّد: كان إجمالي عرض الطلب (هذا الملف، مسار quote) وبنود فاتورة
// الشراء المسودة (warehouse-purchase-bridge.ts, مسار الاعتماد) يحسبان "قيمة السطر
// الفعلية" بقاعدتين مختلفتين تتعارضان — سطر PARTIAL يُحتسب بالكمية المطلوبة كاملة
// في الأول، وسطر OUT_OF_STOCK لا يُستثنى أبداً في الثاني (بل يُعاد إحياء سعره
// الأصلي عبر requestedPrice). effectiveLine() هي القاعدة الوحيدة الآن — كلا
// الموقعين يستدعيانها بدل حساب القيمة بنفسيهما، فلا يتفرّقان مجدداً.

export type OrderLineStatus = "REQUESTED" | "AVAILABLE" | "PARTIAL" | "OUT_OF_STOCK";

/** سطر الطلب كما هو مخزَّن في قاعدة البيانات (WarehouseOrderItem). */
export interface OrderLine {
  status: OrderLineStatus;
  /** الكمية التي طلبها الصيدلي أصلاً */
  quantity: number;
  quotedQuantity?: number | null;
  /** سعر الصيدلي عند الطلب — نفسه القيمة المخزَّنة في requestedPrice، فلا حاجة لهذا الأخير هنا */
  unitPrice: number;
  quotedPrice?: number | null;
  /** غير مستخدم عمداً في effectiveLine — انظر التعليق أدناه */
  requestedPrice?: number | null;
}

export interface EffectiveLine {
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/** رقم غير سالب ومنتهٍ، وإلا صفر — يحمي من NaN/Infinity/سالب في أي حقل مالي. */
function safeNonNegative(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * القيمة الفعلية لسطر طلب واحد — تُستدعى من مسار عرض السعر (لإجمالي الطلب) ومن
 * مسار الاعتماد (لبناء فاتورة الشراء المسودة)، فلا يُعاد حسابها بقاعدة مختلفة في كل مكان.
 *
 * - OUT_OF_STOCK: لا يُباع أبداً ولا يُحتسب، بصرف النظر عمّا هو مخزَّن من أسعار على
 *   السطر (حتى لو بقي quotedPrice/requestedPrice قديماً من قبل الحكم عليه).
 * - PARTIAL: الكمية = quotedQuantity (أو صفر إن كانت null/سالبة/غير صالحة).
 * - AVAILABLE و REQUESTED (لم يُحكم عليه بعد): الكمية = quantity المطلوبة كاملة.
 * - السعر = quotedPrice إن وُجد وإلا unitPrice. requestedPrice مُستبعد عمداً من
 *   سلسلة البدائل: هو ما كان يُعيد إحياء سعر الأصناف النافدة (quotedPrice يُصفَّر
 *   عمداً لها عند الحكم OUT_OF_STOCK، لكن requestedPrice/unitPrice كانا يبقيان
 *   كما هما فيتسرّب السعر القديم عبر ??). و unitPrice أصلاً هو نفسه السعر
 *   المطلوب على السطر، فلا حاجة لبديل إضافي.
 * - lineTotal = الكمية × السعر، وهو صفر تلقائياً كلما كانت الكمية صفراً.
 */
export function effectiveLine(line: OrderLine): EffectiveLine {
  if (line.status === "OUT_OF_STOCK") {
    return { quantity: 0, unitPrice: 0, lineTotal: 0 };
  }

  const rawQuantity = line.status === "PARTIAL" ? line.quotedQuantity ?? 0 : line.quantity;
  const quantity = safeNonNegative(rawQuantity);
  const unitPrice = safeNonNegative(line.quotedPrice ?? line.unitPrice);

  return { quantity, unitPrice, lineTotal: quantity * unitPrice };
}

/** سياق الصنف كما هو في قاعدة البيانات — يُحقن من مسار الـ API. */
export interface QuoteItemContext {
  itemId: string;
  /** الكمية التي طلبها الصيدلي */
  quantity: number;
  /** السعر الذي وضعه الصيدلي عند الطلب (توقعه) */
  unitPrice: number;
}

export interface QuoteSummary {
  available: number;
  partial: number;
  outOfStock: number;
  /** أصناف تغيّر سعرها عن توقع الصيدلي */
  changedPrices: number;
}

export interface QuoteDecision {
  ok: boolean;
  errors: string[];
  /** مجموع السطر لكل صنف (itemId → الإجمالي) */
  lineTotals: Record<string, number>;
  /** إجمالي الطلب بعد المراجعة */
  total: number;
  summary: QuoteSummary;
}

function isFinitePositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * يتحقق من مراجعة المذخر لكل أصناف الطلب ويحسب الإجماليات.
 * - كل صنف في السياق يجب أن يظهر مرة واحدة بالضبط في المدخلات.
 * - AVAILABLE: سعر موجب متناهٍ إلزامي، والكمية الفعلية = الكمية المطلوبة كاملة.
 * - PARTIAL: سعر موجب + كمية 0 < quotedQuantity < quantity.
 * - OUT_OF_STOCK: بلا سعر وكمية (يُهمل ما أُرسل).
 * - الإجمالي = Σ (السعر × الكمية الفعلية)؛ النافد = 0.
 */
export function buildQuoteDecision(
  inputs: QuoteItemInput[],
  ctxList: QuoteItemContext[]
): QuoteDecision {
  const errors: string[] = [];
  const lineTotals: Record<string, number> = {};
  const summary: QuoteSummary = { available: 0, partial: 0, outOfStock: 0, changedPrices: 0 };
  let total = 0;

  const ctxById = new Map(ctxList.map((c) => [c.itemId, c]));
  const seen = new Set<string>();

  for (const input of inputs) {
    if (seen.has(input.itemId)) {
      errors.push(`الصنف ${input.itemId} مُقيَّم أكثر من مرة.`);
      continue;
    }
    seen.add(input.itemId);

    const ctx = ctxById.get(input.itemId);
    if (!ctx) {
      errors.push(`الصنف ${input.itemId} لا ينتمي لهذا الطلب.`);
      continue;
    }

    if (input.status === "AVAILABLE") {
      if (!isFinitePositive(input.quotedPrice)) {
        errors.push("الصنف المتوفر يتطلب سعراً موجباً صالحاً.");
        continue;
      }
      lineTotals[input.itemId] = input.quotedPrice * ctx.quantity;
      total += lineTotals[input.itemId];
      summary.available += 1;
      if (input.quotedPrice !== ctx.unitPrice) summary.changedPrices += 1;
    } else if (input.status === "PARTIAL") {
      if (!isFinitePositive(input.quotedPrice)) {
        errors.push("الصنف الجزئي يتطلب سعراً موجباً صالحاً.");
        continue;
      }
      const q = input.quotedQuantity;
      if (
        typeof q !== "number" ||
        !Number.isFinite(q) ||
        !Number.isInteger(q) ||
        q <= 0 ||
        q >= ctx.quantity
      ) {
        errors.push("الكمية الجزئية يجب أن تكون عدداً صحيحاً أكبر من صفر وأقل من الكمية المطلوبة.");
        continue;
      }
      lineTotals[input.itemId] = input.quotedPrice * q;
      total += lineTotals[input.itemId];
      summary.partial += 1;
      if (input.quotedPrice !== ctx.unitPrice) summary.changedPrices += 1;
    } else if (input.status === "OUT_OF_STOCK") {
      lineTotals[input.itemId] = 0;
      summary.outOfStock += 1;
    } else {
      errors.push(`حالة غير معروفة للصنف ${input.itemId}.`);
    }
  }

  for (const ctx of ctxList) {
    if (!seen.has(ctx.itemId)) {
      errors.push(`لم يُقيَّم الصنف ${ctx.itemId} — يجب الحكم على كل أصناف الطلب.`);
    }
  }

  return { ok: errors.length === 0, errors, lineTotals, total, summary };
}
