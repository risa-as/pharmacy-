// المرحلة ب من ميزة تتبّع مخزون المذخر: اختبارات منطق خصم المخزون عند الشحن
// (PATCH /api/warehouse-portal/orders/[id]/shipping) — الدوال النقية فقط.
// المسار نفسه (route.ts) غير قابل للاختبار مباشرة (خارج تغطية vitest.config.ts)،
// لذا كل قرار غير تافه استُخرج هنا واختُبر بمعزل عن Prisma/Next.
import { describe, it, expect } from "vitest";
import {
  computeRequiredDeductions,
  aggregateDeductions,
  decideStockTracking,
  type OrderItemForDeduction,
} from "../warehouse-stock";

describe("computeRequiredDeductions — بنود الطلب إلى خصومات مخزون مطلوبة", () => {
  it("صنف OUT_OF_STOCK لا يُنتج أي خصم إطلاقاً", () => {
    const items: OrderItemForDeduction[] = [
      { barcode: "111", status: "OUT_OF_STOCK", quantity: 20, unitPrice: 1000, quotedPrice: 0, quotedQuantity: null },
    ];
    expect(computeRequiredDeductions(items)).toEqual([]);
  });

  it("صنف PARTIAL يُخصَم بمقدار quotedQuantity لا الكمية الأصلية", () => {
    const items: OrderItemForDeduction[] = [
      { barcode: "222", status: "PARTIAL", quantity: 30, unitPrice: 1000, quotedPrice: 1000, quotedQuantity: 12 },
    ];
    expect(computeRequiredDeductions(items)).toEqual([{ barcode: "222", quantity: 12 }]);
  });

  it("صنف AVAILABLE يُخصَم بالكمية المطلوبة كاملة", () => {
    const items: OrderItemForDeduction[] = [
      { barcode: "333", status: "AVAILABLE", quantity: 7, unitPrice: 500, quotedPrice: 500, quotedQuantity: null },
    ];
    expect(computeRequiredDeductions(items)).toEqual([{ barcode: "333", quantity: 7 }]);
  });

  it("مزيج من الحالات الثلاث — OUT_OF_STOCK مستبعد وحده من الناتج", () => {
    const items: OrderItemForDeduction[] = [
      { barcode: "a", status: "AVAILABLE", quantity: 5, unitPrice: 100, quotedPrice: 100, quotedQuantity: null },
      { barcode: "b", status: "OUT_OF_STOCK", quantity: 9, unitPrice: 100, quotedPrice: 0, quotedQuantity: null },
      { barcode: "c", status: "PARTIAL", quantity: 10, unitPrice: 100, quotedPrice: 100, quotedQuantity: 4 },
    ];
    expect(computeRequiredDeductions(items)).toEqual([
      { barcode: "a", quantity: 5 },
      { barcode: "c", quantity: 4 },
    ]);
  });

  // ميزة البونص: كمية الخصم = المباعة + البونص المعتمَد على السطر.
  it("صنف AVAILABLE بمباع 10 وبونص 1 → يُخصَم 11 (المباع + المجاني)", () => {
    const items: OrderItemForDeduction[] = [
      {
        barcode: "444",
        status: "AVAILABLE",
        quantity: 10,
        unitPrice: 1000,
        quotedPrice: 1000,
        quotedQuantity: null,
        bonusQuantity: 1,
      },
    ];
    expect(computeRequiredDeductions(items)).toEqual([{ barcode: "444", quantity: 11 }]);
  });

  it("صنف OUT_OF_STOCK ببونص عالق (بيانات قديمة/خطأ إدخال) → يُخصَم صفر، لا البونص وحده", () => {
    const items: OrderItemForDeduction[] = [
      {
        barcode: "555",
        status: "OUT_OF_STOCK",
        quantity: 20,
        unitPrice: 1000,
        quotedPrice: 0,
        quotedQuantity: null,
        bonusQuantity: 3,
      },
    ];
    expect(computeRequiredDeductions(items)).toEqual([]);
  });
});

describe("aggregateDeductions — تجميع بنود مكرَّرة بنفس الباركود", () => {
  it("يجمع كميات نفس الباركود من بندين منفصلين في بند واحد", () => {
    const result = aggregateDeductions([
      { barcode: "x", quantity: 5 },
      { barcode: "x", quantity: 3 },
      { barcode: "y", quantity: 2 },
    ]);
    expect(result).toEqual([
      { barcode: "x", quantity: 8 },
      { barcode: "y", quantity: 2 },
    ]);
  });

  it("قائمة بلا تكرار تمر بلا تغيير في الكميات", () => {
    const input = [
      { barcode: "x", quantity: 5 },
      { barcode: "y", quantity: 2 },
    ];
    expect(aggregateDeductions(input)).toEqual(input);
  });
});

describe("decideStockTracking — التتبّع الذاتي الضبط (بلا علم تفعيل)", () => {
  it("صفر دفعات → UNTRACKED_SKIP (هذا المذخر لم يبدأ تتبّع هذا الصنف)", () => {
    expect(decideStockTracking(0)).toBe("UNTRACKED_SKIP");
  });

  it("دفعة واحدة أو أكثر → ENFORCE فوراً بلا أي شرط إضافي", () => {
    expect(decideStockTracking(1)).toBe("ENFORCE");
    expect(decideStockTracking(5)).toBe("ENFORCE");
  });
});
