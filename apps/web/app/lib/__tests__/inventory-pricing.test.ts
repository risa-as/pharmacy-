import { describe, it, expect } from "vitest";
import { decideNewInventoryPricing } from "../inventory-pricing";

describe("decideNewInventoryPricing — تسعير أول دفعة لسطر مخزون جديد", () => {
  it("هامش غائب (undefined) → افتراضي 5%", () => {
    const r = decideNewInventoryPricing({ cost: 1000, minProfitMargin: undefined });
    expect(r).toEqual({ price: 1050, cost: 1000 });
  });

  it("هامش null → افتراضي 5%", () => {
    const r = decideNewInventoryPricing({ cost: 1000, minProfitMargin: null });
    expect(r).toEqual({ price: 1050, cost: 1000 });
  });

  it("هامش NaN → افتراضي 5%", () => {
    const r = decideNewInventoryPricing({ cost: 1000, minProfitMargin: NaN });
    expect(r).toEqual({ price: 1050, cost: 1000 });
  });

  it("هامش صريح 20% → cost 1000 → price 1200", () => {
    const r = decideNewInventoryPricing({ cost: 1000, minProfitMargin: 20 });
    expect(r).toEqual({ price: 1200, cost: 1000 });
  });

  it("كلفة صفر → سعر صفر (بلا NaN)", () => {
    const r = decideNewInventoryPricing({ cost: 0, minProfitMargin: 20 });
    expect(r).toEqual({ price: 0, cost: 0 });
  });

  it("كلفة سالبة → {price: 0, cost: 0}", () => {
    const r = decideNewInventoryPricing({ cost: -500, minProfitMargin: 5 });
    expect(r).toEqual({ price: 0, cost: 0 });
  });

  it("كلفة غير منتهية (Infinity) → {price: 0, cost: 0}", () => {
    const r = decideNewInventoryPricing({ cost: Infinity, minProfitMargin: 5 });
    expect(r).toEqual({ price: 0, cost: 0 });
  });

  it("كلفة NaN → {price: 0, cost: 0}", () => {
    const r = decideNewInventoryPricing({ cost: NaN, minProfitMargin: 5 });
    expect(r).toEqual({ price: 0, cost: 0 });
  });

  it("قاعدة التقريب: أقرب دينار صحيح لأعلى عند .5 فأكثر", () => {
    // 1000 * 1.075 = 1075 بالضبط — بلا كسور، تأكيد أساسي
    expect(decideNewInventoryPricing({ cost: 1000, minProfitMargin: 7.5 })).toEqual({
      price: 1075,
      cost: 1000,
    });
    // 333 * 1.05 = 349.65 → يقرَّب إلى 350
    expect(decideNewInventoryPricing({ cost: 333, minProfitMargin: 5 })).toEqual({
      price: 350,
      cost: 333,
    });
    // 3 * 1.5 = 4.5 بالضبط (بلا خطأ فاصلة عائمة) → التقريب الحسابي المعتاد يرفع إلى 5
    expect(decideNewInventoryPricing({ cost: 3, minProfitMargin: 50 })).toEqual({
      price: 5,
      cost: 3,
    });
  });
});
