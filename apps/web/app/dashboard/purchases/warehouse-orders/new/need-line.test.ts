import { describe, it, expect } from "vitest";
import { priceDrift, selectedOption, type NeedLine, type SupplierPriceOption } from "./types";

function option(over: Partial<SupplierPriceOption> = {}): SupplierPriceOption {
  return {
    supplierId: "sup-a",
    supplierName: "التفاح الأخضر",
    warehouseId: null,
    warehouseName: null,
    price: 1000,
    recordedAt: "2026-09-01T00:00:00.000Z",
    source: "BATCH",
    sourceBranchId: "b1",
    unitLabel: "وحدة المخزون",
    comparable: true,
    qualityReason: null,
    orderable: false,
    orderabilityReason: null,
    ageDays: 9,
    isStale: false,
    ...over,
  };
}

function line(over: Partial<NeedLine> = {}, options: SupplierPriceOption[] = [option()]): NeedLine {
  return {
    drugId: "d1",
    globalDrugId: "g1",
    barcode: "111",
    tradeName: "دواء",
    scientificName: null,
    currentStock: 0,
    orderability: "GLOBAL",
    orderabilityReason: null,
    quantity: 1,
    comparison: {
      cheapest: options.find((o) => o.comparable) ?? null,
      cheapestOrderable: options.find((o) => o.comparable && o.orderable) ?? null,
      options,
      hasPrice: options.some((o) => o.comparable),
    },
    selectedSupplierId: null,
    manuallyChosen: false,
    chosenPriceAtSelection: null,
    manualWarehouseId: null,
    manualWarehouseName: null,
    ...over,
  };
}

describe("selectedOption", () => {
  it("اختيار مذخر لطلب تسعير يبقى مقدماً على السعر التلقائي", () => {
    expect(selectedOption(line({ manualWarehouseId: "manual-warehouse" }))).toBeNull();
  });
  it("بلا اختيار يدوي يعيد الأرخص", () => {
    const opts = [option({ supplierId: "a", price: 1200 }), option({ supplierId: "b", price: 900 })];
    const l = line({}, opts);
    l.comparison!.cheapest = opts[1];
    expect(selectedOption(l)?.supplierId).toBe("b");
  });

  it("الاختيار اليدوي يفوز على الأرخص", () => {
    const opts = [option({ supplierId: "a", price: 1200 }), option({ supplierId: "b", price: 900 })];
    const l = line({ selectedSupplierId: "a" }, opts);
    l.comparison!.cheapest = opts[1];
    expect(selectedOption(l)?.supplierId).toBe("a");
  });

  it("اختيار لمورد اختفى من النتائج لا يسقط على الأرخص بصمت", () => {
    // الأمان هنا: إرجاع null يجعل السطر «بلا مورد» ظاهراً، بدل استبدال صامت
    // بمورد لم يخترْه المستخدم (§79).
    const l = line({ selectedSupplierId: "ghost" });
    expect(selectedOption(l)).toBeNull();
  });
});

describe("priceDrift — §79: تغيّر السعر يُعرض ولا يُبتلع", () => {
  it("اختيار يدوي وتغيّر السعر → يُبلَّغ بالقيمتين", () => {
    const l = line({ selectedSupplierId: "sup-a", manuallyChosen: true, chosenPriceAtSelection: 900 });
    expect(priceDrift(l)).toEqual({ from: 900, to: 1000 });
  });

  it("السعر نفسه → لا تنبيه", () => {
    const l = line({ selectedSupplierId: "sup-a", manuallyChosen: true, chosenPriceAtSelection: 1000 });
    expect(priceDrift(l)).toBeNull();
  });

  it("اختيار تلقائي (غير يدوي) لا يُنتج تنبيهاً", () => {
    const l = line({ selectedSupplierId: "sup-a", manuallyChosen: false, chosenPriceAtSelection: 900 });
    expect(priceDrift(l)).toBeNull();
  });

  it("بلا لقطة سعر لا يُخترَع تنبيه", () => {
    const l = line({ selectedSupplierId: "sup-a", manuallyChosen: true, chosenPriceAtSelection: null });
    expect(priceDrift(l)).toBeNull();
  });

  it("خيار صار بلا سعر مؤهل لا يُقارَن برقم قديم", () => {
    const l = line(
      { selectedSupplierId: "sup-a", manuallyChosen: true, chosenPriceAtSelection: 900 },
      [option({ price: null, comparable: false })]
    );
    expect(priceDrift(l)).toBeNull();
  });
});
