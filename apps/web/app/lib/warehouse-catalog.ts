// المرحلة 2 من ميزة المذاخر: مطابقة الباركود عبر المستأجرين + حماية باركود الكتالوج.
// الخلفية (التقرير §4.1-أ): نفس الدواء الفيزيائي يوجد بعدة صفوف GlobalDrug
// (صف عالمي organizationId: null + صف خاص لكل منظمة). الكتالوج مبني على الصفوف
// العالمية والمطابقة تتم على barcode — وإلا فشل صامت: الصيدلي يرى «غير متوفر»
// لصنف متوفر فعلاً لأن drugId مختلف بين الطرفين.
import type { GlobalDrug } from "@prisma/client";

export type ResolveBarcodeResult =
  | { ok: true; drug: GlobalDrug }
  | { ok: false; reason: "EMPTY_BARCODE" | "NOT_FOUND" };

/**
 * التعريف الوحيد لـ«عالمي» في المستودع. نطاق GlobalDrug ثنائي بعد ميزة نطاق
 * المذخر: (null,null) عالمي مشترك، (orgId,null) خاص بمؤسسة، (null,whId) خاص
 * بمذخر. أي استعلام يقصد الكتالوج المشترك يجب أن ينشر هذا الكائن، لا أن يكتب
 * `organizationId: null` وحده — وإلا تسرّبت صفوف المذاخر إلى كتالوجات الصيدليات.
 */
export const GLOBAL_DRUG_SCOPE = {
  organizationId: null,
  warehouseId: null,
} as const;

/** أصغر سطح Prisma مطلوب — يُحقن كي تبقى الدالة قابلة للاختبار دون قاعدة بيانات. */
export interface CatalogPrisma {
  globalDrug: {
    findFirst(args: {
      where: {
        barcode: string;
        organizationId?: null;
        warehouseId?: string | null;
      };
    }): Promise<GlobalDrug | null>;
  };
}

/** نطاق الصف الذي طابق باركوداً في كتالوج مذخر. */
export type CatalogDrugScope = "GLOBAL" | "WAREHOUSE";

export type ResolveCatalogDrugResult =
  | { ok: true; drug: GlobalDrug; scope: CatalogDrugScope }
  | { ok: false; reason: "EMPTY_BARCODE" | "NEEDS_NAME" };

export const NEEDS_NAME_MESSAGE =
  "هذا الباركود غير مسجل في الكتالوج العالمي. أدخل الاسم التجاري لإضافته تحت بند مذخرك — وسيظهر لإدارة المنصة لترقيته إلى الكتالوج العالمي.";

export const EMPTY_BARCODE_MESSAGE =
  "الصنف بلا باركود صالح ولا يمكن مطابقته مع كتالوج المذاخر. أضف باركوداً صالحاً أولاً.";

export const BARCODE_NOT_FOUND_MESSAGE =
  "لا يوجد صنف عالمي بهذا الباركود. يجب أن يكون الصنف مسجلاً في الكتالوج العالمي قبل طلبه من المذاخر.";

/**
 * يطابق باركوداً على الصف العالمي (organizationId: null) حصراً.
 * الصفوف الخاصة بالمنظمات لا تُطابق ولو حملت نفس الباركود — الكتالوج عالمي.
 */
export async function resolveToGlobalDrug(
  prisma: CatalogPrisma,
  barcode: string | null | undefined
): Promise<ResolveBarcodeResult> {
  const trimmed = (barcode ?? "").trim();
  if (!trimmed) return { ok: false, reason: "EMPTY_BARCODE" };

  const drug = await prisma.globalDrug.findFirst({
    where: { barcode: trimmed, ...GLOBAL_DRUG_SCOPE },
  });
  if (!drug) return { ok: false, reason: "NOT_FOUND" };
  return { ok: true, drug };
}

/**
 * مطابقة باركود لأجل كتالوج مذخر: الصف العالمي أولاً (فيبقى السلوك الحالي كما
 * هو لكل باركود مسجل)، ثم صف المذخر الخاص إن كان أضافه سابقاً. لا صف ولا اسم
 * تجاري ⇒ NEEDS_NAME، وهي ليست خطأً بل طلب حقل واحد من الواجهة.
 *
 * لا تُنشئ الدالة شيئاً — الإنشاء يبقى في مسار الـAPI داخل معاملته، وهذه تبقى
 * قابلة للاختبار دون قاعدة بيانات.
 */
export async function resolveCatalogDrug(
  prisma: CatalogPrisma,
  warehouseId: string,
  barcode: string | null | undefined
): Promise<ResolveCatalogDrugResult> {
  const trimmed = (barcode ?? "").trim();
  if (!trimmed) return { ok: false, reason: "EMPTY_BARCODE" };

  const global = await prisma.globalDrug.findFirst({
    where: { barcode: trimmed, ...GLOBAL_DRUG_SCOPE },
  });
  if (global) return { ok: true, drug: global, scope: "GLOBAL" };

  const owned = await prisma.globalDrug.findFirst({
    where: { barcode: trimmed, warehouseId },
  });
  if (owned) return { ok: true, drug: owned, scope: "WAREHOUSE" };

  return { ok: false, reason: "NEEDS_NAME" };
}

// ── منع تعديل باركود دواء مدرج في أي كتالوج مذخر ─────────────────────────────
// حقل barcode في WarehouseCatalogItem نسخة من حقل قابل للتعديل؛ لو تغيّر باركود
// الصف تصبح صفوف الكتالوج يتيمة بصمت (نمط الفشل الصامت نفسه). الحارس أدناه
// يُطبَّق في مساري updateDrug/updateGlobalDrug (app/lib/actions/drug.ts).

export interface BarcodeChangeDecisionInput {
  /** عدد صفوف كتالوج المذاخر الحاملة لهذا drugId */
  catalogItemCount: number;
  /** هل يحاول المستخدم فعلاً تغيير الباركود؟ */
  changed: boolean;
}

export interface BarcodeChangeDecision {
  allowed: boolean;
  reason?: string;
}

/** دالة نقية تُقرر: هل يُسمح بتعديل الباركود؟ */
export function barcodeChangeDecision(
  input: BarcodeChangeDecisionInput
): BarcodeChangeDecision {
  if (!input.changed) return { allowed: true };
  if (input.catalogItemCount > 0) {
    return {
      allowed: false,
      reason:
        "لا يمكن تعديل باركود هذا الدواء لأنه مدرج في كتالوج مذخر على المنصة. تعديل الباركود يفصل الكتالوج عن الدواء بصمت.",
    };
  }
  return { allowed: true };
}
