import { describe, it, expect } from "vitest";
import { validateReturnQuantity, applyReturnCredit } from "../warehouse-returns";

describe("validateReturnQuantity — سقف الكمية القابلة للإرجاع", () => {
  it("إرجاع أول ضمن الكمية المشحونة كاملة يُقبل", () => {
    const r = validateReturnQuantity({ shippedQuantity: 10, alreadyAcceptedQuantity: 0, requestedQuantity: 10 });
    expect(r.ok).toBe(true);
  });

  it("إرجاع يتجاوز الكمية المشحونة يُرفض", () => {
    const r = validateReturnQuantity({ shippedQuantity: 10, alreadyAcceptedQuantity: 0, requestedQuantity: 11 });
    expect(r.ok).toBe(false);
  });

  it("إرجاعات متكرّرة لا تتجاوز مجتمعة الكمية المشحونة", () => {
    // شُحن 10، أُرجِع واعتُمد 6 سابقاً — المتاح الآن 4 فقط.
    const okCase = validateReturnQuantity({ shippedQuantity: 10, alreadyAcceptedQuantity: 6, requestedQuantity: 4 });
    expect(okCase.ok).toBe(true);

    const overCase = validateReturnQuantity({ shippedQuantity: 10, alreadyAcceptedQuantity: 6, requestedQuantity: 5 });
    expect(overCase.ok).toBe(false);
  });

  it("لا شيء متاح للإرجاع بعد استنفاذه بالكامل", () => {
    const r = validateReturnQuantity({ shippedQuantity: 10, alreadyAcceptedQuantity: 10, requestedQuantity: 1 });
    expect(r.ok).toBe(false);
  });

  it("كمية صفرية أو سالبة أو كسرية مرفوضة", () => {
    expect(validateReturnQuantity({ shippedQuantity: 10, alreadyAcceptedQuantity: 0, requestedQuantity: 0 }).ok).toBe(false);
    expect(validateReturnQuantity({ shippedQuantity: 10, alreadyAcceptedQuantity: 0, requestedQuantity: -1 }).ok).toBe(false);
    expect(validateReturnQuantity({ shippedQuantity: 10, alreadyAcceptedQuantity: 0, requestedQuantity: 1.5 }).ok).toBe(false);
  });
});

describe("applyReturnCredit — أثر قبول الإرجاع على فاتورة المذخر", () => {
  it("فاتورة UNPAID: خصم يُبقيها UNPAID طالما لم يُسدَّد شيء", () => {
    const r = applyReturnCredit({ invoiceTotal: 1000, invoicePaidAmount: 0, invoiceStatus: "UNPAID", creditAmount: 300 });
    expect(r).toEqual({ ok: true, newTotal: 700, newStatus: "UNPAID" });
  });

  it("فاتورة PARTIAL تبقى PARTIAL إن لم يكفِ الخصم لتصفية الدين", () => {
    // إجمالي 1000، مسدَّد 400 → متبقٍ 600. خصم 300 → إجمالي جديد 700، مسدَّد لا يزال 400 → لا يزال PARTIAL.
    const r = applyReturnCredit({ invoiceTotal: 1000, invoicePaidAmount: 400, invoiceStatus: "PARTIAL", creditAmount: 300 });
    expect(r).toEqual({ ok: true, newTotal: 700, newStatus: "PARTIAL" });
  });

  it("الانتقال الحقيقي الممكن: PARTIAL → PAID عندما يصفّي الخصم الدين بالضبط", () => {
    // إجمالي 1000، مسدَّد 400. خصم 600 → إجمالي جديد 400 = المسدَّد بالضبط → PAID.
    const r = applyReturnCredit({ invoiceTotal: 1000, invoicePaidAmount: 400, invoiceStatus: "PARTIAL", creditAmount: 600 });
    expect(r).toEqual({ ok: true, newTotal: 400, newStatus: "PAID" });
  });

  it("الحارس الجوهري: خصم يُنزل الإجمالي دون المسدَّد فعلاً يُرفض", () => {
    // إجمالي 1000، مسدَّد 400. خصم 700 → إجمالي جديد 300 < 400 المسدَّد فعلاً — مرفوض.
    const r = applyReturnCredit({ invoiceTotal: 1000, invoicePaidAmount: 400, invoiceStatus: "PARTIAL", creditAmount: 700 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ردّ|رد/);
  });

  it("فاتورة CANCELLED مرفوضة دائماً بصرف النظر عن المبلغ", () => {
    const r = applyReturnCredit({ invoiceTotal: 1000, invoicePaidAmount: 0, invoiceStatus: "CANCELLED", creditAmount: 100 });
    expect(r.ok).toBe(false);
  });

  it("creditAmount غير موجب أو غير منتهٍ مرفوض", () => {
    expect(applyReturnCredit({ invoiceTotal: 1000, invoicePaidAmount: 0, invoiceStatus: "UNPAID", creditAmount: 0 }).ok).toBe(false);
    expect(applyReturnCredit({ invoiceTotal: 1000, invoicePaidAmount: 0, invoiceStatus: "UNPAID", creditAmount: -50 }).ok).toBe(false);
    expect(applyReturnCredit({ invoiceTotal: 1000, invoicePaidAmount: 0, invoiceStatus: "UNPAID", creditAmount: NaN }).ok).toBe(false);
  });

  it("فاصلة عائمة: خصم يقترب من المسدَّد ضمن MONEY_EPSILON لا يُرفض خطأً", () => {
    // إجمالي 1000، مسدَّد 400.0000001 (بقايا تقريب) — خصم 599.9999 يترك 400.0001 ≈ المسدَّد.
    const r = applyReturnCredit({ invoiceTotal: 1000, invoicePaidAmount: 400.0000001, invoiceStatus: "PARTIAL", creditAmount: 599.9999 });
    expect(r.ok).toBe(true);
  });
});
