/**
 * warehouse-purchases.ts
 *
 * مشتريات المذخر وذممه الدائنة: منطق نقي بالكامل — بلا استيراد Prisma وبلا
 * next/*، قابل للاختبار مباشرة تحت إعداد vitest في هذا المستودع (الذي لا
 * يحل alias "@/*")، بنفس انضباط app/lib/warehouse-stock.ts وapp/lib/
 * warehouse-bonus.ts وapp/lib/warehouse-accounts.ts.
 *
 * هذا الملف **لا يعيد** حساب حالة الفاتورة أو تطبيق الدفعات أو التقادم —
 * تلك الرياضيات موجودة بالفعل في app/lib/warehouse-accounts.ts
 * (computeInvoiceStatus/applyPayment/agingBucket/computeDueDate/
 * summarizeReceivables) وهي **نقيّة من اتجاه العلاقة**: تُدخِل فقط
 * {total, paidAmount, status, dueAt} بلا أي افتراض عن كون الفاتورة مدينة أو
 * دائنة. مسار POST /api/warehouse-portal/purchases/[id]/payments يستوردها
 * ويستخدمها حرفياً بنفس compare-and-swap المستخدَم في مسار دفعات فواتير
 * البيع — لا نسخة موازية منها هنا، فهذا بالضبط ما طلبته المهمة (نفس
 * الرياضيات بالاتجاه المعاكس).
 *
 * ما يخصّ هذا الملف حصراً هو حساب **بنود** فاتورة الشراء نفسها: الإجمالي
 * المُشتق من البنود (لا يُقبَل من جسم الطلب مباشرة)، عدد الوحدات التي تدخل
 * المخزون فعلياً (مدفوعة + بونص)، والتحقق من صحة سطر واحد قبل أي كتابة.
 */

import { totalUnitsLeavingStock } from "./warehouse-bonus";

function safeNonNegative(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

// ── إجمالي فاتورة الشراء ─────────────────────────────────────────────────────

export interface PurchaseLineTotalInput {
  quantity: number;
  unitCost: number;
}

/**
 * الإجمالي الحقيقي لفاتورة شراء = مجموع (الكمية المدفوعة الثمن × كلفة
 * الوحدة) لكل سطر — **بلا** وحدات البونص (bonusQuantity)، فهي مجانية بالتعريف
 * ولا تدخل الإجمالي مهما دخلت المخزون فعلياً (انظر purchaseStockUnits أدناه
 * للفرق). سطر بكلفة وحدة صفرية (بونص كامل السطر) يساهم بصفر تماماً، لا
 * بخطأ أو NaN — هذا هو بالضبط الحماية التي يجب ألا تصفّر تكلفة الكتالوج
 * (انظر التعليق في مسار POST /api/warehouse-portal/purchases).
 *
 * الخادم يستخدم هذه الدالة حصراً لحساب WarehousePurchase.total — لا يُقبَل
 * أي total من جسم الطلب مباشرة (وإلا حدّد المذخر رقماً غير مطابق لبنوده).
 */
export function computePurchaseTotal(lines: PurchaseLineTotalInput[]): number {
  return lines.reduce((sum, line) => {
    const quantity = safeNonNegative(line.quantity);
    const unitCost = safeNonNegative(line.unitCost);
    return sum + quantity * unitCost;
  }, 0);
}

// ── وحدات المخزون الفعلية لسطر شراء ──────────────────────────────────────────

/**
 * كم وحدة تدخل المخزون فعلياً من سطر شراء واحد = المدفوعة (quantity) +
 * المجانية (bonusQuantity) — كلتاهما بضاعة حقيقية تدخل نفس الدفعة
 * (WarehouseBatch.quantity)، بصرف النظر عن أن total الفاتورة يحسب المدفوعة
 * فقط. يعيد استخدام totalUnitsLeavingStock من warehouse-bonus.ts حرفياً
 * (نفس جمع "مباع/مشترى + بونص")، لا نسخة موازية منه — الاسمان مختلفان
 * (بيع مقابل شراء) لكن الجمع رياضياً هو نفسه بالضبط.
 */
export function purchaseStockUnits(input: { quantity: number; bonusQuantity: number }): number {
  return totalUnitsLeavingStock({ soldQuantity: input.quantity, bonusQuantity: input.bonusQuantity });
}

// ── التحقق من سطر شراء واحد ──────────────────────────────────────────────────

export interface ValidatePurchaseLineInput {
  quantity: number;
  unitCost: number;
  bonusQuantity?: number;
  expiryDate: Date | string;
}

export type ValidatePurchaseLineResult = { ok: true } | { ok: false; error: string };

/**
 * يتحقق من صحة سطر واحد في فاتورة شراء قبل أي كتابة — يُستدعى لكل سطر في
 * POST /api/warehouse-portal/purchases.
 *
 * القواعد:
 * - quantity: عدد صحيح موجب حصراً (صفر أو سالب أو كسري أو NaN/Infinity مرفوض).
 *   سطر "بونص بالكامل" (وحدات مجانية فقط بلا وحدات مدفوعة) ليس سطر شراء
 *   بالتعريف — لا يمثَّل بـ quantity: 0، بل يُدخَل ضمن سطر آخر مدفوع أو
 *   يُرفَض هنا؛ هذا يطابق حرفياً "الكمية يجب أن تكون عدداً صحيحاً موجباً"
 *   لنفس السطر في validateStockMove.
 * - unitCost: رقم منتهٍ غير سالب — **سالب مرفوض، صفر مقبول** (سطر بكلفة صفر
 *   مشروع تماماً: بونص كامل على سطر منفصل بكمية مدفوعة صفرية ليس ممكناً هنا
 *   لأن quantity > 0 مطلوب، لكن سطراً حصل عليه المذخر مجاناً بالكامل ضمن
 *   مساومة تجارية يُمثَّل بـ unitCost: 0 وquantity > 0 — راجع التعليق في
 *   computePurchaseTotal).
 * - bonusQuantity: عدد صحيح غير سالب — الافتراضي صفر عند الغياب.
 * - expiryDate: تاريخ صالح فعلاً، ويجب أن يكون **مستقبلياً** (أكبر من `now`
 *   الحالية) — شراء دفعة منتهية الصلاحية بالفعل خطأ دائماً، نفس قاعدة
 *   استلام دفعة يدوية في POST /api/warehouse-portal/stock/receipt (لا
 *   استثناء هنا أيضاً).
 */
export function validatePurchaseLine(
  input: ValidatePurchaseLineInput,
  now: Date = new Date()
): ValidatePurchaseLineResult {
  if (typeof input.quantity !== "number" || !Number.isFinite(input.quantity) || !Number.isInteger(input.quantity) || input.quantity <= 0) {
    return { ok: false, error: "الكمية يجب أن تكون عدداً صحيحاً موجباً." };
  }

  if (typeof input.unitCost !== "number" || !Number.isFinite(input.unitCost) || input.unitCost < 0) {
    return { ok: false, error: "كلفة الوحدة يجب أن تكون رقماً غير سالب." };
  }

  const bonusQuantity = input.bonusQuantity ?? 0;
  if (typeof bonusQuantity !== "number" || !Number.isFinite(bonusQuantity) || !Number.isInteger(bonusQuantity) || bonusQuantity < 0) {
    return { ok: false, error: "كمية البونص يجب أن تكون عدداً صحيحاً غير سالب." };
  }

  const expiry = input.expiryDate instanceof Date ? input.expiryDate : new Date(input.expiryDate);
  if (Number.isNaN(expiry.getTime())) {
    return { ok: false, error: "تاريخ انتهاء غير صالح." };
  }
  if (expiry.getTime() <= now.getTime()) {
    return { ok: false, error: "لا يمكن شراء دفعة منتهية الصلاحية بالفعل — تحقق من تاريخ الانتهاء." };
  }

  return { ok: true };
}
