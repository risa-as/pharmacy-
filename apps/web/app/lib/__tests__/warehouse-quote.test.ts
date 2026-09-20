import { describe, it, expect } from "vitest";
import {
  buildQuoteDecision,
  shouldAutoApprove,
  validateQuoteBatchInfo,
  type QuoteItemContext,
  type QuoteSummary,
} from "../warehouse-quote";

const ctx: QuoteItemContext[] = [
  { itemId: "a", quantity: 10, unitPrice: 1000 },
  { itemId: "b", quantity: 5, unitPrice: 2000 },
  { itemId: "c", quantity: 3, unitPrice: 500 },
];

describe("buildQuoteDecision — مراجعة المذخر للطلب", () => {
  it("المسار السعيد: كل الأصناف متوفرة بنفس الأسعار", () => {
    const d = buildQuoteDecision(
      [
        { itemId: "a", status: "AVAILABLE", quotedPrice: 1000 },
        { itemId: "b", status: "AVAILABLE", quotedPrice: 2000 },
        { itemId: "c", status: "AVAILABLE", quotedPrice: 500 },
      ],
      ctx
    );
    expect(d.ok).toBe(true);
    expect(d.total).toBe(10 * 1000 + 5 * 2000 + 3 * 500);
    expect(d.summary.available).toBe(3);
    expect(d.summary.changedPrices).toBe(0);
  });

  it("تغيير السعر يُحسب ضمن changedPrices ويؤثر على الإجمالي", () => {
    const d = buildQuoteDecision(
      [
        { itemId: "a", status: "AVAILABLE", quotedPrice: 1200 },
        { itemId: "b", status: "AVAILABLE", quotedPrice: 2000 },
        { itemId: "c", status: "AVAILABLE", quotedPrice: 500 },
      ],
      ctx
    );
    expect(d.ok).toBe(true);
    expect(d.summary.changedPrices).toBe(1);
    expect(d.total).toBe(1200 * 10 + 2000 * 5 + 500 * 3);
  });

  it("الجزئي: سعر × الكمية الجزئية فقط، وشرط 0 < q < المطلوبة", () => {
    const d = buildQuoteDecision(
      [
        { itemId: "a", status: "PARTIAL", quotedPrice: 1000, quotedQuantity: 4 },
        { itemId: "b", status: "AVAILABLE", quotedPrice: 2000 },
        { itemId: "c", status: "AVAILABLE", quotedPrice: 500 },
      ],
      ctx
    );
    expect(d.ok).toBe(true);
    expect(d.lineTotals["a"]).toBe(4000);
    expect(d.summary.partial).toBe(1);
  });

  it("الجزئي بكمية تساوي أو تزيد المطلوبة → مرفوض", () => {
    const d1 = buildQuoteDecision(
      [{ itemId: "a", status: "PARTIAL", quotedPrice: 1000, quotedQuantity: 10 }],
      ctx
    );
    expect(d1.ok).toBe(false);
    const d2 = buildQuoteDecision(
      [{ itemId: "a", status: "PARTIAL", quotedPrice: 1000, quotedQuantity: 11 }],
      ctx
    );
    expect(d2.ok).toBe(false);
    const d3 = buildQuoteDecision(
      [{ itemId: "a", status: "PARTIAL", quotedPrice: 1000, quotedQuantity: 0 }],
      ctx
    );
    expect(d3.ok).toBe(false);
  });

  it("النافد: إجمالي صفر ولا يتطلب سعراً", () => {
    const d = buildQuoteDecision(
      [
        { itemId: "a", status: "OUT_OF_STOCK" },
        { itemId: "b", status: "AVAILABLE", quotedPrice: 2000 },
        { itemId: "c", status: "AVAILABLE", quotedPrice: 500 },
      ],
      ctx
    );
    expect(d.ok).toBe(true);
    expect(d.lineTotals["a"]).toBe(0);
    expect(d.summary.outOfStock).toBe(1);
  });

  it("سعر صفر أو سالب أو NaN للمتوفر → مرفوض برسالة عربية", () => {
    for (const bad of [0, -5, Number.NaN, undefined, null]) {
      const d = buildQuoteDecision(
        [{ itemId: "a", status: "AVAILABLE", quotedPrice: bad as any }],
        ctx
      );
      expect(d.ok).toBe(false);
      expect(d.errors.join(" ")).toContain("سعراً موجباً");
    }
  });

  it("صنف ناقص الحكم → مرفوض (لا تصمت عن أصناف)", () => {
    const d = buildQuoteDecision(
      [
        { itemId: "a", status: "AVAILABLE", quotedPrice: 1000 },
        { itemId: "b", status: "AVAILABLE", quotedPrice: 2000 },
      ],
      ctx
    );
    expect(d.ok).toBe(false);
    expect(d.errors.join(" ")).toContain("لم يُقيَّم الصنف c");
  });

  it("صنف لا ينتمي للطلب → مرفوض", () => {
    const d = buildQuoteDecision(
      [
        { itemId: "a", status: "AVAILABLE", quotedPrice: 1000 },
        { itemId: "b", status: "AVAILABLE", quotedPrice: 2000 },
        { itemId: "c", status: "AVAILABLE", quotedPrice: 500 },
        { itemId: "x", status: "AVAILABLE", quotedPrice: 1 },
      ],
      ctx
    );
    expect(d.ok).toBe(false);
    expect(d.errors.join(" ")).toContain("لا ينتمي لهذا الطلب");
  });

  it("تكرار نفس الصنف → مرفوض", () => {
    const d = buildQuoteDecision(
      [
        { itemId: "a", status: "AVAILABLE", quotedPrice: 1000 },
        { itemId: "a", status: "AVAILABLE", quotedPrice: 1000 },
        { itemId: "b", status: "AVAILABLE", quotedPrice: 2000 },
        { itemId: "c", status: "AVAILABLE", quotedPrice: 500 },
      ],
      ctx
    );
    expect(d.ok).toBe(false);
    expect(d.errors.join(" ")).toContain("أكثر من مرة");
  });
});

// قرار صاحب النظام 2026-09: عند تطابق عرض المذخر تماماً مع طلب الصيدلية
// (بلا جزئي/نافد/تغيّر سعر، وكل الأصناف مُقيَّمة) يُعتمَد الطلب آلياً — انظر
// app/lib/warehouse-order-approval.ts وapp/api/warehouse-portal/orders/[id]/quote/route.ts.
describe("shouldAutoApprove — شرط الاعتماد الآلي", () => {
  const allClear: QuoteSummary = { available: 3, partial: 0, outOfStock: 0, changedPrices: 0 };

  it("المسار السعيد: كل الأصناف متوفرة، بلا جزئي/نافد/تغيّر سعر → true", () => {
    expect(shouldAutoApprove(allClear, 3)).toBe(true);
  });

  it("وجود سطر جزئي واحد → false (بقية الشروط مثالية)", () => {
    const summary: QuoteSummary = { ...allClear, available: 2, partial: 1 };
    expect(shouldAutoApprove(summary, 3)).toBe(false);
  });

  it("وجود سطر نافد واحد → false (بقية الشروط مثالية)", () => {
    const summary: QuoteSummary = { ...allClear, available: 2, outOfStock: 1 };
    expect(shouldAutoApprove(summary, 3)).toBe(false);
  });

  it("تغيّر سعر سطر واحد → false (بقية الشروط مثالية)", () => {
    const summary: QuoteSummary = { ...allClear, changedPrices: 1 };
    expect(shouldAutoApprove(summary, 3)).toBe(false);
  });

  it("available أقل من judgedItemCount (سطر لم يُحكَم عليه فعلياً ضمن المتوفر) → false", () => {
    const summary: QuoteSummary = { ...allClear, available: 2 };
    expect(shouldAutoApprove(summary, 3)).toBe(false);
  });

  it("طلب بلا أصناف (judgedItemCount = 0) → false دائماً حتى لو بدا summary مثالياً", () => {
    const summary: QuoteSummary = { available: 0, partial: 0, outOfStock: 0, changedPrices: 0 };
    expect(shouldAutoApprove(summary, 0)).toBe(false);
  });
});

// ميزة نقل الدفعة/الانتهاء عند التسعير: المذخر يعلن رقم الدفعة وتاريخ الانتهاء
// وقت التسعير — كلاهما اختياري تماماً، ولا يدخلان buildQuoteDecision/effectiveLine
// إطلاقاً (انظر تعليق QuoteItemInput.batchNumber في warehouse-quote.ts).
describe("validateQuoteBatchInfo — رقم الدفعة/تاريخ الانتهاء المُعلَنان عند التسعير", () => {
  const future = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  };
  const past = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  };

  it("كلاهما غائب → ok ببطلان null/null (لا حقل إلزامي)", () => {
    const r = validateQuoteBatchInfo({});
    expect(r).toEqual({ ok: true, batchNumber: null, expiryDate: null });
  });

  it("batchNumber فارغ أو بياض فقط → null، لا خطأ", () => {
    expect(validateQuoteBatchInfo({ batchNumber: "" }).ok).toBe(true);
    expect((validateQuoteBatchInfo({ batchNumber: "" }) as any).batchNumber).toBeNull();
    expect((validateQuoteBatchInfo({ batchNumber: "   " }) as any).batchNumber).toBeNull();
  });

  it("batchNumber محاط بفراغات → يُقصّ", () => {
    const r = validateQuoteBatchInfo({ batchNumber: "  LOT-9  " });
    expect(r).toEqual({ ok: true, batchNumber: "LOT-9", expiryDate: null });
  });

  it("batchNumber أطول من الحدّ الأقصى → يُقصّ عند 100 حرفاً بدل الرفض", () => {
    const long = "L".repeat(150);
    const r = validateQuoteBatchInfo({ batchNumber: long }) as any;
    expect(r.ok).toBe(true);
    expect(r.batchNumber).toHaveLength(100);
    expect(r.batchNumber).toBe("L".repeat(100));
  });

  it("expiryDate غائب أو فارغ → null بلا رفض", () => {
    expect(validateQuoteBatchInfo({ expiryDate: undefined })).toEqual({ ok: true, batchNumber: null, expiryDate: null });
    expect(validateQuoteBatchInfo({ expiryDate: null })).toEqual({ ok: true, batchNumber: null, expiryDate: null });
    expect(validateQuoteBatchInfo({ expiryDate: "" })).toEqual({ ok: true, batchNumber: null, expiryDate: null });
  });

  it("expiryDate صالح في المستقبل → يُقبَل ويُحوَّل إلى Date", () => {
    const f = future();
    const r = validateQuoteBatchInfo({ expiryDate: f.toISOString() }) as any;
    expect(r.ok).toBe(true);
    expect(r.expiryDate).toBeInstanceOf(Date);
    expect(r.expiryDate.getTime()).toBe(new Date(f.toISOString()).getTime());
  });

  it("expiryDate في الماضي → مرفوض برسالة عربية", () => {
    const r = validateQuoteBatchInfo({ expiryDate: past().toISOString() });
    expect(r.ok).toBe(false);
    expect((r as any).error).toContain("المستقبل");
  });

  it("expiryDate الآن بالضبط → مرفوض (> لا >=، نفس شرط purchase-receipt.ts)", () => {
    const now = new Date();
    const r = validateQuoteBatchInfo({ expiryDate: now });
    expect(r.ok).toBe(false);
  });

  it("expiryDate نص غير قابل للتحليل → مرفوض", () => {
    const r = validateQuoteBatchInfo({ expiryDate: "ليس تاريخاً" });
    expect(r.ok).toBe(false);
  });

  it("كلاهما صالحان معاً → يُقبَلان معاً", () => {
    const f = future();
    const r = validateQuoteBatchInfo({ batchNumber: "BAT-1", expiryDate: f }) as any;
    expect(r.ok).toBe(true);
    expect(r.batchNumber).toBe("BAT-1");
    expect(r.expiryDate.getTime()).toBe(f.getTime());
  });
});
