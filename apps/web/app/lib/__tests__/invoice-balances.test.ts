import { describe, it, expect } from "vitest";
import { computeInvoiceBalances, type ComputeInvoiceBalancesInput } from "../invoice-balances";

describe("computeInvoiceBalances", () => {
  it("فاتورة غير مسدَّدة (UNPAID) ضمن current: previous = current - المتبقي عليها", () => {
    const result = computeInvoiceBalances({
      current: 3_832_326,
      invoice: { total: 32_250, paidAmount: 0, status: "UNPAID" },
      sheetNetTotal: 0,
    });
    expect(result).toEqual({ previous: 3_800_076, thisOutstanding: 32_250, current: 3_832_326 });
  });

  it("مطابقة الفاتورة الحقيقية: 3,800,076 + 32,250 = 3,832,326", () => {
    const result = computeInvoiceBalances({
      current: 3_832_326,
      invoice: { total: 32_250, paidAmount: 0, status: "UNPAID" },
      sheetNetTotal: 0,
    });
    expect(result.previous + result.thisOutstanding).toBe(3_832_326);
    expect(result.previous).toBe(3_800_076);
  });

  it("فاتورة مسدَّدة جزئياً (PARTIAL): مساهمتها = المتبقي فقط، لا الإجمالي كاملاً", () => {
    const result = computeInvoiceBalances({
      current: 500_000,
      invoice: { total: 100_000, paidAmount: 40_000, status: "PARTIAL" },
      sheetNetTotal: 0,
    });
    expect(result.thisOutstanding).toBe(60_000);
    expect(result.previous).toBe(440_000);
    expect(result.previous + result.thisOutstanding).toBe(500_000);
  });

  it("فاتورة مسدَّدة بالكامل (PAID): لا تُحتسب ضمن current، previous = current بلا طرح", () => {
    const result = computeInvoiceBalances({
      current: 200_000,
      invoice: { total: 50_000, paidAmount: 50_000, status: "PAID" },
      sheetNetTotal: 0,
    });
    expect(result).toEqual({ previous: 200_000, thisOutstanding: 0, current: 200_000 });
  });

  it("فاتورة مُلغاة (CANCELLED) بمتبقٍّ كبير: لا تُطرَح من previous رغم total-paidAmount الكبير", () => {
    const result = computeInvoiceBalances({
      current: 200_000,
      invoice: { total: 900_000, paidAmount: 0, status: "CANCELLED" },
      sheetNetTotal: 0,
    });
    // الفخ الذي يحرسه هذا الاختبار: صيغة "previous = current - (total - paidAmount)"
    // الساذجة كانت ستُنتج previous سالباً هنا (200,000 - 900,000)، وهو رصيد
    // سابق سالب لا معنى له على ورقة تُسلَّم للعميل.
    expect(result).toEqual({ previous: 200_000, thisOutstanding: 0, current: 200_000 });
  });

  it("لا فاتورة بعد: previous = current كما هو، وthisOutstanding = صافي الورقة", () => {
    const result = computeInvoiceBalances({
      current: 300_000,
      invoice: null,
      sheetNetTotal: 75_000,
    });
    expect(result).toEqual({ previous: 300_000, thisOutstanding: 75_000, current: 375_000 });
  });

  it("لا فاتورة بعد وصافي ورقة صفري: كل الأرقام تبقى = current", () => {
    const result = computeInvoiceBalances({ current: 120_000, invoice: null, sheetNetTotal: 0 });
    expect(result).toEqual({ previous: 120_000, thisOutstanding: 0, current: 120_000 });
  });

  it("فاتورة مدفوعة أكثر من قيمتها (دفعة زائدة) بحالة مفتوحة دفاعياً: مساهمتها تُقصّ عند صفر لا تصير سالبة", () => {
    const result = computeInvoiceBalances({
      current: 100_000,
      invoice: { total: 50_000, paidAmount: 70_000, status: "PARTIAL" },
      sheetNetTotal: 0,
    });
    expect(result.thisOutstanding).toBe(0);
    expect(result.previous).toBe(100_000);
  });

  it("مدخلات غير صالحة (NaN/سالب/Infinity) في current تُعامَل كصفر دفاعياً", () => {
    expect(computeInvoiceBalances({ current: NaN, invoice: null, sheetNetTotal: 10 })).toEqual({
      previous: 0,
      thisOutstanding: 10,
      current: 10,
    });
    expect(computeInvoiceBalances({ current: -500, invoice: null, sheetNetTotal: 0 })).toEqual({
      previous: 0,
      thisOutstanding: 0,
      current: 0,
    });
    expect(
      computeInvoiceBalances({
        current: 1000,
        invoice: { total: NaN, paidAmount: Infinity, status: "UNPAID" },
        sheetNetTotal: 0,
      })
    ).toEqual({ previous: 1000, thisOutstanding: 0, current: 1000 });
  });

  it("previous + thisOutstanding === current يصحّ دائماً عبر كل الحالات الأربع", () => {
    const cases: ComputeInvoiceBalancesInput[] = [
      { current: 3_832_326, invoice: { total: 32_250, paidAmount: 0, status: "UNPAID" }, sheetNetTotal: 0 },
      { current: 500_000, invoice: { total: 100_000, paidAmount: 40_000, status: "PARTIAL" }, sheetNetTotal: 0 },
      { current: 200_000, invoice: { total: 50_000, paidAmount: 50_000, status: "PAID" }, sheetNetTotal: 0 },
      { current: 200_000, invoice: { total: 900_000, paidAmount: 0, status: "CANCELLED" }, sheetNetTotal: 0 },
      { current: 300_000, invoice: null, sheetNetTotal: 75_000 },
      { current: 0, invoice: null, sheetNetTotal: 0 },
      { current: 1000, invoice: { total: 50_000, paidAmount: 70_000, status: "PARTIAL" }, sheetNetTotal: 0 },
    ];

    for (const c of cases) {
      const result = computeInvoiceBalances(c);
      expect(result.previous + result.thisOutstanding).toBeCloseTo(result.current, 6);
    }
  });
});
