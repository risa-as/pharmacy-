import { describe, it, expect } from "vitest";
import {
  compareDrugPrices,
  buildSupplierOptions,
  latestEligibleForSupplier,
  estimateTotal,
  ageInDays,
  isValidPrice,
  INVENTORY_UNIT_LABEL,
  STALE_PRICE_DAYS,
  type RawPriceRecord,
} from "../supplier-price-comparison";

const NOW = new Date("2026-09-10T12:00:00.000Z");

let seq = 0;
function rec(over: Partial<RawPriceRecord> = {}): RawPriceRecord {
  seq += 1;
  return {
    unitVerified: true,
    supplierId: "sup-a",
    supplierName: "التفاح الأخضر",
    warehouseId: null,
    warehouseName: null,
    warehouseIsActive: true,
    price: 1000,
    recordedAt: "2026-09-01T00:00:00.000Z",
    source: "BATCH",
    sourceBranchId: "branch-1",
    recordId: `rec-${seq}`,
    ...over,
  };
}

const compare = (records: RawPriceRecord[]) => compareDrugPrices({ records, now: NOW });

// ── §4.1 / §356: التعريف المحوري ────────────────────────────────────────────
describe("«الأرخص» = أرخص آخرِ أسعار الموردين، لا أقل سعر تاريخي", () => {
  it("أ باع 800 ثم 1200، وب آخر سعره 1000 ⇒ الفائز ب بـ1000", () => {
    const res = compare([
      rec({ supplierId: "sup-a", supplierName: "أ", price: 800, recordedAt: "2026-05-01T00:00:00.000Z" }),
      rec({ supplierId: "sup-a", supplierName: "أ", price: 1200, recordedAt: "2026-08-01T00:00:00.000Z" }),
      rec({ supplierId: "sup-b", supplierName: "ب", price: 1000, recordedAt: "2026-07-01T00:00:00.000Z" }),
    ]);
    expect(res.cheapest?.supplierId).toBe("sup-b");
    expect(res.cheapest?.price).toBe(1000);
    // السعر التاريخي 800 لا يظهر كخيار إطلاقاً — آخرُ سعر أ هو 1200.
    expect(res.options.map((o) => o.price)).toEqual([1000, 1200]);
  });

  it("مورد واحد بعدة أسعار يُمثَّل بخيار واحد فقط هو الأحدث", () => {
    const res = compare([
      rec({ price: 500, recordedAt: "2026-01-01T00:00:00.000Z" }),
      rec({ price: 900, recordedAt: "2026-06-01T00:00:00.000Z" }),
    ]);
    expect(res.options).toHaveLength(1);
    expect(res.options[0].price).toBe(900);
  });
});

// ── §357: لا دمج بالاسم ──────────────────────────────────────────────────────
describe("عزل الموردين", () => {
  it("موردان بالاسم نفسه ومعرفين مختلفين لا يندمجان", () => {
    const res = compare([
      rec({ supplierId: "sup-1", supplierName: "درة الشرق", price: 700 }),
      rec({ supplierId: "sup-2", supplierName: "درة الشرق", price: 900 }),
    ]);
    expect(res.options).toHaveLength(2);
    expect(res.options.map((o) => o.supplierId)).toEqual(["sup-1", "sup-2"]);
  });
});

// ── §358 + §128: البونص والأسعار غير الصالحة ────────────────────────────────
describe("البونص والسعر غير الصالح", () => {
  it("أحدث دفعة بونص صفرية لا تجعل المورد مجانياً ولا تُصبح الأرخص", () => {
    const res = compare([
      rec({ supplierId: "sup-a", price: 1000, recordedAt: "2026-08-01T00:00:00.000Z" }),
      rec({ supplierId: "sup-a", price: 0, recordedAt: "2026-09-05T00:00:00.000Z" }),
    ]);
    expect(res.cheapest?.price).toBe(1000);
    expect(res.hasPrice).toBe(true);
    expect(res.options[0].comparable).toBe(true);
    expect(res.options[0].recordedAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("لا يتخطّى الأحدث غير الصالح بصمت لتسمية الأقدم «آخر سعر» (§132)", () => {
    // الخطر: إظهار 1000 كأنه آخر سعر مع أن أحدث سجل صفري.
    const res = compare([
      rec({ price: 1000, recordedAt: "2026-08-01T00:00:00.000Z" }),
      rec({ price: -1, recordedAt: "2026-09-05T00:00:00.000Z" }),
    ]);
    expect(res.options[0].price).toBeNull();
    expect(res.options[0].recordedAt).toBe("2026-09-05T00:00:00.000Z");
  });

  it("السعر السالب وغير المتناهي ليسا سعراً مدفوعاً", () => {
    expect(isValidPrice(-5)).toBe(false);
    expect(isValidPrice(0)).toBe(false);
    expect(isValidPrice(Number.NaN)).toBe(false);
    expect(isValidPrice(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidPrice(1)).toBe(true);
  });

  it("مورد سعره غير صالح لا يصبح اختياراً تلقائياً (§360)", () => {
    const res = compare([
      rec({ supplierId: "sup-a", price: 0 }),
      rec({ supplierId: "sup-b", price: 1500, warehouseId: "wh-1", warehouseName: "نسيم البحر" }),
    ]);
    expect(res.cheapest?.supplierId).toBe("sup-b");
  });
});

// ── §131: السجلات بلا مورد ───────────────────────────────────────────────────
describe("السجل غير المنسوب", () => {
  it("يظهر كمعلومة ولا يُنتج موردًا مختارًا", () => {
    const res = compare([rec({ supplierId: null, supplierName: null, price: 1200 })]);
    expect(res.cheapest).toBeNull();
    expect(res.options).toHaveLength(1);
    expect(res.options[0].supplierName).toBe("مورد غير مسجّل");
    expect(res.options[0].orderable).toBe(false);
    expect(res.options[0].comparable).toBe(false);
  });

  it("لا يمنع مورداً معروفاً من الفوز", () => {
    const res = compare([
      rec({ supplierId: null, supplierName: null, price: 100 }),
      rec({ supplierId: "sup-b", supplierName: "ب", price: 900 }),
    ]);
    expect(res.cheapest?.supplierId).toBe("sup-b");
  });
});

// ── §133 / §363: التعادل الزمني ──────────────────────────────────────────────
describe("تعارض اللحظة نفسها", () => {
  it("قيمتان مختلفتان بنفس اللحظة → تعارض لا حسم اعتباطي", () => {
    const t = "2026-09-01T00:00:00.000Z";
    const res = compare([
      rec({ price: 1000, recordedAt: t, recordId: "aaa" }),
      rec({ price: 1400, recordedAt: t, recordId: "zzz" }),
    ]);
    expect(res.options[0].comparable).toBe(false);
    expect(res.options[0].qualityReason).toBe("AMBIGUOUS_SAME_INSTANT");
  });

  it("نفس القيمة بنفس اللحظة ليست تعارضاً", () => {
    const t = "2026-09-01T00:00:00.000Z";
    const res = compare([
      rec({ price: 1000, recordedAt: t, recordId: "aaa" }),
      rec({ price: 1000, recordedAt: t, recordId: "zzz" }),
    ]);
    expect(res.options[0].comparable).toBe(true);
    expect(res.options[0].price).toBe(1000);
  });

  it("ترتيب UUID لا يُستعمل لإثبات أسبقية شراء", () => {
    const t = "2026-09-01T00:00:00.000Z";
    const a = compare([rec({ price: 1000, recordedAt: t, recordId: "aaa" }), rec({ price: 1400, recordedAt: t, recordId: "zzz" })]);
    const b = compare([rec({ price: 1400, recordedAt: t, recordId: "aaa" }), rec({ price: 1000, recordedAt: t, recordId: "zzz" })]);
    // أي ترتيب للمعرّفات يعطي التعارض نفسه، لا سعراً «فائزاً».
    expect(a.options[0].qualityReason).toBe("AMBIGUOUS_SAME_INSTANT");
    expect(b.options[0].qualityReason).toBe("AMBIGUOUS_SAME_INSTANT");
  });
});

// ── §78: الأرخص مقابل الأرخص القابل للإرسال ─────────────────────────────────
describe("قابلية الإرسال", () => {
  it("الأرخص غير مربوط ⇒ يُعاد أيضاً أرخص خيار قابل للإرسال، بلا استبدال صامت", () => {
    const res = compare([
      rec({ supplierId: "sup-a", supplierName: "محلي", price: 800 }),
      rec({ supplierId: "sup-b", supplierName: "مربوط", price: 1100, warehouseId: "wh-1", warehouseName: "نسيم البحر" }),
    ]);
    expect(res.cheapest?.supplierId).toBe("sup-a");
    expect(res.cheapest?.orderable).toBe(false);
    expect(res.cheapestOrderable?.supplierId).toBe("sup-b");
  });

  it("مورد غير مربوط بمذخر: سبب واضح", () => {
    const res = compare([rec({ warehouseId: null })]);
    expect(res.options[0].orderable).toBe(false);
    expect(res.options[0].orderabilityReason).toContain("غير مربوط بمذخر");
  });

  it("مذخر معطّل لا يُعد قابلاً للإرسال", () => {
    const res = compare([rec({ warehouseId: "wh-1", warehouseName: "نسيم البحر", warehouseIsActive: false })]);
    expect(res.options[0].orderable).toBe(false);
    expect(res.options[0].orderabilityReason).toContain("معطّل");
    expect(res.cheapestOrderable).toBeNull();
  });
});

// ── §89 / §139: القِدم والوحدة ───────────────────────────────────────────────
describe("عمر السعر ووحدته", () => {
  it("أقدم من 90 يوماً يوسم isStale بلا استبعاد", () => {
    const res = compare([
      rec({ supplierId: "sup-a", price: 1000, recordedAt: "2026-03-01T00:00:00.000Z" }),
      rec({ supplierId: "sup-b", price: 1100, recordedAt: "2026-09-08T00:00:00.000Z" }),
    ]);
    const stale = res.options.find((o) => o.supplierId === "sup-a")!;
    expect(stale.isStale).toBe(true);
    expect(stale.ageDays).toBeGreaterThan(STALE_PRICE_DAYS);
    // الأرخص ما زال هو القديم — القِدم تنبيه لا استبعاد.
    expect(res.cheapest?.supplierId).toBe("sup-a");
  });

  it("الوحدة تُسمّى «وحدة المخزون» ولا تدّعي شريطاً ولا باكيتاً", () => {
    const res = compare([rec()]);
    expect(res.options[0].unitLabel).toBe(INVENTORY_UNIT_LABEL);
    expect(res.options[0].unitLabel).not.toMatch(/شريط|باكيت/);
  });

  it("تاريخ مستقبلي لا يُنتج عمراً سالباً", () => {
    expect(ageInDays("2027-01-01T00:00:00.000Z", NOW)).toBe(0);
  });

  it("تاريخ غير صالح يعيد null لا NaN", () => {
    expect(ageInDays("not-a-date", NOW)).toBeNull();
  });
});

// ── §80 / §361: الغياب والمصدر ───────────────────────────────────────────────
describe("غياب السعر والمصدر", () => {
  it("لا سجلات ⇒ hasPrice=false ولا صفر يُقدَّم كسعر", () => {
    const res = compare([]);
    expect(res.hasPrice).toBe(false);
    expect(res.cheapest).toBeNull();
    expect(res.options).toEqual([]);
  });

  it("المصدر مُعلَن على كل خيار كي تسمّيه الواجهة تاريخ تسجيل لا تاريخ شراء", () => {
    const res = compare([rec({ source: "BATCH" }), rec({ supplierId: "sup-b", source: "COMPLETED_PURCHASE" })]);
    expect(res.options.map((o) => o.source).sort()).toEqual(["BATCH", "COMPLETED_PURCHASE"]);
  });

  it("دفعة استُهلكت بالكامل تبقى صالحة كتاريخ سعر (§359)", () => {
    // الكمية المتبقية ليست جزءاً من RawPriceRecord أصلاً — وهذا هو الضمان:
    // المقارنة تاريخ سعر لا توفّر مخزون (§129).
    const res = compare([rec({ price: 1000 })]);
    expect(res.hasPrice).toBe(true);
  });
});

// ── §88: استقرار الترتيب ─────────────────────────────────────────────────────
describe("استقرار الترتيب", () => {
  it("تعادل السعر يُحسم بالأحدث ثم بمعرّف ثابت", () => {
    const res = buildSupplierOptions({
      records: [
        rec({ supplierId: "sup-b", price: 1000, recordedAt: "2026-08-01T00:00:00.000Z" }),
        rec({ supplierId: "sup-a", price: 1000, recordedAt: "2026-09-01T00:00:00.000Z" }),
      ],
      now: NOW,
    });
    expect(res.map((o) => o.supplierId)).toEqual(["sup-a", "sup-b"]);
  });

  it("غير القابل للمقارنة يُزاح للنهاية ولا ينافس على الأرخص (§90)", () => {
    const res = compare([
      rec({ supplierId: "sup-a", price: 0 }),
      rec({ supplierId: "sup-b", price: 2000 }),
    ]);
    expect(res.options[0].supplierId).toBe("sup-b");
    expect(res.options[1].comparable).toBe(false);
  });

  it("نفس المدخلات بترتيب مختلف تعطي نفس الناتج", () => {
    const a = rec({ supplierId: "sup-a", price: 900 });
    const b = rec({ supplierId: "sup-b", price: 700 });
    const c = rec({ supplierId: "sup-c", price: 1300 });
    const one = compare([a, b, c]).options.map((o) => o.supplierId);
    const two = compare([c, a, b]).options.map((o) => o.supplierId);
    expect(one).toEqual(two);
  });
});

describe("latestEligibleForSupplier", () => {
  it("قائمة فارغة → null", () => {
    expect(latestEligibleForSupplier([])).toBeNull();
  });
});

// ── §82: الإجمالي التقديري ───────────────────────────────────────────────────
describe("estimateTotal", () => {
  it("يجمع المسعّرة فقط ويعدّ غير المسعّرة", () => {
    const r = estimateTotal([
      { quantity: 2, unitPrice: 1000 },
      { quantity: 3, unitPrice: null },
      { quantity: 1, unitPrice: 500 },
    ]);
    expect(r.total).toBe(2500);
    expect(r.pricedCount).toBe(2);
    expect(r.unpricedCount).toBe(1);
  });

  it("السعر صفر لا يُحتسب سعراً ولا يزيد الإجمالي", () => {
    const r = estimateTotal([{ quantity: 5, unitPrice: 0 }]);
    expect(r.total).toBe(0);
    expect(r.pricedCount).toBe(0);
    expect(r.unpricedCount).toBe(1);
  });

  it("كمية غير صالحة تُعد غير مسعّرة لا تُضرب", () => {
    const r = estimateTotal([{ quantity: 0, unitPrice: 1000 }, { quantity: -2, unitPrice: 1000 }]);
    expect(r.total).toBe(0);
    expect(r.unpricedCount).toBe(2);
  });
});


describe('unit verification and paid prices', () => {
  it('retains the cheapest paid price despite a later free bonus', () => {
    const r = compare([rec({price: 900}), rec({price: 0, recordedAt:'2026-09-09T00:00:00Z'}), rec({supplierId:'b', price:1100})]);
    expect(r.cheapest?.price).toBe(900);
  });
  it('a same-time bonus does not produce a paid-price conflict', () => {
    expect(compare([rec({price:900}),rec({price:0})]).cheapest?.price).toBe(900);
  });
  it('shows unverified observations but never recommends them', () => {
    const r = compare([rec({unitVerified:undefined,price:100}),rec({supplierId:'b',price:900})]);
    expect(r.cheapest?.supplierId).toBe('b');
    expect(r.options.find(o=>o.supplierId==='sup-a')).toMatchObject({price:100,comparable:false,qualityReason:'UNVERIFIED_UNIT'});
  });
});
