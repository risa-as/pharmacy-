import { describe, it, expect } from "vitest";
import {
  salesByPeriod,
  topSellers,
  slowMovers,
  fulfilmentRate,
  marginByItem,
  expiryRisk,
  salesByCustomer,
  type SoldLine,
} from "../warehouse-reports";

const NOW = new Date("2026-09-05T00:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function line(overrides: Partial<SoldLine> = {}): SoldLine {
  return {
    barcode: "b1",
    tradeName: "دواء 1",
    quantity: 10,
    lineTotal: 1000,
    costPrice: 50,
    organizationId: "org1",
    pharmacyName: "صيدلية 1",
    shippedAt: NOW,
    ...overrides,
  };
}

describe("fulfilmentRate — أهم مؤشر جودة لمذخر", () => {
  it("صفر بنود → 0، وليس NaN", () => {
    expect(fulfilmentRate([])).toEqual({
      fullyFilled: 0,
      partial: 0,
      outOfStock: 0,
      totalLines: 0,
      ratePercent: 0,
    });
  });

  it("PARTIAL يُحتسَب جزئياً وليس مكتملاً", () => {
    const result = fulfilmentRate([
      { status: "AVAILABLE", quantity: 10, quotedQuantity: null },
      { status: "PARTIAL", quantity: 10, quotedQuantity: 5 },
    ]);
    expect(result.fullyFilled).toBe(1);
    expect(result.partial).toBe(1);
    expect(result.outOfStock).toBe(0);
    expect(result.totalLines).toBe(2);
    expect(result.ratePercent).toBe(50);
  });

  it("OUT_OF_STOCK يُحتسَب غير مكتمل، والنسبة تُقرَّب لمنزلة عشرية واحدة", () => {
    const result = fulfilmentRate([
      { status: "AVAILABLE", quantity: 10, quotedQuantity: null },
      { status: "AVAILABLE", quantity: 10, quotedQuantity: null },
      { status: "OUT_OF_STOCK", quantity: 10, quotedQuantity: null },
    ]);
    expect(result.fullyFilled).toBe(2);
    expect(result.outOfStock).toBe(1);
    expect(result.totalLines).toBe(3);
    expect(result.ratePercent).toBeCloseTo(66.7, 5);
  });

  it("status غير معروف (دفاعياً) يُحتسَب outOfStock لا يُسقَط بصمت", () => {
    const result = fulfilmentRate([{ status: "REQUESTED", quantity: 10, quotedQuantity: null }]);
    expect(result.outOfStock).toBe(1);
    expect(result.totalLines).toBe(1);
  });
});

describe("marginByItem — هامش الربح", () => {
  it("تكلفة مفقودة (undefined) → marginPercent: null، ليس 100", () => {
    const result = marginByItem([line({ barcode: "b1", lineTotal: 1000, quantity: 10, costPrice: undefined })]);
    expect(result).toHaveLength(1);
    expect(result[0].marginPercent).toBeNull();
    expect(result[0].revenue).toBe(1000);
  });

  it("تكلفة صفرية → marginPercent: null، ليس 100", () => {
    const result = marginByItem([line({ barcode: "b1", lineTotal: 1000, quantity: 10, costPrice: 0 })]);
    expect(result[0].marginPercent).toBeNull();
    expect(result[0].revenue).toBe(1000);
    expect(result[0].cost).toBe(0);
  });

  it("تكلفة معروفة موجبة → هامش وربح محسوبان بدقة", () => {
    const result = marginByItem([line({ barcode: "b1", lineTotal: 1000, quantity: 10, costPrice: 50 })]);
    // cost = 10 * 50 = 500; margin = 1000 - 500 = 500; marginPercent = 50%
    expect(result[0].cost).toBe(500);
    expect(result[0].margin).toBe(500);
    expect(result[0].marginPercent).toBe(50);
  });

  it("يجمع عدة أسطر لنفس الباركود قبل حساب الهامش", () => {
    const result = marginByItem([
      line({ barcode: "b1", lineTotal: 500, quantity: 5, costPrice: 50 }),
      line({ barcode: "b1", lineTotal: 500, quantity: 5, costPrice: 50 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].revenue).toBe(1000);
    expect(result[0].cost).toBe(500);
    expect(result[0].marginPercent).toBe(50);
  });

  // ميزة البونص: بيع 10 بسعر 1000 (إيراد 10,000)، تكلفة 600/وحدة، وبونص 1 —
  // التكلفة يجب أن تشمل الوحدة المجانية (11×600=6,600) لا المباعة وحدها
  // (10×600=6,000)، فالهامش 34% وليس 40%. الإيراد لا يتأثر بالبونص إطلاقاً.
  it("بونص يدخل التكلفة كاملة فيُخفِّض الهامش الظاهر — لا يُستبعَد من الحساب", () => {
    const result = marginByItem([
      line({ barcode: "b1", lineTotal: 10000, quantity: 10, costPrice: 600, bonusQuantity: 1 }),
    ]);
    expect(result[0].revenue).toBe(10000);
    expect(result[0].cost).toBe(6600);
    expect(result[0].margin).toBe(3400);
    expect(result[0].marginPercent).toBe(34);
  });

  it("بونص غائب (undefined) يُعامَل كصفر — لا فرق عن عدم وجود الحقل إطلاقاً", () => {
    const result = marginByItem([line({ barcode: "b1", lineTotal: 1000, quantity: 10, costPrice: 50 })]);
    expect(result[0].cost).toBe(500);
  });
});

describe("slowMovers — الأصناف الراكدة", () => {
  it("صنف في الكتالوج لم يُبَع إطلاقاً يظهر دائماً بـ lastSoldAt: null وdaysSince: null", () => {
    const catalog = [{ barcode: "never", tradeName: "لم يُبَع أبداً" }];
    const result = slowMovers(catalog, [], 90, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].lastSoldAt).toBeNull();
    expect(result[0].daysSince).toBeNull();
  });

  it("صنف بيع قبل sinceDays يوماً يظهر، وصنف بيع مؤخراً لا يظهر", () => {
    const catalog = [
      { barcode: "old", tradeName: "قديم" },
      { barcode: "fresh", tradeName: "حديث" },
    ];
    const lines: SoldLine[] = [
      line({ barcode: "old", shippedAt: daysAgo(120) }),
      line({ barcode: "fresh", shippedAt: daysAgo(5) }),
    ];
    const result = slowMovers(catalog, lines, 90, NOW);
    const barcodes = result.map((r) => r.barcode);
    expect(barcodes).toContain("old");
    expect(barcodes).not.toContain("fresh");
  });

  it("يرتّب لم-يُبَع-إطلاقاً أولاً ثم الأقدم بيعاً فالأحدث", () => {
    const catalog = [
      { barcode: "old", tradeName: "قديم" },
      { barcode: "never", tradeName: "أبداً" },
      { barcode: "older", tradeName: "أقدم" },
    ];
    const lines: SoldLine[] = [
      line({ barcode: "old", shippedAt: daysAgo(100) }),
      line({ barcode: "older", shippedAt: daysAgo(200) }),
    ];
    const result = slowMovers(catalog, lines, 90, NOW);
    expect(result.map((r) => r.barcode)).toEqual(["never", "older", "old"]);
  });
});

describe("salesByPeriod — تجميع بفترة", () => {
  it("يجمّع باليوم ويرتّب تصاعدياً", () => {
    const lines: SoldLine[] = [
      line({ organizationId: "org1", shippedAt: new Date("2026-09-01T10:00:00.000Z"), lineTotal: 100, quantity: 1 }),
      line({ organizationId: "org1", shippedAt: new Date("2026-09-01T15:00:00.000Z"), lineTotal: 200, quantity: 2 }),
      line({ organizationId: "org2", shippedAt: new Date("2026-08-30T10:00:00.000Z"), lineTotal: 50, quantity: 1 }),
    ];
    const result = salesByPeriod(lines, "day", NOW);
    expect(result.map((r) => r.key)).toEqual(["2026-08-30", "2026-09-01"]);
    expect(result[1].total).toBe(300);
    expect(result[1].quantity).toBe(3);
  });

  it("يجمّع بالشهر بمفتاح YYYY-MM", () => {
    const lines: SoldLine[] = [
      line({ shippedAt: new Date("2026-08-15T00:00:00.000Z") }),
      line({ shippedAt: new Date("2026-09-01T00:00:00.000Z") }),
    ];
    const result = salesByPeriod(lines, "month", NOW);
    expect(result.map((r) => r.key)).toEqual(["2026-08", "2026-09"]);
  });

  it("يجمّع بالأسبوع (ISO) بمفتاح YYYY-Www ويرتّب تصاعدياً عبر تغيّر السنة", () => {
    const lines: SoldLine[] = [
      // 2026-01-01 يقع في آخر أسبوع ISO من 2025 (الخميس مرجعي).
      line({ shippedAt: new Date("2026-01-01T00:00:00.000Z") }),
      line({ shippedAt: new Date("2026-01-05T00:00:00.000Z") }),
    ];
    const result = salesByPeriod(lines, "week", NOW);
    expect(result).toHaveLength(2);
    expect(result[0].key < result[1].key).toBe(true);
  });

  it("عدد الطلبات يُعَدّ حسب (صيدلية + وقت شحن) لا حسب عدد الأسطر", () => {
    const sameOrderTime = new Date("2026-09-01T10:00:00.000Z");
    const lines: SoldLine[] = [
      line({ organizationId: "org1", shippedAt: sameOrderTime, barcode: "b1" }),
      line({ organizationId: "org1", shippedAt: sameOrderTime, barcode: "b2" }),
    ];
    const result = salesByPeriod(lines, "day", NOW);
    expect(result[0].orders).toBe(1);
  });
});

describe("topSellers — الأكثر مبيعاً", () => {
  it("بالقيمة مقابل بالكمية يعطيان ترتيبين مختلفين عندما يتعارضان", () => {
    const lines: SoldLine[] = [
      line({ barcode: "cheap-high-qty", lineTotal: 100, quantity: 100 }),
      line({ barcode: "expensive-low-qty", lineTotal: 500, quantity: 5 }),
    ];
    const byValue = topSellers(lines, "value");
    const byQuantity = topSellers(lines, "quantity");
    expect(byValue[0].barcode).toBe("expensive-low-qty");
    expect(byQuantity[0].barcode).toBe("cheap-high-qty");
  });

  it("يحترم limit", () => {
    const lines: SoldLine[] = [
      line({ barcode: "a", lineTotal: 300 }),
      line({ barcode: "b", lineTotal: 200 }),
      line({ barcode: "c", lineTotal: 100 }),
    ];
    const result = topSellers(lines, "value", 2);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.barcode)).toEqual(["a", "b"]);
  });
});

describe("expiryRisk — مخاطر الصلاحية", () => {
  it("يصنّف كل دفعة إلى نفس فئة expiryBucket، وvalue = quantity × costPrice", () => {
    const batches = [
      { quantity: 10, expiryDate: daysAgo(1), costPrice: 5, tradeName: "منتهٍ", batchNumber: "B1" }, // EXPIRED
      { quantity: 20, expiryDate: daysAgo(-30), costPrice: 5, tradeName: "حرج", batchNumber: "B2" }, // CRITICAL (<=90)
      { quantity: 30, expiryDate: daysAgo(-150), costPrice: 5, tradeName: "تحذير", batchNumber: "B3" }, // WARNING (<=180)
      { quantity: 40, expiryDate: daysAgo(-400), costPrice: 5, tradeName: "سليم", batchNumber: "B4" }, // OK
    ];
    const result = expiryRisk(batches, NOW);

    expect(result.byBucket.EXPIRED).toEqual({ quantity: 10, value: 50 });
    expect(result.byBucket.CRITICAL).toEqual({ quantity: 20, value: 100 });
    expect(result.byBucket.WARNING).toEqual({ quantity: 30, value: 150 });
    expect(result.byBucket.OK).toEqual({ quantity: 40, value: 200 });

    expect(result.items).toHaveLength(4);
    expect(result.items.find((i) => i.batchNumber === "B2")?.bucket).toBe("CRITICAL");
    expect(result.items.find((i) => i.batchNumber === "B2")?.value).toBe(100);
  });
});

describe("salesByCustomer — مبيعات لكل صيدلية", () => {
  it("يجمّع حسب المنظمة، ويحسب lastOrderAt كأحدث شحنة", () => {
    const lines: SoldLine[] = [
      line({ organizationId: "org1", pharmacyName: "صيدلية أ", lineTotal: 100, shippedAt: daysAgo(10) }),
      line({ organizationId: "org1", pharmacyName: "صيدلية أ", lineTotal: 200, shippedAt: daysAgo(1) }),
      line({ organizationId: "org2", pharmacyName: "صيدلية ب", lineTotal: 500, shippedAt: daysAgo(5) }),
    ];
    const result = salesByCustomer(lines);
    const org1 = result.find((r) => r.organizationId === "org1")!;
    const org2 = result.find((r) => r.organizationId === "org2")!;

    expect(org1.total).toBe(300);
    expect(org1.lastOrderAt.getTime()).toBe(daysAgo(1).getTime());
    expect(org2.total).toBe(500);
    // مرتَّب تنازلياً بالإجمالي.
    expect(result[0].organizationId).toBe("org2");
  });
});
