/**
 * warehouse-accounts.ts
 *
 * Phase 2 (الحسابات والعملاء) من نظام المذاخر B2B — منطق نقي بالكامل، بلا
 * Prisma وبلا أي استدعاء شبكي، قابل للاختبار مباشرة (warehouse-accounts.test.ts).
 *
 * المشكلة التي يحلّها هذا الملف: المذخر لا يرى ماله. الديون كانت تُتبَّع فقط
 * في SupplierPayment العائد للصيدلية (supplierId → Supplier → Organization)،
 * فتعرف الصيدلية ما تدين به للمذخر بينما لا يعرف المذخر من يدين له ولا بكم.
 * هذا الملف هو حساب القرارات المالية على جانب المذخر: حالة الفاتورة، تطبيق
 * دفعة، تصنيف التقادم (aging)، تاريخ الاستحقاق، حدّ الائتمان، وتلخيص الذمم
 * المدينة. القراءة/الكتابة الفعلية على قاعدة البيانات تبقى في مسارات الـ API
 * تحت app/api/warehouse-portal — هذا الملف يقرر فقط.
 *
 * ── ملاحظة حاسمة حول الفاصلة العائمة (floating-point money) ─────────────────
 * كل القيم المالية هنا floats عاديين (Float في Prisma)، فتراكم عمليات جمع/طرح
 * متكررة قد يترك بقايا تقريب صغيرة جداً (مثال كلاسيكي: 0.1 + 0.2 !== 0.3 في
 * IEEE-754). لو قورنت هذه القيم بالمساواة التامة، فاتورة سُدِّدت بالكامل فعلياً
 * (paidAmount = 99.999999999999 بدل 100.0 بسبب تراكم جمع دفعات جزئية) تبقى
 * عالقة على PARTIAL إلى الأبد رغم أن المستخدم دفع كل شيء. لهذا كل مقارنة مالية
 * هنا تمر عبر MONEY_EPSILON = 0.01 (فَلس واحد عراقياً تقريباً — أصغر من أي وحدة
 * عملة حقيقية يُتعامل بها، فلا يخفي فرقاً حقيقياً أبداً): أي فارق أصغر من هذا
 * يُعامَل كصفر. هذا يعني تحديداً أن `paidAmount: 99.999, total: 100` تُحسب PAID
 * وليس PARTIAL — انظر اختبار "epsilon" في warehouse-accounts.test.ts.
 */

/** أصغر فارق مالي يُعتبر "صفراً" — يمتص بقايا تقريب الفاصلة العائمة. */
export const MONEY_EPSILON = 0.01;

export type WarehouseInvoiceStatusValue = "UNPAID" | "PARTIAL" | "PAID" | "CANCELLED";
export type AgingBucket = "CURRENT" | "D30" | "D60" | "D90" | "D90_PLUS";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function safeFinite(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

// ── حالة الفاتورة ────────────────────────────────────────────────────────────

export interface ComputeInvoiceStatusInput {
  total: number;
  paidAmount: number;
  cancelled?: boolean;
}

/**
 * يحسب حالة الفاتورة من إجماليها والمبلغ المسدَّد.
 * الترتيب حاسم: cancelled يفوز على كل شيء آخر — فاتورة مُلغاة تبقى مُلغاة
 * حتى لو كانت مسدَّدة جزئياً قبل الإلغاء. بعد ذلك:
 *   - paidAmount <= 0 (أو ضمن MONEY_EPSILON من الصفر) → UNPAID
 *   - paidAmount >= total - MONEY_EPSILON → PAID (يمتص بقايا التقريب)
 *   - غير ذلك → PARTIAL
 */
export function computeInvoiceStatus(input: ComputeInvoiceStatusInput): WarehouseInvoiceStatusValue {
  if (input.cancelled) return "CANCELLED";

  const total = safeFinite(input.total);
  const paidAmount = safeFinite(input.paidAmount);

  if (paidAmount <= MONEY_EPSILON) return "UNPAID";
  if (paidAmount >= total - MONEY_EPSILON) return "PAID";
  return "PARTIAL";
}

// ── تطبيق دفعة ───────────────────────────────────────────────────────────────

export interface ApplyPaymentInput {
  total: number;
  paidAmount: number;
  payment: number;
}

export type ApplyPaymentResult =
  | { ok: true; newPaid: number; newStatus: WarehouseInvoiceStatusValue }
  | { ok: false; error: string };

/**
 * يطبّق دفعة جديدة على فاتورة، ويرجع المبلغ المسدَّد والحالة الجديدين — بلا أي
 * كتابة فعلية (المُستدعي في مسار الـ API يستخدم هذه النتيجة داخل تحديث ذري
 * مشروط، انظر POST /api/warehouse-portal/invoices/[id]/payments).
 *
 * يرفض:
 *   - مبلغاً غير موجب أو غير منتهٍ (NaN/Infinity/سالب/صفر).
 *   - دفعة تتجاوز المتبقي الفعلي على الفاتورة (overpayment) — برسالة عربية
 *     واضحة تُسمّي المبلغ المتبقي بالضبط، حتى يعرف المستخدم الحد الأقصى
 *     المسموح به دون تخمين.
 * المقارنة مع المتبقي تمر عبر MONEY_EPSILON: دفعة تفوق المتبقي بأقل من فَلس
 * واحد (بقايا تقريب) لا تُرفض كدفعة زائدة.
 */
export function applyPayment(input: ApplyPaymentInput): ApplyPaymentResult {
  const { payment } = input;

  if (typeof payment !== "number" || !Number.isFinite(payment) || payment <= 0) {
    return { ok: false, error: "مبلغ الدفعة يجب أن يكون رقماً موجباً صالحاً." };
  }

  const total = safeFinite(input.total);
  const paidAmount = safeFinite(input.paidAmount);
  const remaining = Math.max(total - paidAmount, 0);

  if (payment > remaining + MONEY_EPSILON) {
    return {
      ok: false,
      error: `المبلغ المدخل يتجاوز المتبقي على الفاتورة. المتبقي الفعلي: ${remaining.toFixed(2)}.`,
    };
  }

  const newPaid = paidAmount + payment;
  const newStatus = computeInvoiceStatus({ total, paidAmount: newPaid });

  return { ok: true, newPaid, newStatus };
}

// ── تصنيف التقادم (aging) ────────────────────────────────────────────────────

/**
 * يصنّف فاتورة حسب عدد الأيام المتأخرة عن تاريخ استحقاقها، اعتماداً على `now`
 * المُحقَن (للاختبار الحتمي — لا يُستدعى Date.now() هنا أبداً إلا كقيمة
 * افتراضية عند عدم تمرير `now`).
 *
 * الحدود بالضبط (يوم التأخر = عدد الأيام الكاملة المنقضية منذ dueAt، مُقرَّب
 * للأسفل — floor(diff / يوم)):
 *   - dueAt = null (بلا مهلة سداد متّفق عليها) → CURRENT دائماً.
 *   - لم يحن الاستحقاق بعد (daysPastDue <= 0، بما فيها لحظة الاستحقاق نفسها) → CURRENT.
 *   - 1 إلى 30 يوماً تأخراً (ضمناً) → D30.
 *   - 31 إلى 60 يوماً تأخراً (ضمناً) → D60.
 *   - 61 إلى 90 يوماً تأخراً (ضمناً) → D90.
 *   - أكثر من 90 يوماً (91 فأكثر) → D90_PLUS.
 */
export function agingBucket(dueAt: Date | string | null, now: Date = new Date()): AgingBucket {
  if (dueAt === null || dueAt === undefined) return "CURRENT";

  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "CURRENT";

  const daysPastDue = Math.floor((now.getTime() - due.getTime()) / MS_PER_DAY);

  if (daysPastDue <= 0) return "CURRENT";
  if (daysPastDue <= 30) return "D30";
  if (daysPastDue <= 60) return "D60";
  if (daysPastDue <= 90) return "D90";
  return "D90_PLUS";
}

// ── تاريخ الاستحقاق ──────────────────────────────────────────────────────────

/**
 * يحسب تاريخ استحقاق الفاتورة من تاريخ إصدارها ومهلة السداد بالأيام.
 * paymentTermDays <= 0 يعني نقدي/بلا مهلة متّفق عليها → null (لا استحقاق،
 * فالفاتورة تبقى CURRENT دائماً في agingBucket بدل أن تُحسب "متأخرة" على مهلة
 * لم تُتفَق عليها أصلاً).
 */
export function computeDueDate(issuedAt: Date, paymentTermDays: number): Date | null {
  if (!Number.isFinite(paymentTermDays) || paymentTermDays <= 0) return null;
  return new Date(issuedAt.getTime() + paymentTermDays * MS_PER_DAY);
}

// ── حدّ الائتمان ─────────────────────────────────────────────────────────────

export interface CheckCreditLimitInput {
  creditLimit: number;
  outstanding: number;
  newOrderTotal: number;
}

export type CheckCreditLimitResult = { ok: true } | { ok: false; error: string; available: number };

/**
 * يتحقق من أن طلباً جديداً لا يتجاوز حدّ ائتمان الصيدلية لدى هذا المذخر.
 * creditLimit <= 0 يعني "بلا حد ائتماني" — يُقبَل دائماً بصرف النظر عن حجم
 * الذمم القائمة. غير ذلك: يُرفض إن كان (القائم + الطلب الجديد) يتجاوز الحدّ،
 * مع تسمية المبلغ المتاح فعلياً (available) حتى تعرف الصيدلية/الواجهة الحدّ
 * الأقصى الممكن طلبه الآن دون تخمين.
 */
export function checkCreditLimit(input: CheckCreditLimitInput): CheckCreditLimitResult {
  const { creditLimit, outstanding, newOrderTotal } = input;

  if (!Number.isFinite(creditLimit) || creditLimit <= 0) {
    return { ok: true };
  }

  const safeOutstanding = safeFinite(outstanding);
  const safeNewOrderTotal = safeFinite(newOrderTotal);

  if (safeOutstanding + safeNewOrderTotal > creditLimit + MONEY_EPSILON) {
    const available = Math.max(creditLimit - safeOutstanding, 0);
    return {
      ok: false,
      error: `تجاوز حدّ الائتمان المسموح به لدى هذا المذخر. المتاح حالياً: ${available.toFixed(2)}.`,
      available,
    };
  }

  return { ok: true };
}

// ── تلخيص الذمم المدينة ──────────────────────────────────────────────────────

/**
 * مجموع المتبقي على صفوف ذمم — الجزء الحسابي من فحص حدّ الائتمان وأرصدة
 * العملاء. كان هذا الـreduce مكتوباً يدوياً في موضع الاعتماد
 * (app/api/warehouses/orders/[id]/route.ts)، واستُخرج هنا كي يتقاسمه ذلك
 * الموضع مع warehouse-receivables.ts بلا نسختين تنحرفان.
 *
 * السالب يُقصّ إلى صفر: فاتورة سُدِّد فيها أكثر من قيمتها (دفعة زائدة) لا
 * تُخفّض دَين فواتير أخرى تلقائياً.
 */
export function sumOutstanding(rows: Array<{ total: number; paidAmount: number }>): number {
  return rows.reduce(
    (sum, row) => sum + Math.max(safeFinite(row.total) - safeFinite(row.paidAmount), 0),
    0
  );
}

// ── رصيد سابق + مستندات مفتوحة = المستحق الكلي ──────────────────────────────

/**
 * المستحق الكلي على عميل واحد = رصيده السابق (WarehouseCustomer.openingBalance
 * — دَين من قبل انضمام هذا المذخر للمنصة، انظر تعليق الحقل في schema.prisma)
 * + مجموع ما تبقّى من مستندات الذمم المفتوحة لديه (فواتير طلبات المنصة ومبيعات
 * المندوبين الميدانية معاً).
 *
 * كانت هذه العملية مكتوبة مرتين مختلفتين قبل هذا التعديل: مرة في
 * customerOutstanding() (warehouse-receivables.ts، لعميل واحد لفحص حدّ
 * الائتمان) ومرة inline في GET /api/warehouse-portal/customers (تجميع دفعة
 * لكل العملاء دفعة واحدة لأداء أفضل) — ونسخة ثالثة غير مقصودة في
 * app/warehouse/customers/page.tsx (كانت ناقصة حتى دفتر مبيعات المندوبين
 * كلياً). الدالة هنا هي المصدر الوحيد الآن لكل المواضع الثلاثة.
 *
 * الرصيد السابق **يُضاف فوق** مجموع المستندات المفتوحة — لا يحل محله ولا يُشتق
 * منه أبداً. لا تصفير ولا إعادة حساب تلقائية لـopeningBalance هنا مهما بلغت
 * قيمة المستندات المفتوحة أو تغيّرت؛ الحقل يبقى كما أدخله مالك المذخر يدوياً
 * إلى أن يعدّله هو بنفسه من صفحة العملاء.
 *
 * `rows` مجموعة "صفوف" مبلغ/مسدَّد — قد تكون فواتير فردية (استدعاء دقيق لكل
 * صنف) أو صفوف مُجمَّعة مسبقاً بـPrisma groupBy لكل مصدر (invoice/fieldSale)
 * عند التجميع الدفعي لعدّة عملاء معاً؛ كلا الشكلين صحيح رياضياً لأن sumOutstanding
 * تُقصّ كل صفّ سالب إلى صفر قبل الجمع في الحالتين.
 */
export function outstandingWithOpeningBalance(
  openingBalance: number,
  rows: Array<{ total: number; paidAmount: number }>
): number {
  return safeFinite(openingBalance) + sumOutstanding(rows);
}

export interface ReceivableInvoiceInput {
  total: number;
  paidAmount: number;
  status: string;
  dueAt: Date | string | null;
}

export interface ReceivablesSummary {
  /** إجمالي المتبقي على كل الفواتير غير المُلغاة وغير المسدَّدة بالكامل. */
  outstanding: number;
  /** الجزء من outstanding الواقع في أي فئة تقادم غير CURRENT. */
  overdue: number;
  byBucket: Record<AgingBucket, number>;
}

/**
 * يلخّص الذمم المدينة لمذخر: الإجمالي القائم، المتأخر منه، وتوزيعه على فئات
 * التقادم — أساس لوحة app/warehouse/accounts. فواتير CANCELLED و PAID
 * مُستبعدة كلياً من كل الحسابات هنا (لا شيء مستحق منها على الإطلاق).
 */
export function summarizeReceivables(
  invoices: ReceivableInvoiceInput[],
  now: Date = new Date()
): ReceivablesSummary {
  const byBucket: Record<AgingBucket, number> = {
    CURRENT: 0,
    D30: 0,
    D60: 0,
    D90: 0,
    D90_PLUS: 0,
  };

  let outstanding = 0;
  let overdue = 0;

  for (const inv of invoices) {
    if (inv.status === "CANCELLED" || inv.status === "PAID") continue;

    const remaining = Math.max(safeFinite(inv.total) - safeFinite(inv.paidAmount), 0);
    if (remaining <= MONEY_EPSILON) continue;

    const bucket = agingBucket(inv.dueAt, now);
    byBucket[bucket] += remaining;
    outstanding += remaining;
    if (bucket !== "CURRENT") overdue += remaining;
  }

  return { outstanding, overdue, byBucket };
}
