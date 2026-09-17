// المرحلة 1 من ميزة «طلب الأدوية حسب الاحتياج»: قرار ربط مورد محلي بمذخر — نقي
// وقابل للاختبار بلا قاعدة بيانات، بنفس نمط decideMirrorSupplier في
// app/lib/warehouse-purchase-bridge.ts.
//
// لماذا الربط أصلاً: عند اعتماد أول طلب من مذخر يُنشئ الجسر مورداً مرآةً جديداً
// باسم «مذخر على المنصة: X» بلا أي تاريخ أسعار. فإن كانت الصيدلية تشتري من هذا
// المذخر منذ سنة تحت اسم مورد محلي، فتاريخها كله يبقى معلقاً بالمورد القديم
// ولا يصل إلى المذخر. الربط يجعل decideMirrorSupplier يعيد USE للمورد الموجود
// فيحتفظ التاريخ والرصيد بمكانهما — لا نقل ولا دمج ولا إنشاء نسخة.
//
// القيد @@unique([organizationId, warehouseId]) على Supplier هو الحَكَم النهائي؛
// هذه الدالة تُنتج رسالة مفهومة قبل أن يصطدم الطلب بالقيد، ولا تحلّ محله.

/** المورد المرشَّح للربط — أصغر سطح مطلوب. */
export interface LinkCandidateSupplier {
    id: string;
    name: string;
    /** مؤسسة المورد. null يعني مورداً بلا مؤسسة — لا يُربط أبداً (§4.3). */
    organizationId: string | null;
    /** مذخر مرتبط به سابقاً — null يعني غير مرتبط. */
    warehouseId: string | null;
}

export interface SupplierLinkDecisionInput {
    supplier: LinkCandidateSupplier;
    /** المذخر المقصود ربطه. */
    warehouseId: string;
    /** المؤسسة التي اختارها المشرف صراحةً في النافذة. */
    organizationId: string;
    /**
     * المورد المرتبط حالياً بهذا (المؤسسة، المذخر) إن وُجد — أي ما يمنعه القيد
     * الفريد. null يعني لا ارتباط قائم.
     */
    existingLinkForWarehouse: { id: string; name: string } | null;
}

export type SupplierLinkAction =
    /** مرتبط مسبقاً بنفس المذخر — الطلب متكرر ويعيد نجاحاً بلا أثر (§174). */
    | "ALREADY_LINKED"
    /** يُربط الآن. */
    | "LINK"
    /** المورد مرتبط بمذخر آخر — لا استبدال تلقائي (§175). */
    | "CONFLICT_SUPPLIER_LINKED_ELSEWHERE"
    /** لهذه المؤسسة مورد آخر مرتبط بهذا المذخر — لا استبدال تلقائي (§175). */
    | "CONFLICT_WAREHOUSE_HAS_SUPPLIER"
    /** المورد لا يتبع المؤسسة المختارة (§172). */
    | "WRONG_ORG";

export interface SupplierLinkDecision {
    action: SupplierLinkAction;
    /** رسالة عربية جاهزة للعرض — موجودة على الحالات المانعة فقط. */
    reason?: string;
}

/**
 * يقرر ما يحدث لطلب ربط واحد. لا يكتب شيئاً ولا يستعلم عن شيء.
 *
 * ترتيب الفحوص مقصود: انتماء المؤسسة أولاً، لأن فحص أي تعارض ربط قبل التأكد من
 * أن المورد يخص المؤسسة المختارة كان سيُفصح عن حالة ربط مورد مؤسسة أخرى.
 */
export function decideSupplierLink(input: SupplierLinkDecisionInput): SupplierLinkDecision {
    const { supplier, warehouseId, organizationId, existingLinkForWarehouse } = input;

    // مورد بلا مؤسسة لا يُربط تلقائياً بالمؤسسة المختارة (§130).
    if (!supplier.organizationId) {
        return {
            action: "WRONG_ORG",
            reason: "هذا المورد غير تابع لأي مؤسسة، فلا يمكن ربطه بمذخر لصالح مؤسسة.",
        };
    }

    if (supplier.organizationId !== organizationId) {
        return {
            action: "WRONG_ORG",
            reason: "المورد المختار لا يتبع المؤسسة المحددة.",
        };
    }

    // مرتبط مسبقاً بنفس المذخر: تكرار غير ضار.
    if (supplier.warehouseId === warehouseId) {
        return { action: "ALREADY_LINKED" };
    }

    if (supplier.warehouseId) {
        return {
            action: "CONFLICT_SUPPLIER_LINKED_ELSEWHERE",
            reason: `المورد «${supplier.name}» مرتبط بمذخر آخر بالفعل. فكّ الربط الحالي أولاً — لا يُستبدل تلقائياً.`,
        };
    }

    // القيد الفريد: مورد واحد لكل (مؤسسة، مذخر).
    if (existingLinkForWarehouse && existingLinkForWarehouse.id !== supplier.id) {
        return {
            action: "CONFLICT_WAREHOUSE_HAS_SUPPLIER",
            reason: `هذه المؤسسة تربط هذا المذخر بالمورد «${existingLinkForWarehouse.name}» بالفعل. لا يمكن ربط مورد ثانٍ بنفس المذخر.`,
        };
    }

    return { action: "LINK" };
}

/** حالات التعارض التي تُترجَم إلى 409، تمييزاً لها عن 400 و403 (§8.5). */
export function isLinkConflict(action: SupplierLinkAction): boolean {
    return (
        action === "CONFLICT_SUPPLIER_LINKED_ELSEWHERE" ||
        action === "CONFLICT_WAREHOUSE_HAS_SUPPLIER"
    );
}
