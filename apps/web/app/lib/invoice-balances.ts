// invoice-balances.ts
//
// الرصيد السابق/الحالي المطبوعان على ورقة فاتورة البيع التي تسافر مع البضاعة
// (app/warehouse/print/picking/[orderId]/page.tsx) — منطق نقي بالكامل، بلا
// Prisma وبلا next/*، قابل للاختبار مباشرة تحت إعداد vitest في هذا المستودع،
// بنفس انضباط app/lib/warehouse-accounts.ts (الذي يُعاد استخدام MONEY_EPSILON
// منه هنا بدل ثابت مواز).
//
// المشكلة: customerOutstanding() في warehouse-receivables.ts تُرجع «المستحق
// الآن» (current) فقط — مجموع كل فواتير هذا العميل المفتوحة (UNPAID/PARTIAL،
// من دفترَي WarehouseInvoice وWarehouseFieldSale معاً). هذا الرقم لا يعرف شيئاً
// عن فاتورة هذا الطلب تحديداً، بينما الورقة المطبوعة تحتاج أيضاً «الرصيد
// السابق» (ما كان مستحقاً قبل هذه الفاتورة/الشحنة تحديداً) — فيُشتق previous
// هنا حسب حالة فاتورة هذا الطلب:
//
//   - الفاتورة موجودة **وضمن current فعلاً** (UNPAID أو PARTIAL — تطابق
//     OPEN_STATUSES في warehouse-receivables.ts حرفياً): ساهمت بـ
//     (total - paidAmount) في current، فـ previous = current - مساهمتها.
//   - الفاتورة موجودة لكن **خارج current** (PAID أو CANCELLED): لم تُحتسب في
//     current أصلاً (customerOutstanding تستبعدها من استعلامها). previous
//     يبقى = current بلا أي طرح — طرح مساهمتها كان سيُنقص رصيداً لم يُضَف
//     أصلاً. هذا حاسم لفاتورة CANCELLED تحديداً: قد يبقى
//     (total - paidAmount) كبيراً رغم إلغائها، وطرحه كان سيطبع رصيداً سابقاً
//     سالباً على ورقة تُسلَّم للعميل.
//   - **لا فاتورة بعد** (لم يُعتمَد الطلب بعد، أو هذه أول طباعة معاينة قبل أي
//     اعتماد): previous = current كما هو، وthisOutstanding = صافي هذه الورقة
//     (sheetNetTotal، مجموع بنودها عبر effectiveLine) — و current المطبوع
//     يُعاد بناؤه هنا كـ previous + thisOutstanding، أي "ما سيصبح عليه رصيد
//     العميل بعد هذه الشحنة" حتى قبل أن يُنشئ النظام فاتورتها فعلياً.
//
// الثابت الذي يُبنى الحساب حوله عمداً ويجب أن يصحّ دائماً: current المُعاد هنا
// = previous + thisOutstanding — بالتشييد (construction) لا بالمصادفة، في كل
// الحالات الأربع أعلاه. ورقة تُسلَّم للعميل لا يصحّ أن تطبع ثلاثة أرقام لا
// تتجمّع؛ كل اختبار أدناه يتحقق من هذا الثابت صراحة.

import { MONEY_EPSILON } from "./warehouse-accounts";

/** يطابق WarehouseInvoiceStatus في schema.prisma حرفياً — بلا استيراد Prisma هنا. */
export type InvoiceBalanceStatus = "UNPAID" | "PARTIAL" | "PAID" | "CANCELLED";

/** الحالات المحتسبة فعلياً ضمن current — يطابق OPEN_STATUSES في warehouse-receivables.ts. */
const COUNTED_IN_CURRENT: ReadonlySet<InvoiceBalanceStatus> = new Set<InvoiceBalanceStatus>([
  "UNPAID",
  "PARTIAL",
]);

export interface InvoiceBalanceInvoice {
  total: number;
  paidAmount: number;
  status: InvoiceBalanceStatus;
}

export interface ComputeInvoiceBalancesInput {
  /** المستحق الآن على هذا العميل من كل الدفاتر — customerOutstanding() في warehouse-receivables.ts. */
  current: number;
  /** فاتورة هذا الطلب إن وُجدت (WarehouseInvoice.orderId فريد) — null قبل الاعتماد. */
  invoice: InvoiceBalanceInvoice | null;
  /**
   * صافي هذه الورقة (مجموع بنودها عبر effectiveLine) — يُستخدَم **فقط** حين
   * invoice === null. يُتجاهَل تماماً عند وجود فاتورة: thisOutstanding عندها
   * يُشتق من الفاتورة نفسها (total/paidAmount)، لا من إعادة حساب البنود، كي
   * لا يختلف الرصيد المطبوع عن الفاتورة المالية الفعلية.
   */
  sheetNetTotal: number;
}

export interface InvoiceBalances {
  /** الرصيد السابق — قبل هذه الفاتورة/الشحنة تحديداً. */
  previous: number;
  /** مساهمة هذه الفاتورة/الشحنة في المستحق. */
  thisOutstanding: number;
  /** الرصيد الحالي المطبوع — previous + thisOutstanding دائماً (انظر تعليق الملف). */
  current: number;
}

/** رقم غير سالب ومنتهٍ، وإلا صفر — نفس انضباط safeNonNegative في warehouse-quote.ts/warehouse-bonus.ts. */
function safeNonNegative(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

export function computeInvoiceBalances(input: ComputeInvoiceBalancesInput): InvoiceBalances {
  const current = safeNonNegative(input.current);

  if (!input.invoice) {
    const thisOutstanding = safeNonNegative(input.sheetNetTotal);
    return { previous: current, thisOutstanding, current: current + thisOutstanding };
  }

  const { total, paidAmount, status } = input.invoice;

  if (!COUNTED_IN_CURRENT.has(status)) {
    // PAID أو CANCELLED: لا تظهر في current أصلاً (customerOutstanding تستبعدها) —
    // previous يبقى كما هو، ومساهمة هذه الفاتورة في المطبوع صفر بصرف النظر عن
    // total/paidAmount الفعليين (قد يكونا كبيرين لفاتورة مُلغاة).
    return { previous: current, thisOutstanding: 0, current };
  }

  // UNPAID/PARTIAL: مساهمتها الفعلية = المتبقي عليها، مقصوص عند الصفر (نفس
  // انضباط sumOutstanding في warehouse-accounts.ts) — فاتورة سُدِّد فيها أكثر
  // من قيمتها (دفعة زائدة نادرة) لا تُنتج مساهمة سالبة تُضخّم previous خطأً.
  const thisOutstanding = Math.max(safeNonNegative(total) - safeNonNegative(paidAmount), 0);
  // previous مقصوص عند الصفر دفاعياً: current المُدخَل من قاعدة بيانات قد يكون
  // (نادراً، سباق تحديث) أصغر من مساهمة هذه الفاتورة وحدها — previous سالب لا
  // معنى مالياً له على ورقة تُسلَّم للعميل.
  const previous = Math.max(current - thisOutstanding, 0);
  return { previous, thisOutstanding, current: previous + thisOutstanding };
}
