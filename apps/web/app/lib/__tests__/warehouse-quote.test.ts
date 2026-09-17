import { describe, it, expect } from "vitest";
import { buildQuoteDecision, type QuoteItemContext } from "../warehouse-quote";

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
