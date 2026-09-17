import { describe, it, expect } from "vitest";
import {
  findLikelySupplierMatches,
  normalizeEntityName,
  normalizePhone,
  type DuplicateCandidateSupplier,
} from "../supplier-duplicate-match";

function sup(over: Partial<DuplicateCandidateSupplier> = {}): DuplicateCandidateSupplier {
  return { id: "s1", name: "اكليل الجبل", phone: null, warehouseId: null, ...over };
}

describe("normalizeEntityName", () => {
  it("يوحّد الهمزات والتاء المربوطة وأل التعريف والكلمات العامة", () => {
    expect(normalizeEntityName("مذخر إكليل الجبل")).toBe(normalizeEntityName("اكليل جبل"));
    expect(normalizeEntityName("شركة نسيم البحر للأدوية")).toBe(normalizeEntityName("نسيم بحر"));
    expect(normalizeEntityName("مذخر على المنصة: الليل الأزلي")).toBe(normalizeEntityName("الليل الازلي"));
  });

  it("اسم مكوّن من كلمات عامة فقط يصبح فارغاً", () => {
    expect(normalizeEntityName("شركة مذخر")).toBe("");
  });
});

describe("normalizePhone", () => {
  it("يوحّد الصيغة المحلية والدولية والأرقام العربية", () => {
    expect(normalizePhone("07800000000")).toBe(normalizePhone("+964 780 000 0000"));
    expect(normalizePhone("٠٧٨٠٠٠٠٠٠٠٠")).toBe("7800000000");
  });

  it("رقم قصير أو فارغ لا يُعتمد", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("findLikelySupplierMatches", () => {
  it("يطابق بالهاتف حتى لو اختلف الاسم", () => {
    const res = findLikelySupplierMatches(
      { name: "مذخر الشروق", phone: "+9647800000000" },
      [sup({ id: "s1", name: "اكليل الجبل", phone: "07800000000" })]
    );
    expect(res).toEqual([{ supplierId: "s1", supplierName: "اكليل الجبل", reason: "PHONE" }]);
  });

  it("يطابق بالاسم المطبَّع", () => {
    const res = findLikelySupplierMatches({ name: "مذخر إكليل الجبل", phone: null }, [sup()]);
    expect(res.map((m) => m.reason)).toEqual(["NAME"]);
  });

  it("لا يقترح مورداً مربوطاً بمذخر", () => {
    const res = findLikelySupplierMatches({ name: "اكليل الجبل", phone: null }, [sup({ warehouseId: "wh-9" })]);
    expect(res).toEqual([]);
  });

  it("لا يطابق اسماً قصيراً عاماً داخل اسم أطول", () => {
    const res = findLikelySupplierMatches({ name: "نور", phone: null }, [sup({ name: "نور الهدى للأدوية" })]);
    expect(res).toEqual([]);
  });

  it("لا يطابق جهتين مختلفتين", () => {
    const res = findLikelySupplierMatches({ name: "نسيم البحر", phone: "07711111111" }, [
      sup({ id: "s1", name: "اكليل الجبل", phone: "07800000000" }),
      sup({ id: "s2", name: "الليل الازلي", phone: "07519232339" }),
    ]);
    expect(res).toEqual([]);
  });

  it("مطابقات الهاتف قبل الاسم وبلا تكرار", () => {
    const res = findLikelySupplierMatches({ name: "نسيم البحر", phone: "07711111111" }, [
      sup({ id: "byName", name: "نسيم البحر" }),
      sup({ id: "byPhone", name: "مكتب آخر", phone: "07711111111" }),
      sup({ id: "both", name: "نسيم البحر", phone: "07711111111" }),
    ]);
    expect(res.map((m) => m.supplierId)).toEqual(["byPhone", "both", "byName"]);
  });
});
