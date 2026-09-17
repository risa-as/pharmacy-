// المرحلة 4 من ميزة المذاخر: بدائل الدواء عند النفاد — دالة نقية بالكامل، بلا
// أي استيراد لـ Prisma أو next/server (نفس انضباط warehouse-quote.ts).
//
// الخلفية — ما وجدناه فعلياً في قاعدة الإنتاج (قراءة فقط، psql مباشر):
//   SELECT count(*), count(*) FILTER (WHERE array_length(alternatives,1) > 0)
//   FROM "GlobalDrug";  →  4067 صفاً، 0 منها بمصفوفة alternatives غير فارغة.
// حقل GlobalDrug.alternatives (String[]) أُضيف في migration
// 20260209070342_add_patients_prescriptions_insurance ولم يُستخدَم قط بعدها.
// الكاتب الوحيد الذي له أثر في الكود هو seed-drugs.ts، وهو يكتب دائماً []
// (تعليقه الخاص: "OpenFDA doesn't easily give direct alternatives"). لا توجد
// أي شاشة إدارية تسمح بتعديل هذا الحقل — ولا يُسمح بإضافة واحدة ضمن هذه
// المرحلة (القيد #4 في مواصفتها يمنع لمس app/ui/ صراحة). فالميزة أدناه
// "مُسلَّكة" (wired) لا "مفعَّلة" (active) اليوم: منطقها صحيح ومُختبَر بالكامل،
// لكنها ستبقى بلا أثر ظاهر للمستخدم إلى أن يُعبِّئ مصدر مستقبلي (استيراد صنف
// جديد، أو أداة إدارية تُبنى لاحقاً) هذا الحقل فعلياً.
//
// شكل المصفوفة المفترَض — باركودات: بما أن كل الصفوف فارغة، لا يمكن التحقق من
// الشكل تجريبياً من البيانات نفسها. الافتراض هنا (باركودات لا drugId ولا اسم)
// ليس تخميناً حراً: توقيع rankAlternatives في مواصفة هذه المرحلة يسمّي
// المعامل alternativeBarcodes صراحةً، وهو الاختيار الوحيد المتّسق مع بقية
// النظام الذي يطابق الأدوية بالباركود دائماً (resolveToGlobalDrug في
// warehouse-catalog.ts، وWarehouseCatalogItem الفريد بـ [warehouseId, barcode]).
// من يُعبّئ هذا الحقل لاحقاً يجب أن يكتب باركودات مذاخر لا معرّفات ولا أسماء.

export interface AlternativeCatalogEntry {
  barcode: string;
  tradeName: string;
  price: number;
  sellableQuantity: number;
  isListed: boolean;
}

export interface RankedAlternative {
  barcode: string;
  tradeName: string;
  price: number;
  sellableQuantity: number;
}

/**
 * يرشّح البدائل المتاحة فعلاً لدى هذا المذخر لصنف نفد.
 *
 * القواعد:
 * - يُستبعَد أي بديل غير مُدرَج في كتالوج هذا المذخر (لا يظهر في `catalog` إطلاقاً)
 *   — ليس كل دواء عالمي مُدرَجاً بالضرورة عند كل مذخر.
 * - يُستبعَد أي بديل غير مُدرَج للعرض (isListed=false) أو نافد فعلياً
 *   (sellableQuantity <= 0). عرض بديل غير متوفر أسوأ من عدم عرض شيء: يُضيّع
 *   وقت الصيدلي ويكرّر خيبة "نافد" بدل حلّها.
 * - **الترتيب المُعاد هو ترتيب alternativeBarcodes كما ورد بالضبط — لا يُعاد
 *   ترتيبه بالسعر ولا بالكمية المتوفرة.** هذا مقصود، لا سهو: تلك المصفوفة
 *   مُنسَّقة سريرياً (بديل علاجي مكافئ فعلاً بحسب من أدخلها)، وإعادة الترتيب
 *   تجارياً (الأرخص أولاً، أو الأكثر مخزوناً أولاً) تستبدل حكماً سريرياً بحكم
 *   تجاري بصمت — خطر يتجاوز بكثير فائدة أي ترتيب "أمثل". انظر اختبار
 *   "curated order preserved" في warehouse-alternatives.test.ts لإثبات هذا حرفياً
 *   بمدخل ترتيب سعره معاكس تماماً لترتيب المصفوفة.
 * - تُستبعَد التكرارات (نفس الباركود مرتين في alternativeBarcodes) — يُبقى فقط
 *   على أول ظهور.
 * - مدخل فارغ/غائب (alternativeBarcodes أو catalog) → مصفوفة فارغة، بلا رمي.
 */
export function rankAlternatives(input: {
  alternativeBarcodes: string[] | null | undefined;
  catalog: AlternativeCatalogEntry[] | null | undefined;
}): RankedAlternative[] {
  const barcodes = input.alternativeBarcodes;
  const catalog = input.catalog;

  if (!Array.isArray(barcodes) || barcodes.length === 0) return [];
  if (!Array.isArray(catalog) || catalog.length === 0) return [];

  const byBarcode = new Map(catalog.map((entry) => [entry.barcode, entry]));
  const seen = new Set<string>();
  const result: RankedAlternative[] = [];

  for (const barcode of barcodes) {
    if (!barcode || seen.has(barcode)) continue;
    seen.add(barcode);

    const entry = byBarcode.get(barcode);
    if (!entry) continue; // باركود غير مدرَج في كتالوج هذا المذخر
    if (!entry.isListed || entry.sellableQuantity <= 0) continue; // بديل غير متاح فعلياً

    result.push({
      barcode: entry.barcode,
      tradeName: entry.tradeName,
      price: entry.price,
      sellableQuantity: entry.sellableQuantity,
    });
  }

  return result;
}
