import { describe, it, expect } from "vitest";
import {
  applyOrderTarget,
  classifyNeedLines,
  currentTargetValue,
  encodeOrderTarget,
  groupBlockedBySupplier,
  parseOrderTarget,
  splitWarehousesByRelation,
  warehousesNeedingDuplicateConfirm,
  UNASSIGNED_SUPPLIER_LABEL,
} from "./need-line-routing";
import { selectedOption, type ActiveWarehouse, type NeedLine, type OrgSupplier, type SupplierPriceOption } from "./types";

function option(over: Partial<SupplierPriceOption> = {}): SupplierPriceOption {
  return {
    supplierId: "sup-a",
    supplierName: "اكليل الجبل",
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
    orderabilityReason: "غير مربوط",
    ageDays: 9,
    isStale: false,
    ...over,
  };
}

function line(over: Partial<NeedLine> = {}, options: SupplierPriceOption[] = []): NeedLine {
  return {
    drugId: "d1",
    globalDrugId: "g1",
    barcode: "111",
    tradeName: "دواء",
    scientificName: null,
    currentStock: 0,
    orderability: "GLOBAL",
    orderabilityReason: null,
    quantity: 5,
    comparison: { cheapest: options[0] ?? null, cheapestOrderable: options.find((o) => o.orderable) ?? null, options, hasPrice: options.length > 0 },
    selectedSupplierId: null,
    manuallyChosen: false,
    chosenPriceAtSelection: null,
    manualWarehouseId: null,
    manualWarehouseName: null,
    ...over,
  };
}

const warehouses: ActiveWarehouse[] = [
  { id: "wh-1", name: "نسيم البحر", linkedSupplier: null, isRelated: false, possibleDuplicates: [] },
];
const suppliers: OrgSupplier[] = [
  { id: "sup-a", name: "اكليل الجبل", phone: null, warehouseId: null, warehouseName: null },
  { id: "sup-linked", name: "مذخر على المنصة: X", phone: null, warehouseId: "wh-x", warehouseName: "X" },
];

describe("parseOrderTarget / encodeOrderTarget", () => {
  it("ذهاب وإياب", () => {
    expect(parseOrderTarget(encodeOrderTarget({ kind: "warehouse", id: "wh-1" }))).toEqual({ kind: "warehouse", id: "wh-1" });
    expect(parseOrderTarget(encodeOrderTarget({ kind: "supplier", id: "s:1" }))).toEqual({ kind: "supplier", id: "s:1" });
  });

  it("قيمة فارغة أو بلا بادئة معروفة ⇒ null — لا تُفسَّر كمذخر", () => {
    expect(parseOrderTarget("")).toBeNull();
    expect(parseOrderTarget("wh-1")).toBeNull();
    expect(parseOrderTarget("x:wh-1")).toBeNull();
    expect(parseOrderTarget("wh:")).toBeNull();
  });
});

describe("applyOrderTarget", () => {
  it("اختيار مذخر يضبط manualWarehouseId ويمسح المورد", () => {
    const l = applyOrderTarget(line({ manualSupplierId: "sup-a", manualSupplierName: "اكليل الجبل" }), "wh:wh-1", warehouses, suppliers);
    expect(l.manualWarehouseId).toBe("wh-1");
    expect(l.manualSupplierId).toBeNull();
    expect(currentTargetValue(l)).toBe("wh:wh-1");
  });

  it("اختيار مورد يضبط manualSupplierId ولا يلمس warehouseId أبداً", () => {
    const l = applyOrderTarget(line({ manualWarehouseId: "wh-1", manualWarehouseName: "نسيم البحر" }), "sup:sup-a", warehouses, suppliers);
    expect(l.manualSupplierId).toBe("sup-a");
    expect(l.manualWarehouseId).toBeNull();
  });

  it("معرّف مورد متنكّر كمذخر لا يُقبل", () => {
    const l = applyOrderTarget(line(), "wh:sup-a", warehouses, suppliers);
    expect(l.manualWarehouseId).toBeNull();
    expect(l.manualSupplierId).toBeNull();
  });

  it("مورد مربوط بمذخر لا يُختار للطلب اليدوي", () => {
    const l = applyOrderTarget(line(), "sup:sup-linked", warehouses, suppliers);
    expect(l.manualSupplierId).toBeNull();
  });

  it("صنف بلا مقابل عالمي لا يُرسل لمذخر لكنه يقبل مورداً يدوياً", () => {
    expect(applyOrderTarget(line({ globalDrugId: null }), "wh:wh-1", warehouses, suppliers).manualWarehouseId).toBeNull();
    expect(applyOrderTarget(line({ globalDrugId: null }), "sup:sup-a", warehouses, suppliers).manualSupplierId).toBe("sup-a");
  });

  it("إلغاء الاختيار يمسح الاثنين", () => {
    const l = applyOrderTarget(line({ manualSupplierId: "sup-a" }), "", warehouses, suppliers);
    expect(currentTargetValue(l)).toBe("");
  });
});

describe("classifyNeedLines", () => {
  it("المورد اليدوي يذهب للقائمة اليدوية ولا يدخل أي طلب إلكتروني", () => {
    const { sendable, blocked } = classifyNeedLines([line({ manualSupplierId: "sup-a", manualSupplierName: "اكليل الجبل" })]);
    expect(sendable).toEqual([]);
    expect(blocked[0].manualSupplierName).toBe("اكليل الجبل");
  });

  it("اختيار مورد يدوي يُخفي الأرخص من عمود السعر", () => {
    const l = line({ manualSupplierId: "sup-a" }, [option()]);
    expect(selectedOption(l)).toBeNull();
  });

  it("مذخر يدوي ⇒ طلب تسعير إلكتروني بلا سعر", () => {
    const { sendable } = classifyNeedLines([line({ manualWarehouseId: "wh-1", manualWarehouseName: "نسيم البحر" })]);
    expect(sendable).toMatchObject([{ warehouseId: "wh-1", price: null }]);
  });

  it("خيار مربوط قابل للإرسال ⇒ مجموعة مذخره", () => {
    const opt = option({ orderable: true, warehouseId: "wh-2", warehouseName: "مذخر مربوط", orderabilityReason: null });
    const { sendable } = classifyNeedLines([line({}, [opt])]);
    expect(sendable).toMatchObject([{ warehouseId: "wh-2", price: 1000 }]);
  });

  it("سعر من مورد غير مربوط ⇒ القائمة اليدوية باسم ذلك المورد", () => {
    const { blocked } = classifyNeedLines([line({}, [option()])]);
    expect(blocked[0].manualSupplierName).toBe("اكليل الجبل");
  });

  it("بلا سعر وبلا اختيار ⇒ بلا مورد محدد", () => {
    const { blocked } = classifyNeedLines([line()]);
    expect(blocked[0].manualSupplierName).toBeNull();
    expect(blocked[0].reason).toContain("لم تختر");
  });
});

describe("groupBlockedBySupplier", () => {
  it("يجمع حسب المورد بترتيب الظهور و«بلا مورد» آخراً", () => {
    const { blocked } = classifyNeedLines([
      line({ drugId: "a" }),
      line({ drugId: "b", manualSupplierId: "s2", manualSupplierName: "الليل الازلي" }),
      line({ drugId: "c", manualSupplierId: "s1", manualSupplierName: "اكليل الجبل" }),
      line({ drugId: "d", manualSupplierId: "s2", manualSupplierName: "الليل الازلي" }),
    ]);
    const groups = groupBlockedBySupplier(blocked);
    expect(groups.map((g) => g.supplierName)).toEqual(["الليل الازلي", "اكليل الجبل", UNASSIGNED_SUPPLIER_LABEL]);
    expect(groups[0].items.map((b) => b.line.drugId)).toEqual(["b", "d"]);
  });
});

describe("splitWarehousesByRelation", () => {
  it("المذاخر ذات العلاقة أو المورد المربوط أولاً", () => {
    const res = splitWarehousesByRelation([
      { id: "1", name: "ب", isRelated: false },
      { id: "2", name: "أ", isRelated: true },
      { id: "3", name: "ج", linkedSupplier: { id: "s", name: "س" } },
    ]);
    expect(res.related.map((w) => w.id).sort()).toEqual(["2", "3"]);
    expect(res.others.map((w) => w.id)).toEqual(["1"]);
  });
});

describe("warehousesNeedingDuplicateConfirm", () => {
  it("فقط مذخر بلا مورد مربوط وله مشابهون", () => {
    const whs: ActiveWarehouse[] = [
      { id: "dup", name: "أ", linkedSupplier: null, possibleDuplicates: [{ supplierId: "s", supplierName: "س", reason: "NAME" }] },
      { id: "linked", name: "ب", linkedSupplier: { id: "s", name: "س" }, possibleDuplicates: [{ supplierId: "s", supplierName: "س", reason: "NAME" }] },
      { id: "clean", name: "ج", linkedSupplier: null, possibleDuplicates: [] },
    ];
    expect(warehousesNeedingDuplicateConfirm(["dup", "linked", "clean", "dup", "unknown"], whs)).toEqual(["dup"]);
  });
});
