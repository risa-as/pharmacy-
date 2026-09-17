// المرحلة 2 من ميزة «طلب الأدوية حسب الاحتياج»: منطق مقارنة أسعار الموردين — نقي
// تماماً، بلا Prisma وبلا next. كل قواعد §4 من الخطة تعيش هنا وتُختبر بلا قاعدة بيانات.
//
// التعريف المحوري (§4.1): «الأرخص» = لكل مورد آخرُ سعر مدفوع مؤهل، ثم الأرخص بين
// تلك الأسعار. وليس أقل سعر تاريخي على الإطلاق. مثال القبول الملزم: المورد أ باع
// بـ800 ثم بـ1200، والمورد ب آخر سعره 1000 ⇒ الفائز ب بـ1000، لا أ بـ800.
//
// ما لا تفعله هذه الوحدة عمداً: لا تجمع الموردين بالاسم ولا الأدوية بالاسم العلمي
// (§4.1)، ولا تكتب شيئاً، ولا تدّعي أن تاريخ التسجيل هو تاريخ الشراء (§4.2/§121).

/** مصدر سجل السعر — يُعرض للمستخدم ولا يُدمج مع غيره في سلسلة واحدة (§4.2/§120). */
export type PriceSource = "BATCH" | "COMPLETED_PURCHASE";

/** سبب عدم أهلية سجل للمقارنة — يُعرض حرفياً بدل إخفاء السجل (§4.3). */
export type PriceQualityReason =
    | "UNVERIFIED_UNIT"
    | "NON_POSITIVE_PRICE"
    | "UNKNOWN_SUPPLIER"
    | "AMBIGUOUS_SAME_INSTANT";

/** سجل سعر خام واحد كما وصل من طبقة البيانات. */
export interface RawPriceRecord {
    /** Explicit per-drug user review; absent historical metadata is not proof of a unit. */
    unitVerified?: boolean;
    supplierId: string | null;
    supplierName: string | null;
    /** المذخر المرتبط بهذا المورد — null يعني مورداً محلياً غير قابل للإرسال. */
    warehouseId: string | null;
    warehouseName: string | null;
    /** المذخر نشط؟ مذخر معطّل لا يستقبل طلبات جديدة. */
    warehouseIsActive: boolean;
    /** الكلفة كما سُجّلت. الصفر والسالب وغير المتناهي ليست أسعاراً مدفوعة (§128). */
    price: number;
    /** تاريخ **تسجيل** السجل، لا تاريخ الشراء المثبت (§4.2). ISO. */
    recordedAt: string;
    source: PriceSource;
    sourceBranchId: string;
    /** معرّف ثابت لكسر التعادل بشكل مستقر (§88) — لا لإثبات أسبقية شراء (§133). */
    recordId: string;
}

export interface SupplierPriceOption {
    supplierId: string;
    supplierName: string;
    warehouseId: string | null;
    warehouseName: string | null;
    price: number | null;
    recordedAt: string | null;
    source: PriceSource;
    sourceBranchId: string;
    /**
     * المخطط لا يخزّن وحدة طلب، ومسارات الإدخال غير متسقة: الواجهات السريعة تقسم
     * سعر الباكيت على عدد الأشرطة، بينما استيراد Excel واستلام فاتورة الشراء
     * يكتبان الكلفة كما هي. لذلك التسمية الوحيدة الصادقة هي «وحدة المخزون» (§139).
     */
    unitLabel: string;
    comparable: boolean;
    qualityReason: PriceQualityReason | null;
    orderable: boolean;
    orderabilityReason: string | null;
    /** عمر السعر بالأيام وقت الحساب. */
    ageDays: number | null;
    /** تجاوز حدّ القِدم الإرشادي — تنبيه لا استبعاد (§89). */
    isStale: boolean;
}

/** التسمية الوحيدة المسموح بها للوحدة — انظر تعليق unitLabel أعلاه. */
export const INVENTORY_UNIT_LABEL = "وحدة المخزون";

/** حدّ القِدم الإرشادي بالأيام. موضع واحد قابل للتعديل (§89) — ليس قاعدة محاسبية. */
export const STALE_PRICE_DAYS = 90;

export function isValidPrice(price: unknown): price is number {
    return typeof price === "number" && Number.isFinite(price) && price > 0;
}

export function ageInDays(recordedAt: string, now: Date): number | null {
    const t = Date.parse(recordedAt);
    if (Number.isNaN(t)) return null;
    // يوم كامل منقضٍ؛ السجل المستقبلي (ساعة جهاز خاطئة) يُقصّ إلى 0 لا إلى سالب.
    return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/**
 * آخر سجل مؤهل لمورد واحد.
 *
 * القاعدة الحاسمة (§132): لا يجوز تخطّي سجل أحدث غير مؤهل بصمت لتسمية سجل أقدم
 * «آخر سعر». فإن كان الأحدث غير صالح نعيده موسوماً بسببه بدل أن نكذب على المستخدم.
 *
 * والتعادل الزمني (§133): سجلان بنفس اللحظة وبقيمتين مختلفتين لا يُحسم ترتيبهما
 * بمعرّف UUID — يُعاد تعارضاً صريحاً. أما تساوي القيمة فلا تعارض فيه أصلاً.
 */
export function latestEligibleForSupplier(records: RawPriceRecord[]): RawPriceRecord & {
    comparable: boolean;
    qualityReason: PriceQualityReason | null;
} | null {
    if (records.length === 0) return null;

    // Zero-cost receipts (including bonus) are not paid-price observations.
    // Negative/invalid records remain visible as data errors, rather than being skipped.
    const paidRecords = records.filter((r) => r.price !== 0);
    const sorted = [...(paidRecords.length ? paidRecords : records)].sort((a, b) => {
        const d = Date.parse(b.recordedAt) - Date.parse(a.recordedAt);
        if (d !== 0) return d;
        return a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0;
    });

    const newest = sorted[0];
    const newestTime = Date.parse(newest.recordedAt);

    // تعارض في اللحظة نفسها بقيم مختلفة ⇒ لا حسم اعتباطي.
    const sameInstant = sorted.filter((r) => Date.parse(r.recordedAt) === newestTime);
    const distinctPrices = new Set(sameInstant.map((r) => r.price));
    if (sameInstant.length > 1 && distinctPrices.size > 1) {
        return { ...newest, comparable: false, qualityReason: "AMBIGUOUS_SAME_INSTANT" };
    }

    if (!newest.supplierId) {
        return { ...newest, comparable: false, qualityReason: "UNKNOWN_SUPPLIER" };
    }
    if (!isValidPrice(newest.price)) {
        // No paid observation, or a genuinely invalid latest paid-price record.
        return { ...newest, comparable: false, qualityReason: "NON_POSITIVE_PRICE" };
    }

    if (!newest.unitVerified) {
        return { ...newest, comparable: false, qualityReason: "UNVERIFIED_UNIT" };
    }
    return { ...newest, comparable: true, qualityReason: null };
}

export interface BuildOptionsInput {
    records: RawPriceRecord[];
    now: Date;
    staleDays?: number;
}

/**
 * يبني خيارات المقارنة لدواء واحد: آخر سعر مؤهل لكل `supplierId`، مرتّبة تصاعدياً.
 * الترتيب: السعر، ثم الأحدث عند التعادل، ثم معرّف ثابت لاستقرار العرض (§88).
 */
export function buildSupplierOptions(input: BuildOptionsInput): SupplierPriceOption[] {
    const { records, now, staleDays = STALE_PRICE_DAYS } = input;

    // التجميع بالمعرّف حصراً — موردان بنفس الاسم ومعرّفين مختلفين لا يندمجان (§357).
    const bySupplier = new Map<string, RawPriceRecord[]>();
    const unattributed: RawPriceRecord[] = [];
    for (const r of records) {
        if (!r.supplierId) {
            unattributed.push(r);
            continue;
        }
        const list = bySupplier.get(r.supplierId);
        if (list) list.push(r);
        else bySupplier.set(r.supplierId, [r]);
    }

    const options: SupplierPriceOption[] = [];
    // Array.from لا for..of على الـMap مباشرةً: هدف tsc في هذا المشروع أقل من
    // ES2015 فتكرار الـMap يحتاج downlevelIteration.
    for (const [supplierId, list] of Array.from(bySupplier.entries())) {
        const latest = latestEligibleForSupplier(list);
        if (!latest) continue;
        const age = ageInDays(latest.recordedAt, now);
        const orderability = describeOrderability(latest);
        options.push({
            supplierId,
            supplierName: latest.supplierName ?? "مورد غير مسمّى",
            warehouseId: latest.warehouseId,
            warehouseName: latest.warehouseName,
            // Preserve the observation for review, without recommending or totaling it.
            price: latest.comparable || latest.qualityReason === 'UNVERIFIED_UNIT' ? latest.price : null,
            recordedAt: latest.recordedAt,
            source: latest.source,
            sourceBranchId: latest.sourceBranchId,
            unitLabel: INVENTORY_UNIT_LABEL,
            comparable: latest.comparable,
            qualityReason: latest.qualityReason,
            orderable: orderability.orderable,
            orderabilityReason: orderability.reason,
            ageDays: age,
            isStale: age !== null && age > staleDays,
        });
    }

    // السجلات بلا مورد تظهر كمعلومات غير منسوبة ولا تُنتج موردًا مختارًا (§131).
    const latestUnattributed = unattributed.length > 0 ? latestEligibleForSupplier(unattributed) : null;
    if (latestUnattributed) {
        const age = ageInDays(latestUnattributed.recordedAt, now);
        options.push({
            supplierId: "",
            supplierName: "مورد غير مسجّل",
            warehouseId: null,
            warehouseName: null,
            price: null,
            recordedAt: latestUnattributed.recordedAt,
            source: latestUnattributed.source,
            sourceBranchId: latestUnattributed.sourceBranchId,
            unitLabel: INVENTORY_UNIT_LABEL,
            comparable: false,
            qualityReason: "UNKNOWN_SUPPLIER",
            orderable: false,
            orderabilityReason: "سجل بلا مورد معروف — لا يمكن الطلب منه.",
            ageDays: age,
            isStale: age !== null && age > staleDays,
        });
    }

    return sortOptions(options);
}

function describeOrderability(r: RawPriceRecord): { orderable: boolean; reason: string | null } {
    if (!r.supplierId) return { orderable: false, reason: "سجل بلا مورد معروف — لا يمكن الطلب منه." };
    if (!r.warehouseId) {
        return {
            orderable: false,
            reason: "هذا المورد غير مربوط بمذخر على المنصة — لا يمكن إرسال طلب إلكتروني إليه.",
        };
    }
    if (!r.warehouseIsActive) {
        return { orderable: false, reason: "المذخر المرتبط بهذا المورد معطّل حالياً." };
    }
    return { orderable: true, reason: null };
}

/** ترتيب مستقر: الأصناف غير القابلة للمقارنة تُزاح للنهاية ولا تنافس على الأرخص (§90). */
export function sortOptions(options: SupplierPriceOption[]): SupplierPriceOption[] {
    return [...options].sort((a, b) => {
        if (a.comparable !== b.comparable) return a.comparable ? -1 : 1;
        if (a.comparable && b.comparable) {
            const byPrice = (a.price ?? 0) - (b.price ?? 0);
            if (byPrice !== 0) return byPrice;
            const byDate = Date.parse(b.recordedAt ?? "") - Date.parse(a.recordedAt ?? "");
            if (byDate !== 0 && !Number.isNaN(byDate)) return byDate;
        }
        return a.supplierId < b.supplierId ? -1 : a.supplierId > b.supplierId ? 1 : 0;
    });
}

export interface DrugComparison {
    /** الأرخص بين آخر أسعار الموردين — قد يكون غير قابل للإرسال. */
    cheapest: SupplierPriceOption | null;
    /** أرخص خيار **قابل للإرسال فعلاً**؛ قد يختلف عن الأرخص (§78). */
    cheapestOrderable: SupplierPriceOption | null;
    options: SupplierPriceOption[];
    /** لا سجل سعر مؤهل إطلاقاً — تُعرض «لا يوجد سعر شراء مسجل»، لا صفر (§80). */
    hasPrice: boolean;
}

export function compareDrugPrices(input: BuildOptionsInput): DrugComparison {
    const options = buildSupplierOptions(input);
    const comparable = options.filter((o) => o.comparable);
    return {
        cheapest: comparable[0] ?? null,
        cheapestOrderable: comparable.find((o) => o.orderable) ?? null,
        options,
        hasPrice: comparable.length > 0,
    };
}

/**
 * الإجمالي التقديري: يُحسب من الأصناف المسعّرة فقط، ويُعاد معه عدد غير المسعّرة
 * كي تسمّيه الواجهة «إجمالي الأصناف المسعّرة تقديرياً» لا «إجمالي الطلب» (§82).
 */
export function estimateTotal(
    lines: Array<{ quantity: number; unitPrice: number | null }>
): { total: number; pricedCount: number; unpricedCount: number } {
    let total = 0;
    let pricedCount = 0;
    let unpricedCount = 0;
    for (const l of lines) {
        if (isValidPrice(l.unitPrice) && Number.isFinite(l.quantity) && l.quantity > 0) {
            total += l.unitPrice * l.quantity;
            pricedCount += 1;
        } else {
            unpricedCount += 1;
        }
    }
    return { total, pricedCount, unpricedCount };
}
