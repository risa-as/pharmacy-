// المرحلة 2 من ميزة المذاخر: آلة حالات طلب المذخر — المنطق النقي الوحيد المسموح لكل تغيير حالة.
// كل مسارات الـ API (المراحل 3–5) يجب أن تمر عبر canTransition/assertTransition — لا تحديث حالة مباشر.
import { WarehouseOrderStatus } from "@prisma/client";

export type OrderStatus = WarehouseOrderStatus;

/**
 * جدول الانتقالات الشرعية:
 *  DRAFT        → SENT | CANCELLED          (سلة الصيدلي قبل الإرسال)
 *  SENT         → UNDER_REVIEW | QUOTED | CANCELLED
 *  UNDER_REVIEW → QUOTED | CANCELLED        (المذخر يراجع الأصناف)
 *  QUOTED       → APPROVED | REJECTED | CANCELLED  (قرار الصيدلي)
 *  APPROVED     → SHIPPED | CANCELLED       (الإلغاء بعد الاعتماد وقبل الشحن فقط)
 *  SHIPPED      → DELIVERED
 *  DELIVERED / REJECTED / CANCELLED حالات نهائية — لا انتقالات خارجة منها.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["UNDER_REVIEW", "QUOTED", "CANCELLED"],
  UNDER_REVIEW: ["QUOTED", "CANCELLED"],
  QUOTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const TERMINAL_STATUSES: readonly OrderStatus[] = ["DELIVERED", "REJECTED", "CANCELLED"];

/** هل الانتقال من حالة إلى أخرى شرعي؟ (دالة نقية قابلة للاختبار) */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_TRANSITIONS[from] ?? []).includes(to);
}

/** يرمي خطأ برسالة عربية واضحة عند محاولة انتقال غير شرعي — تُستخدم في الـ API. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `انتقال غير شرعي لحالة طلب المذخر: من "${from}" إلى "${to}".`
    );
  }
}
