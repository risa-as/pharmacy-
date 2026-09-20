import { describe, it, expect } from "vitest";
import {
  computeInvoiceStatus,
  applyPayment,
  agingBucket,
  computeDueDate,
  checkCreditLimit,
  summarizeReceivables,
  outstandingWithOpeningBalance,
  MONEY_EPSILON,
} from "../warehouse-accounts";

const NOW = new Date("2026-09-05T00:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("computeInvoiceStatus", () => {
  it("cancelled يفوز على كل شيء حتى لو كانت الفاتورة مسدَّدة جزئياً", () => {
    expect(computeInvoiceStatus({ total: 100, paidAmount: 50, cancelled: true })).toBe("CANCELLED");
    expect(computeInvoiceStatus({ total: 100, paidAmount: 100, cancelled: true })).toBe("CANCELLED");
    expect(computeInvoiceStatus({ total: 100, paidAmount: 0, cancelled: true })).toBe("CANCELLED");
  });

  it("paidAmount <= 0 يعني UNPAID", () => {
    expect(computeInvoiceStatus({ total: 100, paidAmount: 0 })).toBe("UNPAID");
    expect(computeInvoiceStatus({ total: 100, paidAmount: -5 })).toBe("UNPAID");
  });

  it("paidAmount بين الصفر والإجمالي يعني PARTIAL", () => {
    expect(computeInvoiceStatus({ total: 100, paidAmount: 40 })).toBe("PARTIAL");
  });

  it("paidAmount >= total يعني PAID", () => {
    expect(computeInvoiceStatus({ total: 100, paidAmount: 100 })).toBe("PAID");
    expect(computeInvoiceStatus({ total: 100, paidAmount: 150 })).toBe("PAID");
  });

  it("فاصلة عائمة: 99.999 من أصل 100 تُحسب PAID وليس PARTIAL", () => {
    expect(computeInvoiceStatus({ total: 100, paidAmount: 99.999 })).toBe("PAID");
  });

  it("فاصلة عائمة: بقايا تقريب سالبة صغيرة جداً في paidAmount لا تُحسب PARTIAL خطأً", () => {
    // 0.1 + 0.2 = 0.30000000000000004 — تراكم دفعات جزئية واقعي.
    const paidAmount = 0.1 + 0.2;
    expect(computeInvoiceStatus({ total: 0.3, paidAmount })).toBe("PAID");
  });
});

describe("applyPayment", () => {
  it("يرفض مبلغاً صفرياً أو سالباً أو غير منتهٍ", () => {
    expect(applyPayment({ total: 100, paidAmount: 0, payment: 0 })).toEqual({
      ok: false,
      error: expect.any(String),
    });
    expect(applyPayment({ total: 100, paidAmount: 0, payment: -10 }).ok).toBe(false);
    expect(applyPayment({ total: 100, paidAmount: 0, payment: NaN }).ok).toBe(false);
    expect(applyPayment({ total: 100, paidAmount: 0, payment: Infinity }).ok).toBe(false);
  });

  it("يقبل دفعة جزئية ويحسب الحالة الجديدة PARTIAL", () => {
    const result = applyPayment({ total: 100, paidAmount: 0, payment: 40 });
    expect(result).toEqual({ ok: true, newPaid: 40, newStatus: "PARTIAL" });
  });

  it("يقبل دفعة تُكمل الفاتورة وتُنتج PAID", () => {
    const result = applyPayment({ total: 100, paidAmount: 60, payment: 40 });
    expect(result).toEqual({ ok: true, newPaid: 100, newStatus: "PAID" });
  });

  it("يرفض دفعة زائدة عن المتبقي ويسمّي المبلغ المتبقي بالضبط", () => {
    const result = applyPayment({ total: 100, paidAmount: 60, payment: 50 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("40.00");
    }
  });

  it("يرفض أي دفعة على فاتورة مسدَّدة بالكامل فعلاً (المتبقي 0)", () => {
    const result = applyPayment({ total: 100, paidAmount: 100, payment: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("0.00");
    }
  });

  it("دفعة تفوق المتبقي بأقل من MONEY_EPSILON لا تُرفض كزائدة (بقايا تقريب)", () => {
    const result = applyPayment({ total: 100, paidAmount: 60, payment: 40 + MONEY_EPSILON / 2 });
    expect(result.ok).toBe(true);
  });
});

describe("agingBucket", () => {
  it("dueAt = null يعني CURRENT دائماً", () => {
    expect(agingBucket(null, NOW)).toBe("CURRENT");
  });

  it("لم يحن الاستحقاق بعد (تاريخ مستقبلي) يعني CURRENT", () => {
    const future = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    expect(agingBucket(future, NOW)).toBe("CURRENT");
  });

  it("الحدود بالضبط: 0 يوم تأخر → CURRENT", () => {
    expect(agingBucket(daysAgo(0), NOW)).toBe("CURRENT");
  });

  it("الحدود بالضبط: 30 يوماً تأخر → D30", () => {
    expect(agingBucket(daysAgo(30), NOW)).toBe("D30");
  });

  it("الحدود بالضبط: 31 يوماً تأخر → D60", () => {
    expect(agingBucket(daysAgo(31), NOW)).toBe("D60");
  });

  it("الحدود بالضبط: 60 يوماً تأخر → D60", () => {
    expect(agingBucket(daysAgo(60), NOW)).toBe("D60");
  });

  it("الحدود بالضبط: 61 يوماً تأخر → D90", () => {
    expect(agingBucket(daysAgo(61), NOW)).toBe("D90");
  });

  it("الحدود بالضبط: 90 يوماً تأخر → D90", () => {
    expect(agingBucket(daysAgo(90), NOW)).toBe("D90");
  });

  it("الحدود بالضبط: 91 يوماً تأخر → D90_PLUS", () => {
    expect(agingBucket(daysAgo(91), NOW)).toBe("D90_PLUS");
  });

  it("يقبل dueAt كنص (ISO string) تماماً مثل Date", () => {
    expect(agingBucket(daysAgo(31).toISOString(), NOW)).toBe("D60");
  });
});

describe("computeDueDate", () => {
  it("paymentTermDays = 0 يعني بلا استحقاق (نقدي) → null", () => {
    expect(computeDueDate(NOW, 0)).toBeNull();
  });

  it("paymentTermDays سالب يعني null أيضاً", () => {
    expect(computeDueDate(NOW, -5)).toBeNull();
  });

  it("يحسب تاريخ الاستحقاق بإضافة عدد الأيام بالضبط", () => {
    const due = computeDueDate(NOW, 30);
    expect(due).not.toBeNull();
    expect(due!.getTime() - NOW.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("checkCreditLimit", () => {
  it("creditLimit = 0 يعني بلا حد ائتماني — دائماً ok حتى مع ذمم ضخمة", () => {
    expect(checkCreditLimit({ creditLimit: 0, outstanding: 1_000_000, newOrderTotal: 1_000_000 })).toEqual({
      ok: true,
    });
  });

  it("creditLimit سالب يُعامَل أيضاً كبلا حد", () => {
    expect(checkCreditLimit({ creditLimit: -10, outstanding: 500, newOrderTotal: 500 })).toEqual({ ok: true });
  });

  it("يقبل طلباً لا يتجاوز الحدّ", () => {
    expect(checkCreditLimit({ creditLimit: 1000, outstanding: 400, newOrderTotal: 500 })).toEqual({ ok: true });
  });

  it("يرفض طلباً يتجاوز الحدّ ويسمّي المتاح", () => {
    const result = checkCreditLimit({ creditLimit: 1000, outstanding: 800, newOrderTotal: 300 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.available).toBe(200);
      expect(result.error).toContain("200.00");
    }
  });

  it("يقبل طلباً يصل بالضبط إلى الحدّ (لا يتجاوزه)", () => {
    expect(checkCreditLimit({ creditLimit: 1000, outstanding: 700, newOrderTotal: 300 })).toEqual({ ok: true });
  });

  // إثبات تكوين حدّ الائتمان مع الرصيد السابق (STEP 3 من ميزة الرصيد السابق):
  // عميل بلا أي مستند مفتوح إطلاقاً، لكن رصيده السابق وحده يتجاوز حدّه — يجب
  // أن يُرفض طلبه تماماً كأنه مدين بفواتير حقيقية بنفس القيمة. هذا هو الإثبات
  // الفعلي لدخول الرصيد السابق في فحص حدّ الائتمان، لا مجرد تتبّع سلسلة
  // الاستدعاء نصياً.
  it("رصيد سابق وحده (بلا أي مستند مفتوح) يتجاوز الحدّ يرفض الطلب", () => {
    const outstanding = outstandingWithOpeningBalance(1200, []); // لا فواتير ولا مبيعات ميدانية
    expect(outstanding).toBe(1200);

    const result = checkCreditLimit({ creditLimit: 1000, outstanding, newOrderTotal: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // المتاح فعلياً صفر — الرصيد السابق وحده تجاوز الحدّ أصلاً.
      expect(result.available).toBe(0);
    }
  });
});

describe("outstandingWithOpeningBalance", () => {
  it("رصيد سابق صفري يتصرّف تماماً كما كان الحساب قبل هذه الميزة (مجموع المستندات فقط)", () => {
    const rows = [
      { total: 100, paidAmount: 40 },
      { total: 200, paidAmount: 200 },
    ];
    expect(outstandingWithOpeningBalance(0, rows)).toBe(60);
  });

  it("رصيد سابق موجب يُضاف فوق مجموع المستندات لا يستبدله", () => {
    const rows = [{ total: 300, paidAmount: 100 }]; // متبقي 200 من المستندات
    expect(outstandingWithOpeningBalance(3_800_076, rows)).toBe(3_800_076 + 200);
  });

  it("رصيد سابق بلا أي مستندات مفتوحة يُرجع الرصيد السابق وحده", () => {
    expect(outstandingWithOpeningBalance(500, [])).toBe(500);
  });

  it("مستند مسدَّد بالكامل يساهم بصفر — الرصيد السابق فقط هو المستحق", () => {
    const rows = [{ total: 150, paidAmount: 150 }];
    expect(outstandingWithOpeningBalance(500, rows)).toBe(500);
  });

  it("عميل رصيده السابق فقط (بلا أي طلب/فاتورة على الإطلاق) يُبلَّغ عنه صحيحاً", () => {
    expect(outstandingWithOpeningBalance(75.5, [])).toBe(75.5);
  });
});

describe("summarizeReceivables", () => {
  it("يستبعد فواتير CANCELLED و PAID كلياً من الإجمالي والتقادم", () => {
    const invoices = [
      { total: 100, paidAmount: 0, status: "CANCELLED", dueAt: daysAgo(100) },
      { total: 200, paidAmount: 200, status: "PAID", dueAt: daysAgo(100) },
      { total: 300, paidAmount: 100, status: "PARTIAL", dueAt: daysAgo(10) },
    ];

    const summary = summarizeReceivables(invoices, NOW);
    expect(summary.outstanding).toBe(200);
    expect(summary.byBucket.D30).toBe(200);
    expect(summary.byBucket.CURRENT).toBe(0);
  });

  it("يحسب overdue كمجموع كل الفئات غير CURRENT فقط", () => {
    const invoices = [
      { total: 100, paidAmount: 0, status: "UNPAID", dueAt: null }, // CURRENT — بلا مهلة
      { total: 100, paidAmount: 0, status: "UNPAID", dueAt: daysAgo(40) }, // D60
      { total: 100, paidAmount: 0, status: "UNPAID", dueAt: daysAgo(95) }, // D90_PLUS
    ];

    const summary = summarizeReceivables(invoices, NOW);
    expect(summary.outstanding).toBe(300);
    expect(summary.overdue).toBe(200);
    expect(summary.byBucket.CURRENT).toBe(100);
    expect(summary.byBucket.D60).toBe(100);
    expect(summary.byBucket.D90_PLUS).toBe(100);
  });

  it("قائمة فارغة تُنتج أصفاراً في كل الحقول", () => {
    const summary = summarizeReceivables([], NOW);
    expect(summary.outstanding).toBe(0);
    expect(summary.overdue).toBe(0);
    expect(summary.byBucket).toEqual({ CURRENT: 0, D30: 0, D60: 0, D90: 0, D90_PLUS: 0 });
  });
});
