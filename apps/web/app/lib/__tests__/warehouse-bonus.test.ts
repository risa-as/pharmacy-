// ميزة البونص (بونص/سلع مجانية) في نظام المذاخر B2B: اختبارات الدوال النقية
// في app/lib/warehouse-bonus.ts — بمعزل عن Prisma/Next (استيراد نسبي، لا alias
// "@/*"، نفس قيد إعداد vitest في هذا المستودع).
import { describe, it, expect } from "vitest";
import { computeBonusUnits, totalUnitsLeavingStock, validateBonus } from "../warehouse-bonus";

describe("computeBonusUnits — قاعدة الكتالوج القياسية (عتبة 10 / بونص 1)", () => {
  const rule = { bonusThreshold: 10, bonusQuantity: 1 };

  it("كمية 9 (تحت العتبة) → 0", () => {
    expect(computeBonusUnits({ quantity: 9, ...rule })).toBe(0);
  });

  it("كمية 10 (العتبة بالضبط) → 1", () => {
    expect(computeBonusUnits({ quantity: 10, ...rule })).toBe(1);
  });

  it("كمية 19 (أقل من ضعف العتبة) → 1", () => {
    expect(computeBonusUnits({ quantity: 19, ...rule })).toBe(1);
  });

  it("كمية 20 (ضعف العتبة بالضبط) → 2", () => {
    expect(computeBonusUnits({ quantity: 20, ...rule })).toBe(2);
  });

  it("bonusThreshold = 0 → لا قاعدة بونص، 0 دائماً بصرف النظر عن الكمية", () => {
    expect(computeBonusUnits({ quantity: 100, bonusThreshold: 0, bonusQuantity: 1 })).toBe(0);
  });

  it("bonusQuantity = 0 → لا قاعدة بونص، 0 دائماً", () => {
    expect(computeBonusUnits({ quantity: 100, bonusThreshold: 10, bonusQuantity: 0 })).toBe(0);
  });

  it("عتبة سالبة → 0 دفاعياً", () => {
    expect(computeBonusUnits({ quantity: 20, bonusThreshold: -10, bonusQuantity: 1 })).toBe(0);
  });

  it("كمية كسرية/سالبة/غير منتهية → 0 دفاعياً", () => {
    expect(computeBonusUnits({ quantity: 10.5, ...rule })).toBe(0);
    expect(computeBonusUnits({ quantity: -10, ...rule })).toBe(0);
    expect(computeBonusUnits({ quantity: NaN, ...rule })).toBe(0);
    expect(computeBonusUnits({ quantity: Infinity, ...rule })).toBe(0);
  });
});

describe("totalUnitsLeavingStock — مباع + مجاني", () => {
  it("يجمع الكميتين ببساطة", () => {
    expect(totalUnitsLeavingStock({ soldQuantity: 10, bonusQuantity: 1 })).toBe(11);
  });

  it("بونص صفري لا يغيّر شيئاً", () => {
    expect(totalUnitsLeavingStock({ soldQuantity: 10, bonusQuantity: 0 })).toBe(10);
  });

  it("مدخلات غير صالحة (سالب/NaN) تُعامَل كصفر دفاعياً", () => {
    expect(totalUnitsLeavingStock({ soldQuantity: 10, bonusQuantity: -5 })).toBe(10);
    expect(totalUnitsLeavingStock({ soldQuantity: NaN, bonusQuantity: 3 })).toBe(3);
  });
});

describe("validateBonus — التحقق من بونص أدخله المذخر يدوياً", () => {
  it("صفر صالح دائماً", () => {
    expect(validateBonus({ soldQuantity: 10, bonusQuantity: 0 })).toEqual({ ok: true });
    expect(validateBonus({ soldQuantity: 0, bonusQuantity: 0 })).toEqual({ ok: true });
  });

  it("بونص أقل من أو يساوي المباع → صالح", () => {
    expect(validateBonus({ soldQuantity: 10, bonusQuantity: 1 })).toEqual({ ok: true });
    expect(validateBonus({ soldQuantity: 10, bonusQuantity: 10 })).toEqual({ ok: true });
  });

  it("بونص أكبر من المباع → مرفوض برسالة عربية واضحة", () => {
    const result = validateBonus({ soldQuantity: 10, bonusQuantity: 11 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("11");
      expect(result.error).toContain("10");
    }
  });

  it("بونص كسري → مرفوض", () => {
    const result = validateBonus({ soldQuantity: 10, bonusQuantity: 1.5 });
    expect(result.ok).toBe(false);
  });

  it("بونص سالب → مرفوض", () => {
    const result = validateBonus({ soldQuantity: 10, bonusQuantity: -1 });
    expect(result.ok).toBe(false);
  });

  it("بونص NaN/Infinity → مرفوض", () => {
    expect(validateBonus({ soldQuantity: 10, bonusQuantity: NaN }).ok).toBe(false);
    expect(validateBonus({ soldQuantity: 10, bonusQuantity: Infinity }).ok).toBe(false);
  });
});
