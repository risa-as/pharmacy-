// طلبات ربط الموردين بالمذاخر — قرارات نقية بلا قاعدة بيانات.
//
// المؤسسة لا تربط بنفسها: الربط يوجّه فواتير مذخر إلى سجل محاسبي، فيبقى قرار
// SUPER_ADMIN (admin/warehouses/[id]/supplier-links). ما تفعله المؤسسة هنا هو رفع
// طلب يراه مدير المنصة ويعتمده أو يرفضه. فحوص التعارض نفسها تُعاد من
// decideSupplierLink كي لا يُقبل طلب سيُرفض ربطه حتماً عند الاعتماد.
import { decideSupplierLink, type LinkCandidateSupplier } from './supplier-warehouse-link';

export type LinkRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export const LINK_REQUEST_STATUS_LABEL: Record<LinkRequestStatus, string> = {
    PENDING: 'قيد المراجعة',
    APPROVED: 'تمت الموافقة',
    REJECTED: 'مرفوض',
    CANCELLED: 'أُلغي',
};

export const LINK_REQUEST_NOTE_MAX = 500;

/** من يرفع طلب ربط: مدير المؤسسة فقط — للربط أثر محاسبي على حساب المورد. */
export function canRequestSupplierLink(role: string): boolean {
    return role === 'ADMIN' || role === 'MANAGER';
}

export type CreateDecision =
    | { ok: true }
    | { ok: false; status: number; code: string; error: string };

export interface CreateLinkRequestInput {
    organizationId: string;
    supplier: LinkCandidateSupplier | null;
    warehouse: { id: string; name: string; isActive: boolean } | null;
    /** مورد هذه المؤسسة المربوط حالياً بالمذخر (يمنعه القيد الفريد). */
    existingLinkForWarehouse: { id: string; name: string } | null;
    /** طلب معلّق لنفس المورد (لأي مذخر). */
    pendingForSupplier: { warehouseName: string } | null;
    /** طلب معلّق من مورد آخر في نفس المؤسسة لنفس المذخر. */
    pendingForWarehouse: { supplierName: string } | null;
}

export function decideCreateLinkRequest(input: CreateLinkRequestInput): CreateDecision {
    const { supplier, warehouse, organizationId } = input;

    // مورد مؤسسة أخرى يُعامل كغير موجود — لا إفصاح عن وجوده (نفس §172).
    if (!supplier || supplier.organizationId !== organizationId) {
        return { ok: false, status: 404, code: 'SUPPLIER_NOT_FOUND', error: 'المورد غير موجود.' };
    }
    if (!warehouse || !warehouse.isActive) {
        return { ok: false, status: 404, code: 'WAREHOUSE_NOT_FOUND', error: 'المذخر غير موجود أو غير مفعّل.' };
    }

    const link = decideSupplierLink({
        supplier,
        warehouseId: warehouse.id,
        organizationId,
        existingLinkForWarehouse: input.existingLinkForWarehouse,
    });
    if (link.action === 'ALREADY_LINKED') {
        return { ok: false, status: 409, code: 'ALREADY_LINKED', error: `المورد «${supplier.name}» مربوط بهذا المذخر أصلاً.` };
    }
    if (link.action !== 'LINK') {
        return { ok: false, status: link.action === 'WRONG_ORG' ? 400 : 409, code: link.action, error: link.reason ?? 'لا يمكن ربط هذا المورد.' };
    }

    if (input.pendingForSupplier) {
        return {
            ok: false, status: 409, code: 'PENDING_EXISTS',
            error: `يوجد طلب ربط قيد المراجعة لهذا المورد مع «${input.pendingForSupplier.warehouseName}». ألغِه أولاً إن أردت تغييره.`,
        };
    }
    if (input.pendingForWarehouse) {
        return {
            ok: false, status: 409, code: 'WAREHOUSE_PENDING_EXISTS',
            error: `يوجد طلب ربط قيد المراجعة لهذا المذخر مع المورد «${input.pendingForWarehouse.supplierName}».`,
        };
    }
    return { ok: true };
}

/** يُحسم الطلب المعلّق فقط؛ الطلب المحسوم لا يُعاد فتحه. */
export function canDecideLinkRequest(status: string): boolean {
    return status === 'PENDING';
}

export function sanitizeNote(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const t = raw.trim().slice(0, LINK_REQUEST_NOTE_MAX);
    return t || null;
}
