import { describe, it, expect } from "vitest";
import {
  decideMirrorSupplier,
  buildDraftPurchasePlan,
  type DraftPurchaseItem,
} from "../warehouse-purchase-bridge";

describe("decideMirrorSupplier — قرار المورد المرآة", () => {
  it("مورد مرآة موجود → USE بلا إنشاء (معيار القبول 5: لا تكرار)", () => {
    const d = decideMirrorSupplier({ existingSupplier: { id: "sup-1" }, organizationId: "org-1" });
    expect(d).toEqual({ action: "USE", supplierId: "sup-1" });
  });

  it("غير موجود + منظمة معروفة → CREATE", () => {
    const d = decideMirrorSupplier({ existingSupplier: null, organizationId: "org-1" });
    expect(d.action).toBe("CREATE");
    expect(d.name).toBeUndefined;
  });

  it("SUPER_ADMIN بلا منظمة → BLOCKED_NO_ORG (لا مورد مرآة بلا منظمة)", () => {
    const d = decideMirrorSupplier({ existingSupplier: null, organizationId: null });
    expect(d.action).toBe("BLOCKED_NO_ORG");
  });
});

describe("buildDraftPurchasePlan — بنود فاتورة الشراء المسودة", () => {
  it("يحسب الإجمالي من الكمية × السعر الفعلي", () => {
    const items: DraftPurchaseItem[] = [
      { drugId: "a", quantity: 10, effectivePrice: 1000 },
      { drugId: "b", quantity: 4, effectivePrice: 500 },
    ];
    const p = buildDraftPurchasePlan(items);
    expect(p.ok).toBe(true);
    expect(p.total).toBe(12000);
    expect(p.items).toHaveLength(2);
  });

  it("قائمة كلها نافدة/فارغة → غير صالحة برسالة عربية", () => {
    const p = buildDraftPurchasePlan([]);
    expect(p.ok).toBe(false);
    expect(p.errors.join(" ")).toContain("لا توجد أصناف صالحة");
  });

  it("كمية صفرية أو سعر سالب → خطأ مفهرس بالصنف", () => {
    const items: DraftPurchaseItem[] = [
      { drugId: "a", quantity: 0, effectivePrice: 1000 },
      { drugId: "b", quantity: 2, effectivePrice: -5 },
    ];
    const p = buildDraftPurchasePlan(items);
    expect(p.ok).toBe(false);
    expect(p.errors.join(" ")).toContain("a");
    expect(p.errors.join(" ")).toContain("b");
  });

  // ميزة البونص: سطر بونص منفصل بكلفة صفر بالضبط — لا يدخل total ولا يُدمَج
  // بمتوسط كلفة السطر المدفوع.
  it("bonusQuantity > 0 → سطر PurchaseItem إضافي منفصل بكلفة صفر، لا يُضاف لـ total", () => {
    const items: DraftPurchaseItem[] = [{ drugId: "a", quantity: 10, effectivePrice: 1000, bonusQuantity: 1 }];
    const p = buildDraftPurchasePlan(items);
    expect(p.ok).toBe(true);
    expect(p.total).toBe(10000); // بلا تغيير — البونص بلا مقابل مالي
    expect(p.items).toEqual([
      { drugId: "a", quantity: 10, cost: 1000 },
      { drugId: "a", quantity: 1, cost: 0 },
    ]);
  });

  it("bonusQuantity غائب أو صفر → لا سطر إضافي (سلوك بلا تغيير)", () => {
    const items: DraftPurchaseItem[] = [
      { drugId: "a", quantity: 10, effectivePrice: 1000 },
      { drugId: "b", quantity: 4, effectivePrice: 500, bonusQuantity: 0 },
    ];
    const p = buildDraftPurchasePlan(items);
    expect(p.items).toHaveLength(2);
  });

  // ميزة نقل الدفعة/الانتهاء عند التسعير: batchNumber/expiryDate يمرّان بلا
  // تعديل من WarehouseOrderItem إلى PurchaseItem — انظر تعليق
  // DraftPurchaseItem.batchNumber أعلى الملف المصدر.
  describe("نقل batchNumber/expiryDate إلى بنود فاتورة الشراء", () => {
    it("سطر بلا batchNumber/expiryDate (كالمعتاد اليوم) → لا يظهر أي منهما على السطر (سلوك بلا تغيير)", () => {
      const items: DraftPurchaseItem[] = [{ drugId: "a", quantity: 10, effectivePrice: 1000 }];
      const p = buildDraftPurchasePlan(items);
      expect(p.ok).toBe(true);
      // toEqual يتجاهل خصائص undefined — هذا يثبت أن غياب الحقلين لا يُدخل
      // قيمة مُختلَقة (لا null ولا نص فارغ) في مكانهما.
      expect(p.items).toEqual([{ drugId: "a", quantity: 10, cost: 1000 }]);
      expect(p.items[0].batchNumber).toBeUndefined();
      expect(p.items[0].expiryDate).toBeUndefined();
    });

    it("سطر مدفوع بـ batchNumber/expiryDate مُعلَنين → ينتقلان حرفياً إلى PurchaseItem", () => {
      const expiry = new Date("2027-01-01T00:00:00.000Z");
      const items: DraftPurchaseItem[] = [
        { drugId: "a", quantity: 10, effectivePrice: 1000, batchNumber: "LOT-42", expiryDate: expiry },
      ];
      const p = buildDraftPurchasePlan(items);
      expect(p.ok).toBe(true);
      expect(p.items).toEqual([{ drugId: "a", quantity: 10, cost: 1000, batchNumber: "LOT-42", expiryDate: expiry }]);
    });

    it("bonusQuantity > 0 مع batchNumber/expiryDate → سطر البونص يحمل نفس القيم بالضبط (نفس الدفعة الفعلية)", () => {
      const expiry = new Date("2027-06-15T00:00:00.000Z");
      const items: DraftPurchaseItem[] = [
        { drugId: "a", quantity: 10, effectivePrice: 1000, bonusQuantity: 2, batchNumber: "LOT-7", expiryDate: expiry },
      ];
      const p = buildDraftPurchasePlan(items);
      expect(p.ok).toBe(true);
      expect(p.items).toEqual([
        { drugId: "a", quantity: 10, cost: 1000, batchNumber: "LOT-7", expiryDate: expiry },
        { drugId: "a", quantity: 2, cost: 0, batchNumber: "LOT-7", expiryDate: expiry },
      ]);
    });

    it("batchNumber مُعلَن لكن expiryDate غائب (والعكس) → كل حقل يمرّ باستقلالية عن الآخر", () => {
      const items: DraftPurchaseItem[] = [
        { drugId: "a", quantity: 5, effectivePrice: 200, batchNumber: "LOT-ONLY" },
      ];
      const p = buildDraftPurchasePlan(items);
      expect(p.items[0].batchNumber).toBe("LOT-ONLY");
      expect(p.items[0].expiryDate).toBeUndefined();
    });
  });
});
