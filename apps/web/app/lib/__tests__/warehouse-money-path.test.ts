import { describe, it, expect } from "vitest";
import { effectiveLine, buildQuoteDecision, type OrderLine } from "../warehouse-quote";
import { buildDraftPurchasePlan, type DraftPurchaseItem } from "../warehouse-purchase-bridge";

// إصلاح خطأ مالي مؤكَّد: إجمالي عرض السعر (PATCH /api/warehouse-portal/orders/[id]/quote)
// وبنود فاتورة الشراء المسودة (POST /api/warehouses/orders/[id]) كانا يحسبان "قيمة
// السطر الفعلية" بقاعدتين مختلفتين — الأول يحسب PARTIAL بالكمية المطلوبة كاملة بدل
// الكمية المعروضة، والثاني لا يستثني OUT_OF_STOCK أبداً بل يُعيد إحياء سعره الأصلي
// عبر requestedPrice. effectiveLine() هي القاعدة الوحيدة الآن؛ هذا الملف يثبت أن
// كلا المسارين (محاكاةً) ينتجان نفس الرقم، ويحرس ضد انحرافهما مستقبلاً.

/** يحاكي حلقة "fresh" في مسار عرض السعر: إجمالي الطلب = Σ effectiveLine(...).lineTotal. */
function quoteRouteTotal(lines: OrderLine[]): number {
  return lines.reduce((sum, l) => sum + effectiveLine(l).lineTotal, 0);
}

/** يحاكي تحويل مسار الاعتماد: يبني بنود الشراء عبر effectiveLine() ثم يستبعد الأصناف الصفرية. */
function approveRoutePlan(lines: Array<OrderLine & { drugId: string }>) {
  const draftItems: DraftPurchaseItem[] = lines
    .map((l) => {
      const eff = effectiveLine(l);
      return { drugId: l.drugId, quantity: eff.quantity, effectivePrice: eff.unitPrice };
    })
    .filter((it) => it.quantity > 0);
  return buildDraftPurchasePlan(draftItems);
}

describe("effectiveLine — القيمة الفعلية لسطر الطلب (مصدر الحقيقة الوحيد)", () => {
  it("OUT_OF_STOCK → صفر دائماً بصرف النظر عمّا هو مخزَّن من أسعار/كميات قديمة", () => {
    const l: OrderLine = {
      status: "OUT_OF_STOCK",
      quantity: 10,
      unitPrice: 250,
      quotedPrice: 999,
      quotedQuantity: 5,
      requestedPrice: 250,
    };
    expect(effectiveLine(l)).toEqual({ quantity: 0, unitPrice: 0, lineTotal: 0 });
  });

  it("PARTIAL بكمية مُسعَّرة صالحة → الكمية الجزئية × السعر المعروض فقط", () => {
    const l: OrderLine = { status: "PARTIAL", quantity: 10, unitPrice: 100, quotedPrice: 120, quotedQuantity: 4 };
    expect(effectiveLine(l)).toEqual({ quantity: 4, unitPrice: 120, lineTotal: 480 });
  });

  it("PARTIAL بـ quotedQuantity = null → كمية صفر (لا كمية مطلوبة كاملة بالخطأ)", () => {
    const l: OrderLine = { status: "PARTIAL", quantity: 10, unitPrice: 100, quotedPrice: 120, quotedQuantity: null };
    expect(effectiveLine(l)).toEqual({ quantity: 0, unitPrice: 120, lineTotal: 0 });
  });

  it("PARTIAL بـ quotedQuantity سالبة → كمية صفر", () => {
    const l: OrderLine = { status: "PARTIAL", quantity: 10, unitPrice: 100, quotedPrice: 120, quotedQuantity: -3 };
    expect(effectiveLine(l).quantity).toBe(0);
  });

  it("AVAILABLE → الكمية المطلوبة كاملة", () => {
    const l: OrderLine = { status: "AVAILABLE", quantity: 7, unitPrice: 50, quotedPrice: 55 };
    expect(effectiveLine(l)).toEqual({ quantity: 7, unitPrice: 55, lineTotal: 385 });
  });

  it("REQUESTED (لم يُحكم عليه بعد) → يُعامَل مثل AVAILABLE بالكمية الكاملة", () => {
    const l: OrderLine = { status: "REQUESTED", quantity: 7, unitPrice: 50 };
    expect(effectiveLine(l)).toEqual({ quantity: 7, unitPrice: 50, lineTotal: 350 });
  });

  it("quotedPrice يطغى على unitPrice، وبغيابه يُستخدم unitPrice", () => {
    const withQuote: OrderLine = { status: "AVAILABLE", quantity: 2, unitPrice: 100, quotedPrice: 130 };
    expect(effectiveLine(withQuote).unitPrice).toBe(130);

    const withoutQuote: OrderLine = { status: "AVAILABLE", quantity: 2, unitPrice: 100, quotedPrice: null };
    expect(effectiveLine(withoutQuote).unitPrice).toBe(100);
  });

  it("requestedPrice مُستبعد عمداً من سلسلة البدائل حتى لو كان موجوداً", () => {
    const l: OrderLine = { status: "AVAILABLE", quantity: 3, unitPrice: 100, quotedPrice: null, requestedPrice: 999 };
    expect(effectiveLine(l).unitPrice).toBe(100); // وليس 999
  });

  it("قيم سالبة/NaN/غير منتهية في الكمية أو السعر → تُعامَل كصفر", () => {
    expect(effectiveLine({ status: "AVAILABLE", quantity: -5, unitPrice: 100 }).quantity).toBe(0);
    expect(effectiveLine({ status: "AVAILABLE", quantity: 5, unitPrice: Number.NaN }).unitPrice).toBe(0);
    expect(effectiveLine({ status: "AVAILABLE", quantity: Number.POSITIVE_INFINITY, unitPrice: 10 }).quantity).toBe(0);
    expect(effectiveLine({ status: "AVAILABLE", quantity: 5, unitPrice: -10 }).unitPrice).toBe(0);
    expect(
      effectiveLine({ status: "PARTIAL", quantity: 10, unitPrice: 100, quotedPrice: 100, quotedQuantity: Number.NaN })
        .quantity
    ).toBe(0);
  });
});

describe("إصلاح الخطأ المالي: توحيد قيمة السطر بين عرض السعر وفاتورة الشراء", () => {
  it("الحالة المُستنسَخة فعلياً: متوفر 5×100 + نافد 10×250 → الإجمالي 500 وليس 3000", () => {
    const orderItems: Array<OrderLine & { drugId: string }> = [
      { drugId: "in-stock", status: "AVAILABLE", quantity: 5, unitPrice: 100, requestedPrice: 100, quotedPrice: 100, quotedQuantity: null },
      { drugId: "sold-out", status: "OUT_OF_STOCK", quantity: 10, unitPrice: 250, requestedPrice: 250, quotedPrice: null, quotedQuantity: null },
    ];

    // المكان 1: إجمالي عرض السعر (كان 3000 قبل الإصلاح: 5*100 + 10*250).
    const quoteTotal = quoteRouteTotal(orderItems);
    expect(quoteTotal).toBe(500);

    // المكان 2: بنود فاتورة الشراء المسودة.
    const plan = approveRoutePlan(orderItems);
    expect(plan.ok).toBe(true);
    expect(plan.items.map((i) => i.drugId)).toEqual(["in-stock"]);
    expect(plan.total).toBe(500);
  });

  it("الثابت الحمائي: إجمالي عرض السعر = إجمالي فاتورة الشراء = إجمالي قرار المذخر، دائماً", () => {
    // متوفر + جزئي (كمية معروضة أقل من المطلوبة) + نافد معاً — أدق سيناريو لكشف الانحراف.
    const orderItems: Array<OrderLine & { drugId: string }> = [
      { drugId: "avail", status: "AVAILABLE", quantity: 5, unitPrice: 100, quotedPrice: 100, quotedQuantity: null },
      { drugId: "partial", status: "PARTIAL", quantity: 10, unitPrice: 250, quotedPrice: 250, quotedQuantity: 4 },
      { drugId: "oos", status: "OUT_OF_STOCK", quantity: 10, unitPrice: 250, quotedPrice: null, quotedQuantity: null },
    ];

    const expectedTotal = 5 * 100 + 4 * 250; // 1500

    // المكان 1: مسار عرض السعر.
    const quoteTotal = quoteRouteTotal(orderItems);
    expect(quoteTotal).toBe(expectedTotal);

    // المكان 2: مسار الاعتماد → فاتورة الشراء.
    const plan = approveRoutePlan(orderItems);
    expect(plan.ok).toBe(true);
    expect(plan.total).toBe(expectedTotal);
    expect(plan.total).toBe(quoteTotal);

    // حساب ثالث مستقل: buildQuoteDecision() نفسها (تُستدعى لحظة كتابة العرض).
    const decision = buildQuoteDecision(
      orderItems.map((l) => ({
        itemId: l.drugId,
        status: l.status as "AVAILABLE" | "PARTIAL" | "OUT_OF_STOCK",
        quotedPrice: l.quotedPrice,
        quotedQuantity: l.quotedQuantity,
      })),
      orderItems.map((l) => ({ itemId: l.drugId, quantity: l.quantity, unitPrice: l.unitPrice }))
    );
    expect(decision.ok).toBe(true);
    expect(decision.total).toBe(expectedTotal);
  });

  it("كل الأصناف نافدة → لا بنود صالحة تصل لـ buildDraftPurchasePlan، وترفض بوضوح", () => {
    const orderItems: Array<OrderLine & { drugId: string }> = [
      { drugId: "a", status: "OUT_OF_STOCK", quantity: 5, unitPrice: 100, quotedPrice: null, quotedQuantity: null },
      { drugId: "b", status: "OUT_OF_STOCK", quantity: 2, unitPrice: 200, quotedPrice: null, quotedQuantity: null },
    ];

    expect(quoteRouteTotal(orderItems)).toBe(0);

    const plan = approveRoutePlan(orderItems);
    expect(plan.ok).toBe(false);
    expect(plan.items).toHaveLength(0);
  });
});
