// التعريف الوحيد لـ«أي أدوية تراها صيدلية؟» في واجهة الصيدلي.
//
// الخلفية: نطاق GlobalDrug ثلاثي — (null,null) الكتالوج العالمي المشترك،
// (orgId,null) خاص بمؤسسة، (null,warehouseId) خاص بمذخر (انظر GLOBAL_DRUG_SCOPE
// في app/lib/warehouse-catalog.ts للعقد المقابل على جانب المذاخر).
//
// المنتقيات الدوائية في واجهة الصيدلي كانت تستعلم GlobalDrug **بلا أي مرشّح
// نطاق**، فكانت تعرض لكل صيدلية الأدوية الخاصة بالمؤسسات الأخرى. هذه الدالة
// تُغلق ذلك التسرّب بتعريف واحد يُنشَر في كل منتقي، بدل ست نسخ مكرّرة يسهل أن
// يسهو أحدها عند أي تعديل لاحق.
//
// ملاحظة مهمة عند الاستعمال: هذا مرشّح **للمنتقيات والبحث** فقط — أي حين تُسأل
// GlobalDrug مباشرةً عن «ماذا يمكن اختياره؟». الاستعلامات التي تجلب أدوية
// بـ id: { in: drugIds } مشتقّة أصلاً من مخزون المستأجر أو مبيعاته، فهي مؤمَّنة
// بحكم بنائها، وتضييقها يُخفي أدوية يملكها فعلاً.

/** شكل مرشّح Prisma الناتج — ضيّق عمداً كي يبقى قابلاً للنشر داخل where. */
export type PharmacyDrugScope =
  | { warehouseId: null }
  | {
      warehouseId: null;
      OR: [{ organizationId: null }, { organizationId: string }];
    };

/**
 * أدوية مرئية لصيدلية: الكتالوج العالمي + أدوية مؤسستها هي، وبلا صفوف المذاخر.
 *
 * `organizationId` غير معرّف يعني SUPER_ADMIN (لا مؤسسة له في TenantContext) —
 * فيرى كل شيء عدا صفوف المذاخر، لأنها ليست جزءاً من كتالوج الصيدليات أصلاً وله
 * صفحته الخاصة لمراجعتها: /dashboard/admin/drugs?warehouse=<id>.
 */
export function pharmacyDrugScope(organizationId?: string): PharmacyDrugScope {
  if (!organizationId) return { warehouseId: null };
  return {
    warehouseId: null,
    OR: [{ organizationId: null }, { organizationId }],
  };
}
