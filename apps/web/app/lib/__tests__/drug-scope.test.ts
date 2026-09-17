import { describe, it, expect } from "vitest";
import { pharmacyDrugScope } from "../drug-scope";

/**
 * هذه الاختبارات تحرس تسرّباً حقيقياً كان قائماً: منتقيات الأدوية في واجهة
 * الصيدلي كانت تستعلم GlobalDrug بلا أي مرشّح نطاق، فتعرض لكل صيدلية الأدوية
 * الخاصة بالمؤسسات الأخرى. المرشّح أدناه هو التعريف الوحيد الذي يمنع ذلك، فأي
 * تراجع فيه يعيد فتح التسرّب — ولذلك تُثبَّت بنيته حرفياً لا سلوكه فقط.
 */
describe("pharmacyDrugScope — عزل المستأجرين في منتقيات الأدوية", () => {
  it("مؤسسة: ترى العالمي وأدويتها هي فقط", () => {
    expect(pharmacyDrugScope("org-1")).toEqual({
      warehouseId: null,
      OR: [{ organizationId: null }, { organizationId: "org-1" }],
    });
  });

  it("لا يذكر أي مؤسسة أخرى بأي حال", () => {
    const scope = pharmacyDrugScope("org-1");
    expect(JSON.stringify(scope)).not.toContain("org-2");
  });

  it("يستثني صفوف المذاخر دائماً — في كلتا الحالتين", () => {
    expect(pharmacyDrugScope("org-1").warehouseId).toBeNull();
    expect(pharmacyDrugScope(undefined).warehouseId).toBeNull();
  });

  it("SUPER_ADMIN (بلا مؤسسة): بلا مرشّح مؤسسة، وبلا صفوف مذاخر", () => {
    expect(pharmacyDrugScope(undefined)).toEqual({ warehouseId: null });
  });

  it("سلسلة فارغة تُعامَل معاملة غياب المؤسسة لا معاملة مؤسسة اسمها ''", () => {
    // لو عُوملت كمؤسسة لأنتجت OR بـ organizationId: "" فلا يطابق شيئاً،
    // فيرى المستخدم كتالوجاً فارغاً بدل خطأ — فشل صامت.
    expect(pharmacyDrugScope("")).toEqual({ warehouseId: null });
  });
});
