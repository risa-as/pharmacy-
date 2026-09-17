// مشتريات المذخر وذممه الدائنة: اختبارات الدوال النقية في
// app/lib/warehouse-purchases.ts — بمعزل عن Prisma/Next (استيراد نسبي، لا
// alias "@/*"، نفس قيد إعداد vitest في هذا المستودع). يشمل أيضاً إثباتاً
// صريحاً لإعادة استخدام applyPayment/computeInvoiceStatus من
// warehouse-accounts.ts بدل إعادة تنفيذهما هنا (القسم الأخير من الملف).
import { describe, it, expect } from "vitest";
import { computePurchaseTotal, purchaseStockUnits, validatePurchaseLine } from "../warehouse-purchases";
import { applyPayment, computeInvoiceStatus, MONEY_EPSILON } from "../warehouse-accounts";

describe("computePurchaseTotal — إجمالي فاتورة الشراء يُشتق من البنود حصراً", () => {
  it("سطر واحد: الإجمالي = الكمية × كلفة الوحدة", () => {
    expect(computePurchaseTotal([{ quantity: 10, unitCost: 5 }])).toBe(50);
  });

  it("عدة أسطر: مجموع (كمية × كلفة) لكل سطر", () => {
    const total = computePurchaseTotal([
      { quantity: 10, unitCost: 5 },
      { quantity: 3, unitCost: 20 },
    ]);
    expect(total).toBe(50 + 60);
  });

  it("سطر بكلفة وحدة صفرية (بونص كامل السطر) يساهم بصفر تماماً، لا NaN", () => {
    const total = computePurchaseTotal([
      { quantity: 10, unitCost: 5 },
      { quantity: 20, unitCost: 0 },
    ]);
    expect(total).toBe(50);
    expect(Number.isNaN(total)).toBe(false);
  });

  it("قائمة فارغة → صفر", () => {
    expect(computePurchaseTotal([])).toBe(0);
  });

  it("bonusQuantity ليس جزءاً من هذا الحساب أصلاً — لا يُستقبَل كمعامل حتى لو مُرِّر ضمن كائن أكبر", () => {
    // النوع لا يقبل bonusQuantity، لكن التأكيد هنا أن الدالة تحسب فقط
    // quantity × unitCost بصرف النظر عن أي حقل إضافي على الكائن المُمرَّر.
    const line = { quantity: 5, unitCost: 4, bonusQuantity: 100 } as { quantity: number; unitCost: number };
    expect(computePurchaseTotal([line])).toBe(20);
  });
});

describe("purchaseStockUnits — وحدات المخزون الفعلية (مدفوعة + بونص)", () => {
  it("بلا بونص: الوحدات الداخلة = الكمية المدفوعة فقط", () => {
    expect(purchaseStockUnits({ quantity: 10, bonusQuantity: 0 })).toBe(10);
  });

  it("مع بونص: الوحدات الداخلة = المدفوعة + المجانية معاً", () => {
    expect(purchaseStockUnits({ quantity: 10, bonusQuantity: 2 })).toBe(12);
  });

  it("بونص بلا كمية مدفوعة (سطر غير واقعي لكن الدالة نقية وتجمع كما هي) → البونص فقط", () => {
    expect(purchaseStockUnits({ quantity: 0, bonusQuantity: 5 })).toBe(5);
  });
});

describe("validatePurchaseLine — التحقق من سطر شراء واحد قبل أي كتابة", () => {
  const future = new Date("2027-01-01T00:00:00.000Z");
  const now = new Date("2026-09-07T00:00:00.000Z");
  const validLine = { quantity: 10, unitCost: 5, bonusQuantity: 0, expiryDate: future };

  it("سطر صالح بالكامل → ok", () => {
    expect(validatePurchaseLine(validLine, now)).toEqual({ ok: true });
  });

  it("تاريخ انتهاء ماضٍ (قبل now) يُرفَض برسالة عربية واضحة", () => {
    const past = new Date("2026-01-01T00:00:00.000Z");
    const result = validatePurchaseLine({ ...validLine, expiryDate: past }, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("منتهية الصلاحية");
  });

  it("تاريخ الانتهاء يساوي now بالضبط يُرفَض أيضاً (يجب أن يكون مستقبلياً حصراً)", () => {
    const result = validatePurchaseLine({ ...validLine, expiryDate: now }, now);
    expect(result.ok).toBe(false);
  });

  it("كمية صفرية تُرفَض", () => {
    expect(validatePurchaseLine({ ...validLine, quantity: 0 }, now).ok).toBe(false);
  });

  it("كمية سالبة تُرفَض", () => {
    expect(validatePurchaseLine({ ...validLine, quantity: -5 }, now).ok).toBe(false);
  });

  it("كمية كسرية تُرفَض", () => {
    expect(validatePurchaseLine({ ...validLine, quantity: 2.5 }, now).ok).toBe(false);
  });

  it("كلفة وحدة سالبة تُرفَض", () => {
    expect(validatePurchaseLine({ ...validLine, unitCost: -1 }, now).ok).toBe(false);
  });

  it("كلفة وحدة صفرية مقبولة — سطر مجاني بالكامل حالة تجارية مشروعة", () => {
    expect(validatePurchaseLine({ ...validLine, unitCost: 0 }, now)).toEqual({ ok: true });
  });

  it("bonusQuantity سالب يُرفَض", () => {
    expect(validatePurchaseLine({ ...validLine, bonusQuantity: -1 }, now).ok).toBe(false);
  });

  it("bonusQuantity غائب (undefined) يُعامَل كصفر ولا يُرفَض", () => {
    const { bonusQuantity, ...withoutBonus } = validLine;
    expect(validatePurchaseLine(withoutBonus, now)).toEqual({ ok: true });
  });

  it("تاريخ انتهاء غير صالح (نص غير قابل للتحويل) يُرفَض", () => {
    expect(validatePurchaseLine({ ...validLine, expiryDate: "not-a-date" }, now).ok).toBe(false);
  });
});

// ── إثبات إعادة الاستخدام: applyPayment/computeInvoiceStatus من
// warehouse-accounts.ts تُطبَّقان هنا حرفياً بلا أي نسخة موازية للذمم
// الدائنة. هذان الاختباران يمرّان فقط لأن الدالتين نقيّتان من اتجاه العلاقة
// (تُدخِلان {total, paidAmount} فقط) — لا معنى لـ "فاتورة بيع" أو "فاتورة
// شراء" داخلهما إطلاقاً.
describe("إعادة استخدام warehouse-accounts.ts للذمم الدائنة (لا نسخة موازية)", () => {
  it("applyPayment يرفض دفعة تتجاوز المتبقي على فاتورة شراء (overpayment)، بنفس رسالة الذمم المدينة", () => {
    const purchase = { total: 1000, paidAmount: 600 }; // المتبقي = 400
    const result = applyPayment({ ...purchase, payment: 500 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("400.00");
    }
  });

  it("applyPayment يقبل دفعة تساوي المتبقي بالضبط على فاتورة شراء وتُنتج status: PAID", () => {
    const purchase = { total: 1000, paidAmount: 600 };
    const result = applyPayment({ ...purchase, payment: 400 });
    expect(result).toEqual({ ok: true, newPaid: 1000, newStatus: "PAID" });
  });

  it("computeInvoiceStatus يُصنِّف فاتورة شراء كـ PAID عند حافة MONEY_EPSILON تماماً (بقايا تقريب لا تُبقيها PARTIAL)", () => {
    const total = 100;
    const paidAmount = total - MONEY_EPSILON; // أقرب ما يكون من total دون بلوغه فعلياً
    expect(computeInvoiceStatus({ total, paidAmount })).toBe("PAID");
  });

  it("computeInvoiceStatus يُصنِّف فاتورة شراء غير مسدَّدة كـ UNPAID، وجزئية كـ PARTIAL — نفس دلالات الذمم المدينة تماماً", () => {
    expect(computeInvoiceStatus({ total: 1000, paidAmount: 0 })).toBe("UNPAID");
    expect(computeInvoiceStatus({ total: 1000, paidAmount: 400 })).toBe("PARTIAL");
  });
});
