// ─── مسودة إدخال المخزون ──────────────────────────────────────────────────────
// تُحفظ في localStorage لتبقى بعد مغادرة الصفحة أو إغلاق التطبيق، ومنفصلة لكل
// مستخدم — نفس أسلوب الفواتير المعلّقة في pos-utils.ts.
//
// السبب: صفحة المخزون تُفكَّك (unmount) عند الانتقال إلى نقطة البيع، فيفقد
// React كل حالة النموذج. الحفظ التلقائي هنا يمنع إعادة كتابة البيانات، ويحمي
// أيضاً من انقطاع الكهرباء أو إغلاق التطبيق فجأة.

const DRAFT_KEY = (userId: string) =>
    `faramace:inventory-draft:${userId || "default"}`;

/** تُهمَل المسودات الأقدم من هذه المدة لتفادي استعادة بيانات قديمة بالخطأ. */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 ساعة

export interface InventoryDraft {
    /** أي نموذج كان مفتوحاً: إضافة دفعة لدواء موجود، أم تسجيل دواء جديد. */
    kind: "batch" | "create-drug";
    /** ISO — يُعرض عمرها للمستخدم ليقرر إن كانت ما تزال صالحة. */
    savedAt: string;

    // ── سياق النموذج ──
    /** kind=batch: معرّف صف المخزون الذي تُضاف إليه الدفعة. */
    inventoryId?: string;
    /** kind=batch: اسم الدواء — للعرض في شريط الاستعادة فقط. */
    drugName?: string;
    /** kind=create-drug: الباركود الذي فُتح به النموذج. */
    barcode?: string;

    /** قيم الحقول. الحقول غير المرتبطة بحالة React تُقرأ من FormData. */
    fields: Record<string, string | number>;
}

export function loadInventoryDraft(userId: string): InventoryDraft | null {
    try {
        const raw = localStorage.getItem(DRAFT_KEY(userId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as InventoryDraft;
        if (!parsed || (parsed.kind !== "batch" && parsed.kind !== "create-drug")) {
            return null;
        }
        // مسودة منتهية الصلاحية: تُحذف بصمت بدل إزعاج المستخدم باستعادتها.
        const age = Date.now() - new Date(parsed.savedAt).getTime();
        if (!Number.isFinite(age) || age > DRAFT_TTL_MS) {
            clearInventoryDraft(userId);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function saveInventoryDraft(userId: string, draft: InventoryDraft): void {
    try {
        localStorage.setItem(DRAFT_KEY(userId), JSON.stringify(draft));
    } catch (e) {
        console.error("فشل حفظ مسودة المخزون", e);
    }
}

export function clearInventoryDraft(userId: string): void {
    try {
        localStorage.removeItem(DRAFT_KEY(userId));
    } catch (e) {
        console.error("فشل حذف مسودة المخزون", e);
    }
}

/**
 * هل تحتوي المسودة على أي بيانات فعلية؟ يمنع حفظ/عرض مسودة فارغة لمجرد أن
 * المستخدم فتح النموذج ثم غادر دون كتابة شيء.
 *
 * الفحص يعتمد على نوع النموذج: حقول «تسجيل دواء جديد» لها قيم افتراضية في
 * الـ JSX (الحد الأدنى=1، الأقصى=10، الكمية=0، تاريخ انتهاء بعد سنتين)، فلو
 * فحصناها فحصاً عاماً لبدا كل نموذج فارغ وكأنه مسودة.
 */
const SIGNIFICANT_FIELDS: Record<InventoryDraft["kind"], string[]> = {
    batch: [
        "quantity",
        "costPrice",
        "expiryDate",
        "supplierId",
        "batchPacketPrice",
        "batchStripsPerPacket",
    ],
    "create-drug": [
        "tradeName",
        "scientificName",
        "origin",
        "price",
        "packetPrice",
        "supplierId",
        "quantity",
        "stripsPerPacket",
    ],
};

/** قيم لا تُعتبر «إدخالاً» لأنها ما يبدأ به النموذج أصلاً. */
const FIELD_DEFAULTS: Record<string, string | number> = {
    stripsPerPacket: 1,
    batchStripsPerPacket: 1,
    quantity: 0,
};

export function draftHasContent(
    kind: InventoryDraft["kind"],
    fields: Record<string, string | number>,
): boolean {
    return SIGNIFICANT_FIELDS[kind].some((key: string) => {
        const v = fields[key];
        if (v === null || v === undefined) return false;
        const text = String(v).trim();
        if (text === "") return false;
        if (key in FIELD_DEFAULTS) return Number(v) !== Number(FIELD_DEFAULTS[key]);
        if (!Number.isNaN(Number(text))) return Number(text) !== 0;
        return true;
    });
}

/** عمر المسودة بصيغة عربية مقروءة، للعرض في شريط الاستعادة. */
export function formatDraftAge(savedAt: string): string {
    const ms = Date.now() - new Date(savedAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "";
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "قبل لحظات";
    if (mins < 60) return `قبل ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `قبل ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `قبل ${days} يوم`;
}
