/**
 * warehouse-reps.ts
 *
 * المندوبون (Field Sales Reps) — مذاخر B2B: منطق نقي بالكامل — بلا استيراد
 * Prisma وبلا next/*، قابل للاختبار مباشرة تحت إعداد vitest في هذا المستودع
 * (الذي لا يحل alias "@/*")، بنفس انضباط app/lib/warehouse-stock.ts وapp/lib/
 * warehouse-bonus.ts وapp/lib/warehouse-purchases.ts.
 *
 * لماذا هذه الميزة أصلاً: مذاخر الأدوية العراقية تبيع بالدرجة الأولى عبر
 * مندوبين ميدانيين يحملون بضاعة في سياراتهم ويزورون صيدليات — أغلبها ليست
 * على منصّتنا إطلاقاً. المعيار السائد في السوق يعامل كل مندوب كموقع مخزون
 * مستقل (WarehouseRepStock) ويحسب عمولته بثلاث طرق: على المبيعات، على
 * الربح، أو على **النقد المحصَّل فعلاً** — الأخيرة الأهم تجارياً لأنها تربط
 * أجر المندوب بالتحصيل الفعلي للدين لا مجرد تسجيله.
 *
 * هذا الملف **لا يعيد** حساب حالة الفاتورة أو تطبيق الدفعات — تلك الرياضيات
 * موجودة بالفعل في app/lib/warehouse-accounts.ts (computeInvoiceStatus/
 * applyPayment) وهي نقيّة من اتجاه العلاقة، فتُستخدَم حرفياً في مسار تحصيل
 * فاتورة ميدانية بلا نسخة موازية هنا. ما يخصّ هذا الملف حصراً: حساب العمولة
 * الثلاثية الأنماط، ربح فاتورة بيع ميدانية (بقاعدة البونص نفسها المُقرَّرة في
 * warehouse-bonus.ts)، والتحقق من رصيد مندوب من دفعة معيّنة.
 */

/** رقم غير سالب ومنتهٍ، وإلا صفر — نفس انضباط safeNonNegative في warehouse-bonus.ts/warehouse-purchases.ts. */
function safeNonNegative(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

/** يُقرِّب لخانتين عشريتين بأسلوب موحّد عبر الملف (يمتص بقايا تقريب الفاصلة العائمة). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── العمولة ───────────────────────────────────────────────────────────────

export type CommissionBasisValue = "SALES" | "PROFIT" | "COLLECTION";

export interface ComputeCommissionInput {
  basis: CommissionBasisValue;
  /** نسبة مئوية (مثال: 5 تعني 5%). */
  rate: number;
  /** إجمالي المبيعات في الفترة. */
  salesTotal: number;
  /** (سعر - كلفة) × الكمية، والبونص كلفة بلا إيراد — انظر computeFieldSaleProfit. */
  profitTotal: number;
  /** النقد المحصَّل فعلاً خلال الفترة. */
  collectedTotal: number;
}

export interface ComputeCommissionResult {
  /** الأساس المُستخدَم فعلياً بحسب basis — مُبلَّغ بصدق حتى لو كانت rate <= 0. */
  base: number;
  amount: number;
}

/**
 * يحسب عمولة مندوب — نسبة مئوية من "الأساس" الذي يحدّده basis (مبيعات، ربح،
 * أو تحصيل نقدي)، بلا أي معرفة بمصدر هذه الأرقام (المُستدعي في مسار
 * التقارير/الواجهة يجمعها من WarehouseFieldSale/WarehouseRepCollection).
 *
 * القواعد (حاسمة ومختبَرة عند كل حافة):
 * - الأساس (base) المطابق لـ basis يُقرَأ من المدخل المطابق (salesTotal/
 *   profitTotal/collectedTotal) ويُعامَل دائماً كصفر إن كان سالباً أو غير
 *   منتهٍ (NaN/Infinity) — لا NaN يتسرَّب لحساب العمولة أبداً، حتى لو كان
 *   الربح فعلياً خسارة (profitTotal سالب): يُبلَّغ base بصفر، لا برقم سالب.
 * - rate <= 0 أو غير منتهٍ (NaN/Infinity/سالب/صفر) يعني "لا عمولة مُعدَّة
 *   لهذا المندوب" → amount: 0 دائماً، لكن base يبقى مُبلَّغاً بصدق (القيمة
 *   المحسوبة أعلاه، لا صفر مصطنع) — الواجهة تحتاج "كم كان سيُحسَب لو أُعِدَّت
 *   نسبة" حتى بلا نسبة مُعدَّة فعلياً.
 * - غير ذلك: amount = base × rate / 100، مُقرَّبة لخانتين عشريتين.
 * - basis غير معروف (دفاعياً، لا يجب أن يحدث مع CommissionBasisValue المُحكَم
 *   في TypeScript، لكن المدخل الفعلي قد يأتي من جسم طلب HTTP غير موثوق) →
 *   base: 0 دفاعياً بدل رمي خطأ.
 */
export function computeCommission(input: ComputeCommissionInput): ComputeCommissionResult {
  const { basis, rate, salesTotal, profitTotal, collectedTotal } = input;

  const rawBase =
    basis === "SALES" ? salesTotal :
    basis === "PROFIT" ? profitTotal :
    basis === "COLLECTION" ? collectedTotal :
    0;

  const base = safeNonNegative(rawBase);

  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return { base, amount: 0 };
  }

  const amount = round2((base * rate) / 100);
  return { base, amount };
}

// ── ربح فاتورة بيع ميدانية ────────────────────────────────────────────────

export interface FieldSaleProfitLine {
  quantity: number;
  bonusQuantity: number;
  unitPrice: number;
  unitCost: number;
}

export interface FieldSaleProfitResult {
  revenue: number;
  cost: number;
  profit: number;
}

/**
 * يحسب إيراد/كلفة/ربح فاتورة بيع ميدانية من بنودها — نفس قاعدة البونص
 * المُقرَّرة في app/lib/warehouse-bonus.ts (لا تُكرَّر هنا بمنطق موازٍ):
 * وحدات البونص تحمل إيراداً صفرياً دائماً (الصيدلية لا تدفع ثمنها) لكن كلفة
 * كاملة (بضاعة حقيقية غادرت مخزون المندوب) — فهي تدخل حساب الكلفة والهامش
 * كاملة، ولا تدخل أبداً حساب الإيراد.
 *
 * مثال حاسم من المواصفة: بيع 10 وحدات بسعر 1000 (كلفة 600) مع بونص وحدة
 * واحدة → إيراد 10,000، كلفة 6,600 (11 وحدة × 600)، ربح 3,400 — **وليس
 * 4,000** (الحساب الخاطئ الذي يتجاهل كلفة وحدة البونص).
 *
 * كل حقل مدخل غير صالح (كسري/سالب/NaN/Infinity) يُعامَل كصفر دفاعياً، فلا
 * NaN يتسرَّب لأي تقرير مالي لاحق.
 */
export function computeFieldSaleProfit(lines: FieldSaleProfitLine[]): FieldSaleProfitResult {
  let revenue = 0;
  let cost = 0;

  for (const line of lines) {
    const quantity = safeNonNegative(line.quantity);
    const bonusQuantity = safeNonNegative(line.bonusQuantity);
    const unitPrice = safeNonNegative(line.unitPrice);
    const unitCost = safeNonNegative(line.unitCost);

    revenue += quantity * unitPrice;
    cost += (quantity + bonusQuantity) * unitCost;
  }

  return { revenue, cost, profit: revenue - cost };
}

// ── رصيد مندوب من دفعة معيّنة ─────────────────────────────────────────────

export interface RepStockRow {
  batchId: string;
  quantity: number;
}

/**
 * كمية المندوب المتوفرة فعلياً من دفعة معيّنة — 0 لدفعة غير موجودة في رصيده
 * إطلاقاً (لا يملك المندوب أي كمية منها)، والكمية بالضبط كما هي مُخزَّنة
 * لدفعة موجودة. لا تصفية على الصلاحية هنا — هذه الدالة تقرأ الرصيد المُخزَّن
 * فقط (WarehouseRepStock.quantity)، وقاعدة "لا تحميل بضاعة منتهية لمندوب"
 * تُطبَّق منفصلة عند التحميل (انظر مسار POST .../reps/[id]/load).
 */
export function repStockAvailable(stock: RepStockRow[], batchId: string): number {
  const row = stock.find((s) => s.batchId === batchId);
  return row ? safeNonNegative(row.quantity) : 0;
}
