// المرحلة 5 من نظام المذاخر B2B (الصقل التجاري) — §Part 4: إرجاعات/إشعارات
// دائن. منطق نقي بالكامل — بلا استيراد Prisma وبلا next/*، بنفس انضباط
// app/lib/warehouse-quote.ts وapp/lib/warehouse-accounts.ts. يعيد استخدام
// MONEY_EPSILON وcomputeInvoiceStatus من warehouse-accounts.ts حصراً — لا
// إعادة تعريف قاعدة "متى تُعتبر فاتورة مسدَّدة" هنا بقاعدة مختلفة.
//
// يغطي ملفان مستقلّان من مسار قبول الإرجاع (PATCH
// /api/warehouse-portal/returns/[id]):
//   - validateReturnQuantity: سقف الكمية القابلة للإرجاع على بند طلب واحد —
//     لا يتجاوز ما شُحن فعلياً ناقص ما أُرجِع واعتُمد سابقاً على نفس البند.
//   - applyReturnCredit: أثر قبول الإرجاع على فاتورة المذخر — تخفيض
//     الإجمالي وإعادة حساب الحالة، مع حارس صريح ضد رصيد سالب.
import { MONEY_EPSILON, computeInvoiceStatus, type WarehouseInvoiceStatusValue } from "./warehouse-accounts";

// ── سقف الكمية القابلة للإرجاع ───────────────────────────────────────────────

export interface ValidateReturnQuantityInput {
  /** الكمية الفعلية التي شُحنت فعلاً على هذا البند (effectiveLine().quantity وقت الشحن). */
  shippedQuantity: number;
  /** مجموع الكميات على إرجاعات سابقة **مقبولة** فقط لنفس الطلب/الصنف — الطلبات PENDING/REJECTED لا تُحتسَب. */
  alreadyAcceptedQuantity: number;
  /** الكمية المطلوب إرجاعها الآن. */
  requestedQuantity: number;
}

export type ValidateReturnQuantityResult = { ok: true } | { ok: false; error: string };

/**
 * يمنع تكديس إرجاعات متكرّرة على نفس البند تستنزف الفاتورة إلى ما دون ما
 * شُحن فعلياً: الكمية المطلوبة الآن + كل ما سبق قبوله لا يجوز أن يتجاوز
 * الكمية المشحونة أصلاً على هذا البند. requestedQuantity <= 0 أو غير عدد
 * صحيح موجب يُرفض دائماً — إرجاع صفري أو سالب لا معنى له.
 */
export function validateReturnQuantity(input: ValidateReturnQuantityInput): ValidateReturnQuantityResult {
  const { requestedQuantity } = input;

  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    return { ok: false, error: "كمية الإرجاع يجب أن تكون عدداً صحيحاً موجباً." };
  }

  const shippedQuantity = Number.isFinite(input.shippedQuantity) ? input.shippedQuantity : 0;
  const alreadyAcceptedQuantity = Number.isFinite(input.alreadyAcceptedQuantity) ? input.alreadyAcceptedQuantity : 0;

  const remaining = Math.max(shippedQuantity - alreadyAcceptedQuantity, 0);

  if (requestedQuantity > remaining) {
    return {
      ok: false,
      error: `الكمية المطلوب إرجاعها تتجاوز المتاح فعلياً لهذا الصنف على هذا الطلب. المتاح للإرجاع: ${remaining}.`,
    };
  }

  return { ok: true };
}

// ── أثر قبول الإرجاع على الفاتورة ────────────────────────────────────────────

export interface ApplyReturnCreditInput {
  invoiceTotal: number;
  invoicePaidAmount: number;
  invoiceStatus: WarehouseInvoiceStatusValue | string;
  /** قيمة الإرجاع (سطور الإرجاع × أسعارها الفعلية) — تُحسَب على الخادم دائماً، لا تُقبَل من جسم الطلب. */
  creditAmount: number;
}

export type ApplyReturnCreditResult =
  | { ok: true; newTotal: number; newStatus: WarehouseInvoiceStatusValue }
  | { ok: false; error: string };

/**
 * يطبّق إشعاراً دائناً (إرجاع مقبول) على فاتورة مذخر: يخفّض الإجمالي بقيمة
 * الإرجاع ويعيد حساب الحالة عبر computeInvoiceStatus() — نفس القاعدة
 * المستخدمة لكل فاتورة أخرى في النظام، فلا تتفرّق حالتا الفاتورة (المسار
 * العادي ومسار الإرجاع) بقاعدتين مختلفتين.
 *
 * يرفض:
 *   - فاتورة CANCELLED — لا معنى لإشعار دائن على فاتورة مُلغاة أصلاً (لا دين
 *     قائم عليها ليُخفَّض).
 *   - creditAmount غير موجب أو غير منتهٍ.
 *   - **الحارس الجوهري**: لو أدّى تخفيض الإجمالي إلى total جديد أقل من
 *     paidAmount الحالي (بهامش MONEY_EPSILON — نفس هامش كل فاتورة في
 *     warehouse-accounts.ts)، تُرفَض العملية بدل إنتاج فاتورة "مسدَّدة أكثر
 *     من إجمالها" (رصيد سالب فعلياً). الرسالة تُخبر صراحة أن المطلوب ردّ
 *     مبلغ نقدي للصيدلية، لا مجرد تعديل رقم على الفاتورة.
 *
 * انتقالات الحالة الحقيقية بعد تخفيض total (لا تُختبَر انتقالات مستحيلة مثل
 * PAID→PARTIAL، فالإجمالي ينخفض دائماً فيقترب من paidAmount أو يساويه، فلا
 * يمكن لفاتورة PAID أن تصبح PARTIAL بتخفيض إجماليها هي نفسها):
 *   - PARTIAL → PAID: إجمالي جديد يساوي المسدَّد فعلاً (خصماً أدى لتصفية الدين).
 *   - PARTIAL → PARTIAL: خصم لا يكفي لتصفية الدين بالكامل.
 *   - UNPAID → UNPAID: خصم على فاتورة لم يُسدَّد عليها شيء بعد.
 */
export function applyReturnCredit(input: ApplyReturnCreditInput): ApplyReturnCreditResult {
  if (input.invoiceStatus === "CANCELLED") {
    return { ok: false, error: "لا يمكن اعتماد إرجاع على فاتورة مُلغاة." };
  }

  const { creditAmount } = input;
  if (typeof creditAmount !== "number" || !Number.isFinite(creditAmount) || creditAmount <= 0) {
    return { ok: false, error: "قيمة الإرجاع يجب أن تكون رقماً موجباً صالحاً." };
  }

  const total = Number.isFinite(input.invoiceTotal) ? input.invoiceTotal : 0;
  const paidAmount = Number.isFinite(input.invoicePaidAmount) ? input.invoicePaidAmount : 0;

  const newTotal = total - creditAmount;

  if (newTotal < paidAmount - MONEY_EPSILON) {
    return {
      ok: false,
      error: `قيمة الإرجاع تتجاوز المتبقي غير المسدَّد على الفاتورة (المسدَّد فعلاً: ${paidAmount.toFixed(
        2
      )}) — يلزم ردّ الفرق نقداً للصيدلية قبل اعتماد هذا الإرجاع.`,
    };
  }

  const newStatus = computeInvoiceStatus({ total: newTotal, paidAmount });

  return { ok: true, newTotal, newStatus };
}
