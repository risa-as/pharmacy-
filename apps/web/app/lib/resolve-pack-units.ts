// ميزة إصلاح PACK_UNITS_UNRESOLVED الزائف: عدد الأشرطة في الباكيت خاصية
// **الباركود** لا خاصية صفّ GlobalDrug بعينه (قرار صاحب النظام — انظر تعليق
// unitsPerPack في schema.prisma). لكن نطاق GlobalDrug ثنائي (organizationId,
// warehouseId)، فقد يملك نفس الباركود أكثر من صفّ: صفّ خاص بالصيدلية (حيث
// أكّد الصيدلاني التعبئة فعلاً) وصفّ عالمي/مذخر مشترك (حيث يُنشأ سطر الطلب
// غالباً بلا تأكيد). قراءة التعبئة عبر drugId واحد فقط تهبط أحياناً على الصفّ
// الخطأ فتُوقف الاعتماد رغم وجود تأكيد حقيقي على الصفّ الآخر لنفس الباركود.
//
// هذا الملف هو الحلّ: يجمع كل الصفوف المرئية لهذه الصيدلية بنفس الباركود
// ويحسم رقماً واحداً منها بقواعد واضحة، بدل الاعتماد على صفّ واحد بعينه.
//
// منطق نقيّ بلا Prisma عمداً (نفس نمط pack-units.ts) — vitest.config.ts يحمّل
// app/**/*.test.ts فقط، فمنطق داخل مسار API لا يُختبر أبداً.

export type PackRow = {
    unitsPerPack: number | null;
    unitsPerPackConfirmedAt: Date | string | null;
};

export type PackResolution =
    | { kind: "RESOLVED"; unitsPerPack: number; confirmed: boolean }
    | { kind: "UNKNOWN" }
    | { kind: "CONFLICT"; values: number[] };

/** قيمة تعبئة صالحة: عدد صحيح موجب. صفر/سالب/كسري/فارغ كلها تُتجاهَل. */
function validUnits(n: number | null): number | null {
    return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

/** القيم الصالحة المميَّزة (بلا تكرار) من مجموعة صفوف، مرتَّبة تصاعدياً لثبات رسائل التعارض. */
function distinctValidValues(rows: PackRow[]): number[] {
    const set = new Set<number>();
    for (const r of rows) {
        const v = validUnits(r.unitsPerPack);
        if (v !== null) set.add(v);
    }
    return Array.from(set).sort((a, b) => a - b);
}

/**
 * يحسم عدد الأشرطة في الباكيت من كل الصفوف المرئية لصيدلية بعينها لنفس
 * الباركود — انظر تعليق أعلى الملف لسبب وجود أكثر من صفّ أصلاً.
 *
 * الأولوية دائماً لتأكيد بشري (unitsPerPackConfirmedAt !== null) على أي رقم
 * مستنتَج، حتى لو اختلفا — هذا ليس تعارضاً، فالرقم المؤكَّد هو الحَكَم. التعارض
 * الحقيقي الوحيد هو اختلاف داخل نفس الطبقة (مؤكَّد↔مؤكَّد أو غير مؤكَّد↔غير
 * مؤكَّد)، حيث لا مرجّح موضوعي بين رأيين من نفس النوع.
 */
export function resolvePackUnits(rows: PackRow[]): PackResolution {
    const confirmedRows = rows.filter((r) => r.unitsPerPackConfirmedAt !== null);
    const confirmedValues = distinctValidValues(confirmedRows);
    if (confirmedValues.length === 1) {
        return { kind: "RESOLVED", unitsPerPack: confirmedValues[0], confirmed: true };
    }
    if (confirmedValues.length > 1) {
        return { kind: "CONFLICT", values: confirmedValues };
    }

    // لا قيمة مؤكَّدة على الإطلاق — السلوك القديم (رقم مستنتَج بلا تأكيد) يبقى
    // كما هو هنا عمداً، لا يُشدَّد في هذه المهمة.
    const unconfirmedValues = distinctValidValues(rows);
    if (unconfirmedValues.length === 1) {
        return { kind: "RESOLVED", unitsPerPack: unconfirmedValues[0], confirmed: false };
    }
    if (unconfirmedValues.length > 1) {
        return { kind: "CONFLICT", values: unconfirmedValues };
    }
    return { kind: "UNKNOWN" };
}
