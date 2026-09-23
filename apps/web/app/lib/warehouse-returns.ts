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
  /** الكمية المحجوزة سابقاً: PENDING + ACCEPTED عند الإنشاء، وACCEPTED عند اعتماد القرار. */
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

/** Reduces the invoice net total. Any excess paid balance is recorded as a credit note by the transactional caller. */
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

  if (newTotal < -MONEY_EPSILON) {
    return {
      ok: false,
      error: 'قيمة الإرجاع تتجاوز قيمة الفاتورة المتبقية بعد المرتجعات السابقة.',
    };
  }

  const newStatus = computeInvoiceStatus({ total: Math.max(0, newTotal), paidAmount });

  return { ok: true, newTotal: Math.max(0, newTotal), newStatus };
}
