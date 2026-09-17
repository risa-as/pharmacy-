// حالة استلام طلب مذخر من منظور الصيدلية — نقية وقابلة للاختبار.
//
// اعتماد العرض (QUOTED→APPROVED) لا يُدخل شيئاً إلى المخزون: يُنشئ فاتورة شراء
// PENDING فقط (warehouses/orders/[id]/route.ts)، لأن البضاعة لم تصل بعد ولا يُعرف
// رقم الدفعة ولا تاريخ الانتهاء. الدفعات تُنشأ عند «استلام البضاعة»
// (purchase-receipt.ts)، التي تُنشئ صف المخزون أيضاً للدواء غير الموجود فيه.
// هذه الدالة تجعل تلك الخطوة ظاهرة بدل أن يُفهم الاعتماد كاستلام.

export type ReceiptState =
    /** الطلب لم يُعتمد بعد، أو رُفض/أُلغي — لا فاتورة شراء. */
    | 'NOT_APPLICABLE'
    /** معتمد وفاتورته PENDING — الأدوية لم تُضف للدفعات بعد. */
    | 'AWAITING_RECEIPT'
    /** استُلمت الفاتورة — الدفعات موجودة. */
    | 'RECEIVED'
    /** فاتورة الشراء المرتبطة أُلغيت. */
    | 'PURCHASE_CANCELLED'
    /** معتمد لكن الفاتورة المرتبطة غير موجودة (حُذفت أو خارج النطاق). */
    | 'PURCHASE_MISSING';

const RECEIVABLE_ORDER_STATUSES = new Set(['APPROVED', 'SHIPPED', 'DELIVERED']);

/** معرّف فاتورة الشراء من حدث APPROVED — null إن لم يكن الطلب في حالة قابلة للاستلام. */
export function linkedPurchaseId(order: {
    status: string;
    events: Array<{ type: string; payload: unknown }>;
}): string | null {
    if (!RECEIVABLE_ORDER_STATUSES.has(order.status)) return null;
    const approved = order.events.find((e) => e.type === 'APPROVED');
    const payload = approved?.payload as { purchaseId?: unknown } | null | undefined;
    const id = payload?.purchaseId;
    return typeof id === 'string' && id ? id : null;
}

export function receiptState(orderStatus: string, purchaseId: string | null, purchaseStatus: string | null): ReceiptState {
    if (!RECEIVABLE_ORDER_STATUSES.has(orderStatus) || !purchaseId) return 'NOT_APPLICABLE';
    if (purchaseStatus === null) return 'PURCHASE_MISSING';
    if (purchaseStatus === 'PENDING') return 'AWAITING_RECEIPT';
    if (purchaseStatus === 'COMPLETED' || purchaseStatus === 'RECEIVED') return 'RECEIVED';
    if (purchaseStatus === 'CANCELLED') return 'PURCHASE_CANCELLED';
    return 'PURCHASE_MISSING';
}
