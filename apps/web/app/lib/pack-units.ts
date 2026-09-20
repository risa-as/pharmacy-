// ميزة وحدة التسعير: القاعدة الحسابية **الوحيدة** لتحويل سعر معلَن بوحدة ما إلى
// سعر الشريط — وهي الوحدة التي تُخزَّن بها Batch.costPrice في كل النظام.
//
// سبب وجود هذا الملف: الحدّ بين المذخر والصيدلية كان يمرّر سعر المذخر (سعر
// باكيت عملياً) إلى PurchaseItem.cost ثم إلى Batch.costPrice (سعر شريط) بلا أي
// تحويل. النتيجة كلفة مضخَّمة بمقدار عدد الأشرطة، تفسد الهامش والتقارير بصمت.
//
// قرار صريح من صاحب النظام (2026-09): «المذاخر جميع اسعارها تمثل سعر الباكيت
// وليس سعر الشريط» — أي أن سؤال المذخر عن الوحدة له جواب واحد ثابت، فلم يعد
// سؤالاً حقيقياً. لذلك PACKET هي القاعدة غير المشروطة: priceUnit غير المعلَنة
// (NULL) تُعامَل كباكيت لا كحظر. الاستثناء الوحيد "STRIP" يبقى تصريحاً صريحاً
// شرعياً (سطر نادر سُعِّر فعلاً بالشريط) وله فرعه الخاص أدناه.
//
// ما لم يتغيّر: قيم unitsPerPack لا تُعبَّأ تخميناً ولا اشتقاقاً من نِسَب
// الأسعار — تبقى NULL حتى تُراجَع معه. تحويل سعر الباكيت إلى سعر الشريط
// يتطلب القسمة على عدد الأشرطة في الباكيت؛ إن كان مجهولاً فالتحويل مستحيل
// حسابياً لا سياسةً، فيبقى فرع UNKNOWN_UNITS_PER_PACK يوقف السطر للمراجعة.
//
// منطق نقيّ بلا Prisma ولا React عمداً: vitest.config.ts يحمّل app/**/*.test.ts
// فقط، فالمنطق الموضوع داخل مكوّن .tsx لا يُختبر أبداً.

/** وحدة السعر المعلَنة. NULL/غير ذلك = غير معلَنة، وتُعامَل بصفتها PACKET. */
export type PriceUnit = "PACKET" | "STRIP";

export type PackBlockReason =
    /** السعر للباكيت (أو الوحدة غير معلَنة، وهي نفس المعنى الآن) لكن عدد الأشرطة في الباكيت غير معروف لا عندنا ولا عند المذخر. */
    | "UNKNOWN_UNITS_PER_PACK"
    /** تعبئتنا وتعبئة المذخر معلنتان ومختلفتان — ترجيح أحدهما تخمين. */
    | "UNITS_PER_PACK_CONFLICT"
    /** سعر غير صالح رقمياً (سالب أو غير منتهٍ). */
    | "INVALID_PRICE";

export type PackConversion =
    | {
          ok: true;
          /** السعر بوحدة الشريط — هذا وحده ما يجوز كتابته في Batch.costPrice. */
          stripPrice: number;
          /** التعبئة المستخدَمة في القسمة؛ 1 حين كان السعر للشريط أصلاً. */
          unitsPerPack: number;
          /** هل جرت قسمة فعلية؟ يميّز «سعر شريط كما هو» عن «باكيت مقسوم». */
          converted: boolean;
      }
    | { ok: false; reason: PackBlockReason; message: string };

export const PACK_BLOCK_MESSAGE: Record<PackBlockReason, string> = {
    UNKNOWN_UNITS_PER_PACK:
        "سعر هذا الصنف سعر باكيت، وعدد الأشرطة في الباكيت غير مسجَّل — لا يمكن اشتقاق كلفة الشريط بلا تخمين.",
    UNITS_PER_PACK_CONFLICT:
        "عدد الأشرطة في الباكيت المسجَّل لدينا يخالف المعلَن من المذخر — يلزم توحيدهما قبل تسجيل الكلفة.",
    INVALID_PRICE: "سعر غير صالح.",
};

export interface PackInput {
    /** السعر كما هو معلَن بالوحدة أدناه. */
    price: number;
    /** WarehouseCatalogItem.priceUnit — NULL = غير معلَنة، تُعامَل كـ"PACKET". */
    priceUnit: string | null | undefined;
    /** GlobalDrug.unitsPerPack — تعبئتنا (مصدر الحقيقة عندنا). */
    drugUnitsPerPack: number | null | undefined;
    /** WarehouseCatalogItem.unitsPerPack — تعبئة المذخر المعلَنة إن وُجدت. */
    warehouseUnitsPerPack?: number | null | undefined;
}

function validUnits(n: number | null | undefined): number | null {
    return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * يحوّل سعراً معلَناً إلى سعر الشريط، أو يرفض التحويل بسبب صريح.
 *
 * السعر صفر يمرّ كما هو بلا اشتراط وحدة: سطر البونص كلفته صفر بتعريفه، وصفر
 * مقسوماً على أي تعبئة صفر — فاشتراط إعلان الوحدة عليه منعٌ بلا فائدة.
 */
export function toStripPrice(input: PackInput): PackConversion {
    const { price } = input;
    if (!Number.isFinite(price) || price < 0) {
        return { ok: false, reason: "INVALID_PRICE", message: PACK_BLOCK_MESSAGE.INVALID_PRICE };
    }
    if (price === 0) return { ok: true, stripPrice: 0, unitsPerPack: 1, converted: false };

    if (input.priceUnit === "STRIP") {
        return { ok: true, stripPrice: price, unitsPerPack: 1, converted: false };
    }
    // PACKET هي القاعدة غير المشروطة: أي قيمة أخرى لـ priceUnit — بما فيها
    // "PACKET" صراحةً أو NULL/undefined لغيابها — تُعامَل كباكيت، لأن كل أسعار
    // المذاخر أسعار باكيت (قرار صاحب النظام أعلاه). لا يوجد فرع رفض هنا بعد اليوم.

    const ours = validUnits(input.drugUnitsPerPack);
    const theirs = validUnits(input.warehouseUnitsPerPack);
    if (ours !== null && theirs !== null && ours !== theirs) {
        return {
            ok: false,
            reason: "UNITS_PER_PACK_CONFLICT",
            message: `${PACK_BLOCK_MESSAGE.UNITS_PER_PACK_CONFLICT} (لدينا ${ours} مقابل ${theirs} لدى المذخر)`,
        };
    }
    const units = ours ?? theirs;
    if (units === null) {
        return {
            ok: false,
            reason: "UNKNOWN_UNITS_PER_PACK",
            message: PACK_BLOCK_MESSAGE.UNKNOWN_UNITS_PER_PACK,
        };
    }
    return { ok: true, stripPrice: price / units, unitsPerPack: units, converted: true };
}

/**
 * العكس: سعر الباكيت المشتق من سعر شريط مسجَّل — لتعبئة الحقول تلقائياً فقط.
 * يعيد null حين التعبئة غير معروفة، فتُعرض «سعر الشريط» وحده بدل رقم مخترَع.
 */
export function toPacketPrice(stripPrice: number, unitsPerPack: number | null | undefined): number | null {
    const units = validUnits(unitsPerPack);
    if (units === null || !Number.isFinite(stripPrice) || stripPrice < 0) return null;
    return stripPrice * units;
}

/** وسم موحَّد يُعرض بجانب كل مبلغ كلفة في الواجهات. */
export const STRIP_PRICE_LABEL = "لكل شريط";
