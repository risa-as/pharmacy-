import { describe, it, expect } from "vitest";
import {
  resolveTierPrice,
  applyBulkPriceChange,
  catalogMarginPercent,
  validateCostPrice,
  validateMinStock,
  validateBonusThreshold,
  validateBonusQuantity,
} from "../warehouse-pricing";

describe("resolveTierPrice — سعر الصنف حسب شريحة العميل", () => {
  it("بلا شريحة للعميل → LIST", () => {
    const r = resolveTierPrice({ listPrice: 1000 });
    expect(r).toEqual({ price: 1000, source: "LIST" });
  });

  it("شريحة null صراحة → LIST", () => {
    const r = resolveTierPrice({ listPrice: 1000, tier: null });
    expect(r).toEqual({ price: 1000, source: "LIST" });
  });

  it("شريحة فارغة/بيضاء فقط → LIST", () => {
    const r = resolveTierPrice({ listPrice: 1000, tier: "   " });
    expect(r).toEqual({ price: 1000, source: "LIST" });
  });

  it("شريحة موجودة بسعر مطابق → TIER", () => {
    const r = resolveTierPrice({
      listPrice: 1000,
      tier: "GOLD",
      tierPrices: [{ tier: "GOLD", price: 850 }],
    });
    expect(r).toEqual({ price: 850, source: "TIER" });
  });

  it("شريحة موجودة لكن بلا سعر مطابق لها → LIST", () => {
    const r = resolveTierPrice({
      listPrice: 1000,
      tier: "SILVER",
      tierPrices: [{ tier: "GOLD", price: 850 }],
    });
    expect(r).toEqual({ price: 1000, source: "LIST" });
  });

  it("سعر شريحة صفر → LIST (يُعامَل كخطأ إدخال، لا هدية مجانية)", () => {
    const r = resolveTierPrice({
      listPrice: 1000,
      tier: "GOLD",
      tierPrices: [{ tier: "GOLD", price: 0 }],
    });
    expect(r).toEqual({ price: 1000, source: "LIST" });
  });

  it("سعر شريحة سالب → LIST", () => {
    const r = resolveTierPrice({
      listPrice: 1000,
      tier: "GOLD",
      tierPrices: [{ tier: "GOLD", price: -50 }],
    });
    expect(r).toEqual({ price: 1000, source: "LIST" });
  });

  it("سعر شريحة NaN/Infinity → LIST", () => {
    expect(
      resolveTierPrice({ listPrice: 1000, tier: "GOLD", tierPrices: [{ tier: "GOLD", price: NaN }] })
    ).toEqual({ price: 1000, source: "LIST" });
    expect(
      resolveTierPrice({ listPrice: 1000, tier: "GOLD", tierPrices: [{ tier: "GOLD", price: Infinity }] })
    ).toEqual({ price: 1000, source: "LIST" });
  });

  it("المطابقة غير حسّاسة لحالة الأحرف أو المسافات الزائدة", () => {
    const r = resolveTierPrice({
      listPrice: 1000,
      tier: "  gold ",
      tierPrices: [{ tier: "GOLD", price: 850 }],
    });
    expect(r).toEqual({ price: 850, source: "TIER" });
  });

  it("listPrice غير صالح يُعامَل كصفر بدل NaN متسرّب", () => {
    const r = resolveTierPrice({ listPrice: NaN as any });
    expect(r).toEqual({ price: 0, source: "LIST" });
  });
});

describe("applyBulkPriceChange — تعديل سعر جماعي", () => {
  it("+10% صحيح", () => {
    const r = applyBulkPriceChange({ currentPrice: 1000, mode: "PERCENT", value: 10 });
    expect(r).toEqual({ ok: true, newPrice: 1100 });
  });

  it("-10% صحيح", () => {
    const r = applyBulkPriceChange({ currentPrice: 1000, mode: "PERCENT", value: -10 });
    expect(r).toEqual({ ok: true, newPrice: 900 });
  });

  it("مبلغ ثابت موجب/سالب", () => {
    expect(applyBulkPriceChange({ currentPrice: 1000, mode: "AMOUNT", value: 250 })).toEqual({
      ok: true,
      newPrice: 1250,
    });
    expect(applyBulkPriceChange({ currentPrice: 1000, mode: "AMOUNT", value: -250 })).toEqual({
      ok: true,
      newPrice: 750,
    });
  });

  it("نتيجة <= 0 مرفوضة برسالة عربية واضحة", () => {
    const r = applyBulkPriceChange({ currentPrice: 100, mode: "AMOUNT", value: -150 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/سعر/);
  });

  it("نتيجة = 0 بالضبط مرفوضة (ليست <= 0 مسموحاً باستثناء)", () => {
    const r = applyBulkPriceChange({ currentPrice: 100, mode: "AMOUNT", value: -100 });
    expect(r.ok).toBe(false);
  });

  it("-100% مرفوضة دائماً بصرف النظر عن السعر الحالي", () => {
    const r = applyBulkPriceChange({ currentPrice: 1000, mode: "PERCENT", value: -100 });
    expect(r.ok).toBe(false);
  });

  it("أقل من -100% مرفوضة أيضاً", () => {
    const r = applyBulkPriceChange({ currentPrice: 1000, mode: "PERCENT", value: -150 });
    expect(r.ok).toBe(false);
  });

  it("التقريب لأقرب دينار صحيح افتراضياً", () => {
    const r = applyBulkPriceChange({ currentPrice: 999, mode: "PERCENT", value: 10 });
    // 999 * 1.10 = 1098.9 → يُقرَّب إلى 1099
    expect(r).toEqual({ ok: true, newPrice: 1099 });
  });

  it("الترتيب الحاسم: التقريب أولاً ثم الرفض — نتيجة تقترب من الصفر بعد التقريب تُرفَض", () => {
    // 0.4 * (1 - 0.10) = 0.36 → موجبة قبل التقريب، لكن تُقرَّب لأقرب دينار = 0.
    // يجب أن تُرفَض هذه الحالة (لا تمر كسعر 0.36 "صالح").
    const r = applyBulkPriceChange({ currentPrice: 0.4, mode: "PERCENT", value: -10 });
    expect(r.ok).toBe(false);
  });

  it("roundTo مخصص", () => {
    const r = applyBulkPriceChange({ currentPrice: 1000, mode: "AMOUNT", value: 37, roundTo: 25 });
    // 1037 → أقرب مضاعف لـ25 = 1025
    expect(r).toEqual({ ok: true, newPrice: 1025 });
  });

  it("roundTo <= 0 يعني بلا تقريب (لا قسمة على صفر)", () => {
    const r = applyBulkPriceChange({ currentPrice: 1000, mode: "AMOUNT", value: 37.5, roundTo: 0 });
    expect(r).toEqual({ ok: true, newPrice: 1037.5 });
  });

  it("value غير منتهٍ مرفوض", () => {
    expect(applyBulkPriceChange({ currentPrice: 1000, mode: "PERCENT", value: NaN }).ok).toBe(false);
    expect(applyBulkPriceChange({ currentPrice: 1000, mode: "PERCENT", value: Infinity }).ok).toBe(false);
  });
});

describe("catalogMarginPercent — هامش الربح لصنف كتالوج واحد", () => {
  it("costPrice غائب → null (مجهول)، وليس 100%", () => {
    expect(catalogMarginPercent({ price: 1000, costPrice: undefined })).toBeNull();
  });

  it("costPrice صفر → null (مجهول)، وليس 100%", () => {
    expect(catalogMarginPercent({ price: 1000, costPrice: 0 })).toBeNull();
  });

  it("costPrice سالب → null", () => {
    expect(catalogMarginPercent({ price: 1000, costPrice: -50 })).toBeNull();
  });

  it("حالة عادية: سعر 1000 وتكلفة 600 → 40", () => {
    expect(catalogMarginPercent({ price: 1000, costPrice: 600 })).toBe(40);
  });

  it("البيع بالتكلفة تماماً → هامش صفر معروض صراحةً، لا مجهول", () => {
    expect(catalogMarginPercent({ price: 1000, costPrice: 1000 })).toBe(0);
  });

  it("البيع دون التكلفة → هامش سالب معروض بعلامته الصحيحة، لا مخفياً", () => {
    expect(catalogMarginPercent({ price: 500, costPrice: 600 })).toBe(-20);
  });

  it("costPrice NaN/Infinity → null", () => {
    expect(catalogMarginPercent({ price: 1000, costPrice: NaN })).toBeNull();
    expect(catalogMarginPercent({ price: 1000, costPrice: Infinity })).toBeNull();
  });

  it("price <= 0 → null (تفادي قسمة على صفر)", () => {
    expect(catalogMarginPercent({ price: 0, costPrice: 600 })).toBeNull();
  });
});

describe("validateCostPrice — تحقق كلفة الشراء", () => {
  it("صفر مقبول (تكلفة غير مُدخَلة بعد، لا خطأ)", () => {
    expect(validateCostPrice(0)).toEqual({ ok: true, value: 0 });
  });

  it("رقم موجب مقبول", () => {
    expect(validateCostPrice(600)).toEqual({ ok: true, value: 600 });
  });

  it("سالب مرفوض", () => {
    const r = validateCostPrice(-1);
    expect(r.ok).toBe(false);
  });

  it("NaN/Infinity مرفوض", () => {
    expect(validateCostPrice(NaN).ok).toBe(false);
    expect(validateCostPrice(Infinity).ok).toBe(false);
  });

  it("نص أو غير رقم مرفوض", () => {
    expect(validateCostPrice("600" as any).ok).toBe(false);
  });
});

describe("validateMinStock — تحقق حد إعادة الطلب", () => {
  it("صفر مقبول (بلا تنبيه — قيمة صريحة صالحة)", () => {
    expect(validateMinStock(0)).toEqual({ ok: true, value: 0 });
  });

  it("عدد صحيح موجب مقبول", () => {
    expect(validateMinStock(20)).toEqual({ ok: true, value: 20 });
  });

  it("كسري مرفوض", () => {
    expect(validateMinStock(5.5).ok).toBe(false);
  });

  it("سالب مرفوض", () => {
    expect(validateMinStock(-1).ok).toBe(false);
  });

  it("NaN/Infinity مرفوض", () => {
    expect(validateMinStock(NaN).ok).toBe(false);
    expect(validateMinStock(Infinity).ok).toBe(false);
  });
});

describe("validateBonusThreshold / validateBonusQuantity — قاعدة بونص الكتالوج", () => {
  it("صفر مقبول لكليهما (بلا قاعدة بونص — قيمة صريحة صالحة)", () => {
    expect(validateBonusThreshold(0)).toEqual({ ok: true, value: 0 });
    expect(validateBonusQuantity(0)).toEqual({ ok: true, value: 0 });
  });

  it("عدد صحيح موجب مقبول لكليهما", () => {
    expect(validateBonusThreshold(10)).toEqual({ ok: true, value: 10 });
    expect(validateBonusQuantity(1)).toEqual({ ok: true, value: 1 });
  });

  it("كسري أو سالب أو NaN/Infinity مرفوض لكليهما", () => {
    expect(validateBonusThreshold(5.5).ok).toBe(false);
    expect(validateBonusThreshold(-1).ok).toBe(false);
    expect(validateBonusThreshold(NaN).ok).toBe(false);
    expect(validateBonusQuantity(5.5).ok).toBe(false);
    expect(validateBonusQuantity(-1).ok).toBe(false);
    expect(validateBonusQuantity(Infinity).ok).toBe(false);
  });
});
