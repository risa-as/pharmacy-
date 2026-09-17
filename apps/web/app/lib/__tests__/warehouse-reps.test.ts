// المندوبون (Field Sales Reps) — مذاخر B2B: اختبارات الدوال النقية في
// app/lib/warehouse-reps.ts — بمعزل عن Prisma/Next (استيراد نسبي، لا alias
// "@/*"، نفس قيد إعداد vitest في هذا المستودع).
import { describe, it, expect } from "vitest";
import {
  computeCommission,
  computeFieldSaleProfit,
  repStockAvailable,
} from "../warehouse-reps";

describe("computeCommission — الأساس الصحيح لكل نمط عمولة", () => {
  it("SALES: الأساس = salesTotal، والعمولة = نسبة منه", () => {
    const result = computeCommission({
      basis: "SALES",
      rate: 5,
      salesTotal: 100_000,
      profitTotal: 30_000,
      collectedTotal: 60_000,
    });
    expect(result).toEqual({ base: 100_000, amount: 5000 });
  });

  it("PROFIT: الأساس = profitTotal، والعمولة = نسبة منه", () => {
    const result = computeCommission({
      basis: "PROFIT",
      rate: 10,
      salesTotal: 100_000,
      profitTotal: 30_000,
      collectedTotal: 60_000,
    });
    expect(result).toEqual({ base: 30_000, amount: 3000 });
  });

  it("COLLECTION: الأساس = collectedTotal، والعمولة = نسبة منه (الأهم تجارياً)", () => {
    const result = computeCommission({
      basis: "COLLECTION",
      rate: 2,
      salesTotal: 100_000,
      profitTotal: 30_000,
      collectedTotal: 60_000,
    });
    expect(result).toEqual({ base: 60_000, amount: 1200 });
  });

  it("rate: 0 → amount 0 لكن base يبقى مُبلَّغاً بصدق (لا صفر مصطنع)", () => {
    const result = computeCommission({
      basis: "SALES",
      rate: 0,
      salesTotal: 50_000,
      profitTotal: 0,
      collectedTotal: 0,
    });
    expect(result).toEqual({ base: 50_000, amount: 0 });
  });

  it("rate سالب → amount 0، base يبقى مُبلَّغاً بصدق", () => {
    const result = computeCommission({
      basis: "SALES",
      rate: -5,
      salesTotal: 50_000,
      profitTotal: 0,
      collectedTotal: 0,
    });
    expect(result).toEqual({ base: 50_000, amount: 0 });
  });

  it("rate غير منتهٍ (NaN) → amount 0، لا NaN يتسرَّب", () => {
    const result = computeCommission({
      basis: "SALES",
      rate: NaN,
      salesTotal: 50_000,
      profitTotal: 0,
      collectedTotal: 0,
    });
    expect(result.amount).toBe(0);
    expect(Number.isNaN(result.amount)).toBe(false);
  });

  it("rate = Infinity → amount 0 (غير منتهٍ يُعامَل كـ'لا عمولة')", () => {
    const result = computeCommission({
      basis: "COLLECTION",
      rate: Infinity,
      salesTotal: 0,
      profitTotal: 0,
      collectedTotal: 10_000,
    });
    expect(result).toEqual({ base: 10_000, amount: 0 });
  });

  it("PROFIT سالب (خسارة فعلية) → base يُعامَل كصفر، لا رقم سالب", () => {
    const result = computeCommission({
      basis: "PROFIT",
      rate: 10,
      salesTotal: 100_000,
      profitTotal: -20_000,
      collectedTotal: 0,
    });
    expect(result).toEqual({ base: 0, amount: 0 });
  });

  it("PROFIT سالب مع rate: 0 معاً — القاعدتان لا تتصادمان، النتيجة صفر/صفر باتساق", () => {
    const result = computeCommission({
      basis: "PROFIT",
      rate: 0,
      salesTotal: 100_000,
      profitTotal: -20_000,
      collectedTotal: 0,
    });
    expect(result).toEqual({ base: 0, amount: 0 });
  });

  it("الأساس غير المنتهي (NaN/Infinity) يُعامَل كصفر", () => {
    expect(
      computeCommission({ basis: "SALES", rate: 5, salesTotal: NaN, profitTotal: 0, collectedTotal: 0 })
    ).toEqual({ base: 0, amount: 0 });
    expect(
      computeCommission({ basis: "COLLECTION", rate: 5, salesTotal: 0, profitTotal: 0, collectedTotal: Infinity })
    ).toEqual({ base: 0, amount: 0 });
  });

  it("العمولة تُقرَّب لخانتين عشريتين", () => {
    const result = computeCommission({
      basis: "SALES",
      rate: 3.333,
      salesTotal: 1000,
      profitTotal: 0,
      collectedTotal: 0,
    });
    // 1000 * 3.333 / 100 = 33.33
    expect(result).toEqual({ base: 1000, amount: 33.33 });
  });
});

describe("computeFieldSaleProfit — بونص يقلّل الربح، لا يُلغى من الحساب", () => {
  it("المثال الحاسم من المواصفة: 10 وحدات بسعر 1000 (كلفة 600) مع بونص وحدة واحدة → إيراد 10,000 / كلفة 6,600 / ربح 3,400 (وليس 4,000)", () => {
    const result = computeFieldSaleProfit([
      { quantity: 10, bonusQuantity: 1, unitPrice: 1000, unitCost: 600 },
    ]);
    expect(result).toEqual({ revenue: 10_000, cost: 6_600, profit: 3_400 });
  });

  it("بلا بونص: الربح = (سعر - كلفة) × الكمية العادي", () => {
    const result = computeFieldSaleProfit([
      { quantity: 5, bonusQuantity: 0, unitPrice: 200, unitCost: 120 },
    ]);
    expect(result).toEqual({ revenue: 1000, cost: 600, profit: 400 });
  });

  it("عدة أسطر تُجمَّع معاً", () => {
    const result = computeFieldSaleProfit([
      { quantity: 10, bonusQuantity: 1, unitPrice: 1000, unitCost: 600 },
      { quantity: 5, bonusQuantity: 0, unitPrice: 200, unitCost: 120 },
    ]);
    expect(result).toEqual({ revenue: 11_000, cost: 7_200, profit: 3_800 });
  });

  it("قائمة فارغة → كل شيء صفر", () => {
    expect(computeFieldSaleProfit([])).toEqual({ revenue: 0, cost: 0, profit: 0 });
  });

  it("مدخلات غير صالحة (سالبة/كسرية/NaN) تُعامَل كصفر دفاعياً، لا NaN يتسرَّب", () => {
    const result = computeFieldSaleProfit([
      { quantity: NaN, bonusQuantity: -1, unitPrice: Infinity, unitCost: 100 },
    ]);
    expect(result).toEqual({ revenue: 0, cost: 0, profit: 0 });
    expect(Number.isNaN(result.profit)).toBe(false);
  });

  it("بونص كامل السطر (quantity: 0) — كلفة بلا إيراد، ربح سالب", () => {
    const result = computeFieldSaleProfit([
      { quantity: 0, bonusQuantity: 5, unitPrice: 1000, unitCost: 600 },
    ]);
    expect(result).toEqual({ revenue: 0, cost: 3000, profit: -3000 });
  });
});

describe("repStockAvailable — رصيد المندوب من دفعة معيّنة", () => {
  const stock = [
    { batchId: "b1", quantity: 40 },
    { batchId: "b2", quantity: 0 },
  ];

  it("دفعة غير معروفة (غير موجودة في رصيد المندوب) → 0", () => {
    expect(repStockAvailable(stock, "unknown-batch")).toBe(0);
  });

  it("دفعة معروفة → الكمية بالضبط", () => {
    expect(repStockAvailable(stock, "b1")).toBe(40);
  });

  it("دفعة معروفة برصيد صفري → 0 (وليس 'غير موجودة')", () => {
    expect(repStockAvailable(stock, "b2")).toBe(0);
  });

  it("رصيد فارغ بالكامل → 0 لأي دفعة", () => {
    expect(repStockAvailable([], "b1")).toBe(0);
  });
});
