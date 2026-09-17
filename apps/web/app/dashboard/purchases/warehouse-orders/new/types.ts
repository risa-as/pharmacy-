// المرحلة 3 من ميزة «طلب الأدوية حسب الاحتياج»: الأنواع المشتركة بين مكوّنات الصفحة.
// مطابقة لما تعيده مسارات /api/purchases/* — لا تُشتق من أنواع Prisma عمداً كي لا
// يتسرّب شكل قاعدة البيانات إلى المتصفح.

export type DrugOrderability =
    | 'GLOBAL'
    | 'MAPPED_BY_BARCODE'
    | 'NO_BARCODE'
    | 'NO_GLOBAL_MATCH'
    | 'AMBIGUOUS_BARCODE';

export interface DrugSearchResult {
    id: string;
    barcode: string;
    tradeName: string;
    scientificName: string | null;
    origin: string | null;
    isOrgPrivate: boolean;
    currentStock: number;
    /** له صف مخزون في فروعك؛ false = دواء من كتالوج المنصة لم تخزّنه من قبل. */
    inInventory?: boolean;
    /** المقابل العالمي — بدونه لا إرسال (§150). */
    globalDrugId: string | null;
    orderability: DrugOrderability;
    orderabilityReason: string | null;
}

export type PriceSource = 'BATCH' | 'COMPLETED_PURCHASE';

export type PriceQualityReason =
    | 'UNVERIFIED_UNIT'
    | 'NON_POSITIVE_PRICE'
    | 'UNKNOWN_SUPPLIER'
    | 'AMBIGUOUS_SAME_INSTANT';

export interface SupplierPriceOption {
    supplierId: string;
    supplierName: string;
    warehouseId: string | null;
    warehouseName: string | null;
    price: number | null;
    recordedAt: string | null;
    source: PriceSource;
    sourceBranchId: string;
    unitLabel: string;
    comparable: boolean;
    qualityReason: PriceQualityReason | null;
    orderable: boolean;
    orderabilityReason: string | null;
    ageDays: number | null;
    isStale: boolean;
}

export interface DrugComparison {
    cheapest: SupplierPriceOption | null;
    cheapestOrderable: SupplierPriceOption | null;
    options: SupplierPriceOption[];
    hasPrice: boolean;
}

/** سطر واحد في قائمة الاحتياج. */
export interface NeedLine {
    unitConfirmed?: boolean;
    /** معرّف الدواء كما تراه المؤسسة — قد يكون صفاً خاصاً بها. */
    drugId: string;
    globalDrugId: string | null;
    barcode: string;
    tradeName: string;
    scientificName: string | null;
    currentStock: number;
    /** اختياري لأن جلسات sessionStorage الأقدم لا تحمله. */
    inInventory?: boolean;
    orderability: DrugOrderability;
    orderabilityReason: string | null;
    quantity: number;
    /** null = لم تُجلب المقارنة بعد. */
    comparison: DrugComparison | null;
    /** المورد المختار. '' يعني «بلا مورد». */
    selectedSupplierId: string | null;
    /**
     * اختار المستخدم المورد بنفسه؟ إن كان كذلك فإعادة جلب الأسعار لا تستبدل
     * اختياره بصمت (§79)، بل تُظهر تغيّر السعر وتترك القرار له.
     */
    manuallyChosen: boolean;
    /**
     * سعر المورد المختار **لحظة الاختيار اليدوي**. §79 لا يكتفي بعدم استبدال
     * الاختيار عند إعادة الجلب، بل يوجب إظهار تغيّر السعر — وبدون هذه اللقطة لا
     * توجد قيمة يُقارَن بها فيتغيّر الرقم بصمت.
     */
    chosenPriceAtSelection: number | null;
    /** مذخر اختاره المستخدم يدوياً لدواء بلا تاريخ سعر (§81). */
    manualWarehouseId: string | null;
    manualWarehouseName: string | null;
    /**
     * مورد محلي غير مربوط بمذخر اختاره المستخدم لطلب يدوي (هاتف/واتساب/طباعة).
     * لا يدخل أي طلب إلكتروني أبداً — يذهب إلى قائمة الطلب اليدوي مجمَّعاً باسمه.
     * اختياري لأن جلسات sessionStorage الأقدم لا تحمله.
     */
    manualSupplierId?: string | null;
    manualSupplierName?: string | null;
}

export const QUALITY_LABEL: Record<PriceQualityReason, string> = {
    UNVERIFIED_UNIT: 'سعر تاريخي غير مؤهل للترشيح قبل مراجعة صحته ووحدة الكمية — لا يوجد توثيق للوحدة في السجل',
    NON_POSITIVE_PRICE: 'أحدث سجل بلا سعر مدفوع (بونص أو قيمة غير صالحة) — يحتاج مراجعة',
    UNKNOWN_SUPPLIER: 'سجل بلا مورد معروف',
    AMBIGUOUS_SAME_INSTANT: 'سجلان بنفس اللحظة بسعرين مختلفين — تعارض يحتاج مراجعة',
};

export const SOURCE_LABEL: Record<PriceSource, string> = {
    BATCH: 'تاريخ تسجيل الدفعة',
    COMPLETED_PURCHASE: 'تاريخ تسجيل الفاتورة',
};

export function formatIQD(n: number): string {
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

/** مذخر نشط في دليل المنصة — لطلب تسعير صنف بلا تاريخ سعر (§81). */
export interface ActiveWarehouse {
    id: string;
    name: string;
    city?: string | null;
    /** مورد هذه المؤسسة المربوط بالمذخر — null يعني أن أول طلب معتمد سيُنشئ مورداً جديداً. */
    linkedSupplier?: { id: string; name: string } | null;
    /** توجد علاقة تجارية مع هذا المذخر (عميل لديه أو طلبات سابقة). */
    isRelated?: boolean;
    /** موردون محليون غير مربوطين يُحتمل أنهم نفس هذا المذخر — تحذير لا منع. */
    possibleDuplicates?: Array<{ supplierId: string; supplierName: string; reason: 'PHONE' | 'NAME' }>;
}

/** مورد محلي للمؤسسة — للطلب اليدوي إن لم يكن مربوطاً بمذخر. */
export interface OrgSupplier {
    id: string;
    name: string;
    phone: string | null;
    warehouseId: string | null;
    warehouseName: string | null;
}

/**
 * هل تغيّر سعر المورد المختار يدوياً منذ اختياره؟ يُظهَر للمستخدم ولا يُستبدل
 * اختياره تلقائياً (§79).
 */
export function priceDrift(line: NeedLine): { from: number; to: number } | null {
    if (!line.manuallyChosen || line.chosenPriceAtSelection === null) return null;
    const opt = selectedOption(line);
    if (!opt || opt.price === null) return null;
    return opt.price === line.chosenPriceAtSelection
        ? null
        : { from: line.chosenPriceAtSelection, to: opt.price };
}

/** الخيار المعروض لسطر: اختيار المستخدم إن وُجد، وإلا الأرخص. */
export function selectedOption(line: NeedLine): SupplierPriceOption | null {
    // اختيار جهة يدوية (مذخر لطلب تسعير أو مورد لطلب يدوي) يُلغي عرض الأرخص،
    // وإلا تسرّب سعره إلى عمود السعر والإجمالي وهو ليس ما سيُطلب منه.
    if (line.manualWarehouseId || line.manualSupplierId) return null;
    const options = line.comparison?.options ?? [];
    if (line.selectedSupplierId !== null) {
        return options.find((o) => o.supplierId === line.selectedSupplierId) ?? null;
    }
    return line.comparison?.cheapest ?? null;
}
