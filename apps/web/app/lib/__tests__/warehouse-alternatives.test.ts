import { describe, it, expect } from "vitest";
import { rankAlternatives, type AlternativeCatalogEntry } from "../warehouse-alternatives";

function entry(over: Partial<AlternativeCatalogEntry> = {}): AlternativeCatalogEntry {
  return {
    barcode: "1000000000001",
    tradeName: "دواء",
    price: 1000,
    sellableQuantity: 10,
    isListed: true,
    ...over,
  };
}

describe("rankAlternatives", () => {
  it("out-of-stock alternatives (sellableQuantity <= 0) are excluded", () => {
    const catalog: AlternativeCatalogEntry[] = [
      entry({ barcode: "A", tradeName: "دواء أ", sellableQuantity: 0 }),
      entry({ barcode: "B", tradeName: "دواء ب", sellableQuantity: 5 }),
    ];
    const result = rankAlternatives({ alternativeBarcodes: ["A", "B"], catalog });
    expect(result).toEqual([{ barcode: "B", tradeName: "دواء ب", price: 1000, sellableQuantity: 5 }]);
  });

  it("negative sellableQuantity is also excluded (defensive — should never happen upstream)", () => {
    const catalog: AlternativeCatalogEntry[] = [entry({ barcode: "A", sellableQuantity: -1 })];
    expect(rankAlternatives({ alternativeBarcodes: ["A"], catalog })).toEqual([]);
  });

  it("unlisted alternatives (isListed=false) are excluded even with stock", () => {
    const catalog: AlternativeCatalogEntry[] = [
      entry({ barcode: "A", isListed: false, sellableQuantity: 100 }),
    ];
    expect(rankAlternatives({ alternativeBarcodes: ["A"], catalog })).toEqual([]);
  });

  it("preserves the curated alternativeBarcodes order — does NOT re-sort by price or stock", () => {
    // ترتيب المصفوفة: C ثم A ثم B. لو أُعيد الترتيب بالسعر (تصاعدياً) لكانت
    // النتيجة A, B, C — ولو بالمخزون (تنازلياً) لكانت B, A, C. النتيجة الصحيحة
    // الوحيدة هي C, A, B: نفس ترتيب alternativeBarcodes حرفياً.
    const catalog: AlternativeCatalogEntry[] = [
      entry({ barcode: "A", tradeName: "دواء أ", price: 500, sellableQuantity: 3 }),
      entry({ barcode: "B", tradeName: "دواء ب", price: 100, sellableQuantity: 50 }),
      entry({ barcode: "C", tradeName: "دواء ج", price: 900, sellableQuantity: 1 }),
    ];
    const result = rankAlternatives({ alternativeBarcodes: ["C", "A", "B"], catalog });
    expect(result.map((r) => r.barcode)).toEqual(["C", "A", "B"]);
  });

  it("unknown barcodes (not in this warehouse's catalog) are ignored silently", () => {
    const catalog: AlternativeCatalogEntry[] = [entry({ barcode: "A" })];
    const result = rankAlternatives({ alternativeBarcodes: ["ZZZ", "A", "YYY"], catalog });
    expect(result.map((r) => r.barcode)).toEqual(["A"]);
  });

  it("duplicate barcodes in alternativeBarcodes are de-duplicated (first occurrence kept)", () => {
    const catalog: AlternativeCatalogEntry[] = [entry({ barcode: "A", tradeName: "دواء أ" })];
    const result = rankAlternatives({ alternativeBarcodes: ["A", "A", "A"], catalog });
    expect(result).toEqual([{ barcode: "A", tradeName: "دواء أ", price: 1000, sellableQuantity: 10 }]);
  });

  it("empty alternativeBarcodes -> empty array", () => {
    expect(rankAlternatives({ alternativeBarcodes: [], catalog: [entry()] })).toEqual([]);
  });

  it("missing/null alternativeBarcodes -> empty array, no throw", () => {
    expect(rankAlternatives({ alternativeBarcodes: null, catalog: [entry()] })).toEqual([]);
    expect(rankAlternatives({ alternativeBarcodes: undefined, catalog: [entry()] })).toEqual([]);
  });

  it("empty/missing catalog -> empty array, no throw", () => {
    expect(rankAlternatives({ alternativeBarcodes: ["A"], catalog: [] })).toEqual([]);
    expect(rankAlternatives({ alternativeBarcodes: ["A"], catalog: null })).toEqual([]);
    expect(rankAlternatives({ alternativeBarcodes: ["A"], catalog: undefined })).toEqual([]);
  });

  it("falsy barcode entries in alternativeBarcodes (empty string) are skipped without matching anything", () => {
    const catalog: AlternativeCatalogEntry[] = [entry({ barcode: "" })];
    expect(rankAlternatives({ alternativeBarcodes: ["", "A"], catalog })).toEqual([]);
  });
});
