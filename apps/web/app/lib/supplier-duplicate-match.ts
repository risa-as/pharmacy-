// كشف «المورد المكرر» قبل الطلب من مذخر — نقي وقابل للاختبار بلا قاعدة بيانات.
//
// المشكلة: الصيدلية قد تشتري من جهة منذ سنة تحت اسم مورد محلي، ثم تنضم تلك الجهة
// إلى المنصة كمذخر. لو أُرسل لها طلب قبل ربط المورد المحلي بها، يُنشئ الجسر عند
// الاعتماد مورداً مرآةً ثانياً (warehouses/orders/[id]/route.ts) فينقسم الرصيد
// والفواتير بين سجلين، ويُرفض الربط لاحقاً بقيد @@unique([organizationId, warehouseId]).
//
// هذه الدالة **تحذّر ولا تمنع**: مذخر جديد فعلاً قد يشبه اسمه اسم مورد قديم، ويجب
// أن يبقى الطلب منه ممكناً بعد تأكيد صريح من المستخدم.

export interface DuplicateCandidateSupplier {
    id: string;
    name: string;
    phone: string | null;
    /** مورد مربوط بمذخر (أي مذخر) لا يُقترح — الربط الثاني مرفوض أصلاً. */
    warehouseId: string | null;
}

export interface DuplicateTargetWarehouse {
    name: string;
    phone: string | null;
}

export type DuplicateMatchReason = 'PHONE' | 'NAME';

export interface DuplicateMatch {
    supplierId: string;
    supplierName: string;
    reason: DuplicateMatchReason;
}

/** توحيد الحروف: الهمزات والتاء المربوطة والألف المقصورة، وحذف التشكيل والتطويل. */
function foldArabic(s: string): string {
    return s
        .toLowerCase()
        .replace(/[ً-ٰٟـ]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي');
}

/** كلمات عامة لا تميّز جهة عن أخرى — تُحذف قبل مقارنة الأسماء (تُطوى بنفس التطبيع). */
const GENERIC_WORDS = new Set(
    [
        'مذخر', 'مذاخر', 'شركة', 'مكتب', 'مؤسسة', 'مجموعة', 'للأدوية', 'الأدوية', 'أدوية',
        'للتجارة', 'العامة', 'المحدودة', 'على', 'المنصة',
        'co', 'company', 'ltd', 'pharma', 'store',
    ].map(foldArabic)
);

/**
 * تطبيع اسم عربي/لاتيني للمقارنة: توحيد الحروف، حذف الرموز و«ال» التعريف
 * والكلمات العامة.
 */
export function normalizeEntityName(raw: string): string {
    const cleaned = foldArabic(raw).replace(/[^ء-يa-z0-9٠-٩\s]/g, ' ');

    const words = cleaned
        .split(/\s+/)
        .filter(Boolean)
        .filter((w) => !GENERIC_WORDS.has(w))
        .map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w))
        .filter((w) => !GENERIC_WORDS.has(w));

    return words.join('');
}

/** آخر 10 أرقام — يوحّد 0780… و+964780… و964780… */
export function normalizePhone(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const digits = raw
        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .replace(/\D/g, '');
    if (digits.length < 7) return null;
    return digits.slice(-10);
}

/**
 * موردو المؤسسة غير المربوطين الذين يُحتمل أنهم نفس المذخر.
 *
 * يطابق على الهاتف (أقوى دليل) أو على الاسم المطبَّع: تطابق تام، أو احتواء أحدهما
 * للآخر بشرط ألا يقل الأقصر عن 4 أحرف كي لا يطابق «نور» كل ما فيه «نور».
 * الترتيب: مطابقات الهاتف أولاً ثم الاسم، بلا تكرار.
 */
export function findLikelySupplierMatches(
    warehouse: DuplicateTargetWarehouse,
    suppliers: DuplicateCandidateSupplier[]
): DuplicateMatch[] {
    const whPhone = normalizePhone(warehouse.phone);
    const whName = normalizeEntityName(warehouse.name);
    const byPhone: DuplicateMatch[] = [];
    const byName: DuplicateMatch[] = [];

    for (const s of suppliers) {
        if (s.warehouseId) continue;
        const sPhone = normalizePhone(s.phone);
        if (whPhone && sPhone && whPhone === sPhone) {
            byPhone.push({ supplierId: s.id, supplierName: s.name, reason: 'PHONE' });
            continue;
        }
        const sName = normalizeEntityName(s.name);
        if (!whName || !sName) continue;
        const shorter = whName.length <= sName.length ? whName : sName;
        const longer = shorter === whName ? sName : whName;
        if (whName === sName || (shorter.length >= 4 && longer.includes(shorter))) {
            byName.push({ supplierId: s.id, supplierName: s.name, reason: 'NAME' });
        }
    }
    return [...byPhone, ...byName];
}
