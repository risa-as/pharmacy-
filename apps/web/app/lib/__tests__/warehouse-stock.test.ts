import { describe, it, expect } from "vitest";
import {
  allocateFEFO,
  summarizeStock,
  expiryBucket,
  deriveAvailability,
  isLowStock,
  validateStockMove,
  type BatchLike,
} from "../warehouse-stock";

const NOW = new Date("2026-09-05T00:00:00.000Z");

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("allocateFEFO — تخصيص أول منتهي أول مصروف", () => {
  it("يستهلك الدفعة الأقرب انتهاءً أولاً بين ثلاث دفعات مختلفة التاريخ", () => {
    const batches: BatchLike[] = [
      { id: "far", quantity: 50, expiryDate: daysFromNow(365) },
      { id: "near", quantity: 50, expiryDate: daysFromNow(10) },
      { id: "mid", quantity: 50, expiryDate: daysFromNow(100) },
    ];

    const result = allocateFEFO(batches, 30, NOW);

    expect(result.ok).toBe(true);
    expect(result.allocations).toEqual([{ batchId: "near", quantity: 30 }]);
    expect(result.allocated).toBe(30);
    expect(result.shortfall).toBe(0);
  });

  it("دفعة منتهية الصلاحية لا تُخصَّص أبداً حتى لو كانت الوحيدة وتكفي الطلب كاملاً (حالة أمان حرجة)", () => {
    const batches: BatchLike[] = [
      { id: "expired-only", quantity: 1000, expiryDate: daysFromNow(-1) },
    ];

    const result = allocateFEFO(batches, 100, NOW);

    expect(result.ok).toBe(false);
    expect(result.allocations).toEqual([]);
    expect(result.allocated).toBe(0);
    expect(result.shortfall).toBe(100);
  });

  it("دفعة تنتهي في نفس لحظة now تُعامَل كمنتهية ولا تُخصَّص", () => {
    const batches: BatchLike[] = [{ id: "at-now", quantity: 10, expiryDate: NOW }];

    const result = allocateFEFO(batches, 5, NOW);

    expect(result.ok).toBe(false);
    expect(result.shortfall).toBe(5);
  });

  it("تلبية جزئية عبر عدة دفعات مع shortfall صحيح", () => {
    const batches: BatchLike[] = [
      { id: "b1", quantity: 10, expiryDate: daysFromNow(10) },
      { id: "b2", quantity: 5, expiryDate: daysFromNow(20) },
    ];

    const result = allocateFEFO(batches, 30, NOW);

    expect(result.ok).toBe(false);
    expect(result.allocations).toEqual([
      { batchId: "b1", quantity: 10 },
      { batchId: "b2", quantity: 5 },
    ]);
    expect(result.allocated).toBe(15);
    expect(result.shortfall).toBe(15);
  });

  it("طلب يساوي إجمالي المخزون القابل للبيع بالضبط → ok:true, shortfall:0", () => {
    const batches: BatchLike[] = [
      { id: "b1", quantity: 10, expiryDate: daysFromNow(10) },
      { id: "b2", quantity: 5, expiryDate: daysFromNow(20) },
    ];

    const result = allocateFEFO(batches, 15, NOW);

    expect(result.ok).toBe(true);
    expect(result.allocated).toBe(15);
    expect(result.shortfall).toBe(0);
  });

  it("طلب صفري أو سالب أو كسري يُرفض بلا أي تخصيص", () => {
    const batches: BatchLike[] = [{ id: "b1", quantity: 10, expiryDate: daysFromNow(10) }];

    for (const bad of [0, -5, 2.5, NaN, Infinity, -Infinity]) {
      const result = allocateFEFO(batches, bad, NOW);
      expect(result.ok).toBe(false);
      expect(result.allocations).toEqual([]);
      expect(result.allocated).toBe(0);
    }
  });

  it("الدفعات بكمية 0 تُتجاهل تماماً", () => {
    const batches: BatchLike[] = [
      { id: "empty", quantity: 0, expiryDate: daysFromNow(1) },
      { id: "stock", quantity: 20, expiryDate: daysFromNow(50) },
    ];

    const result = allocateFEFO(batches, 10, NOW);

    expect(result.ok).toBe(true);
    expect(result.allocations).toEqual([{ batchId: "stock", quantity: 10 }]);
  });

  it("عند تساوي تاريخ الانتهاء، الترتيب حاسم وقابل للتكرار (بحسب id تصاعدياً)", () => {
    const sameExpiry = daysFromNow(30);
    const batches: BatchLike[] = [
      { id: "zzz", quantity: 5, expiryDate: sameExpiry },
      { id: "aaa", quantity: 5, expiryDate: sameExpiry },
      { id: "mmm", quantity: 5, expiryDate: sameExpiry },
    ];

    const result1 = allocateFEFO(batches, 10, NOW);
    const result2 = allocateFEFO([...batches].reverse(), 10, NOW);

    expect(result1.allocations).toEqual([
      { batchId: "aaa", quantity: 5 },
      { batchId: "mmm", quantity: 5 },
    ]);
    expect(result2.allocations).toEqual(result1.allocations);
  });

  it("expiryDate كنص ISO يُعامَل بنفس سلوك Date", () => {
    const batches: BatchLike[] = [
      { id: "iso-near", quantity: 5, expiryDate: daysFromNow(5).toISOString() },
      { id: "date-far", quantity: 5, expiryDate: daysFromNow(50) },
    ];

    const result = allocateFEFO(batches, 5, NOW);

    expect(result.allocations).toEqual([{ batchId: "iso-near", quantity: 5 }]);
  });
});

describe("summarizeStock — ملخص المخزون", () => {
  it("يستثني المنتهي من totalQuantity لكنه يُبلَّغ ضمن expiredQuantity", () => {
    const batches: BatchLike[] = [
      { id: "b1", quantity: 10, expiryDate: daysFromNow(30) },
      { id: "expired", quantity: 7, expiryDate: daysFromNow(-1) },
    ];

    const summary = summarizeStock(batches, NOW);

    expect(summary.totalQuantity).toBe(10);
    expect(summary.expiredQuantity).toBe(7);
    expect(summary.batchCount).toBe(2);
  });

  it("nearestExpiry يتجاهل الدفعات المنتهية والفارغة", () => {
    const batches: BatchLike[] = [
      { id: "expired-near", quantity: 5, expiryDate: daysFromNow(-5) },
      { id: "empty-nearer", quantity: 0, expiryDate: daysFromNow(1) },
      { id: "valid", quantity: 3, expiryDate: daysFromNow(20) },
      { id: "valid-far", quantity: 3, expiryDate: daysFromNow(90) },
    ];

    const summary = summarizeStock(batches, NOW);

    expect(summary.nearestExpiry).toEqual(daysFromNow(20));
  });

  it("لا دفعات صالحة على الإطلاق → nearestExpiry هو null", () => {
    const summary = summarizeStock([], NOW);
    expect(summary.nearestExpiry).toBeNull();
    expect(summary.totalQuantity).toBe(0);
    expect(summary.expiredQuantity).toBe(0);
    expect(summary.batchCount).toBe(0);
  });
});

describe("expiryBucket — تصنيف مخاطر الانتهاء", () => {
  it("EXPIRED عند اللحظة الحالية بالضبط وقبلها", () => {
    expect(expiryBucket(NOW, NOW)).toBe("EXPIRED");
    expect(expiryBucket(daysFromNow(-1), NOW)).toBe("EXPIRED");
  });

  it("الحافة عند 90 يوماً بالضبط تقع ضمن CRITICAL", () => {
    expect(expiryBucket(daysFromNow(90), NOW)).toBe("CRITICAL");
  });

  it("اليوم التالي مباشرة بعد الحافة 90 يقع ضمن WARNING", () => {
    const justAfter90 = new Date(daysFromNow(90).getTime() + 1);
    expect(expiryBucket(justAfter90, NOW)).toBe("WARNING");
  });

  it("الحافة عند 180 يوماً بالضبط تقع ضمن WARNING", () => {
    expect(expiryBucket(daysFromNow(180), NOW)).toBe("WARNING");
  });

  it("اليوم التالي مباشرة بعد الحافة 180 يقع ضمن OK", () => {
    const justAfter180 = new Date(daysFromNow(180).getTime() + 1);
    expect(expiryBucket(justAfter180, NOW)).toBe("OK");
  });

  it("تاريخ بعيد جداً يقع ضمن OK", () => {
    expect(expiryBucket(daysFromNow(400), NOW)).toBe("OK");
  });

  it("يعمل بنفس السلوك مع نص ISO", () => {
    expect(expiryBucket(daysFromNow(90).toISOString(), NOW)).toBe("CRITICAL");
  });
});

describe("deriveAvailability — التوفر الفعلي مقابل مفتاح العرض", () => {
  it("مُدرَج لكن الرصيد صفر → غير متوفر (إصلاح خطأ متوفر أثناء نفاد المخزون)", () => {
    expect(deriveAvailability({ isListed: true, sellableQuantity: 0 })).toBe(false);
  });

  it("غير مُدرَج رغم وجود رصيد → غير متوفر", () => {
    expect(deriveAvailability({ isListed: false, sellableQuantity: 50 })).toBe(false);
  });

  it("مُدرَج ولديه رصيد → متوفر", () => {
    expect(deriveAvailability({ isListed: true, sellableQuantity: 1 })).toBe(true);
  });
});

describe("isLowStock — نقص المخزون", () => {
  it("minStock = 0 يعني عدم ضبط حدّ، فلا يُبلَّغ نقصاً حتى لو كان الرصيد صفراً", () => {
    expect(isLowStock({ sellableQuantity: 0, minStock: 0 })).toBe(false);
  });

  it("الرصيد أقل من أو يساوي الحدّ → نقص", () => {
    expect(isLowStock({ sellableQuantity: 5, minStock: 5 })).toBe(true);
    expect(isLowStock({ sellableQuantity: 3, minStock: 5 })).toBe(true);
  });

  it("الرصيد أعلى من الحدّ → لا نقص", () => {
    expect(isLowStock({ sellableQuantity: 6, minStock: 5 })).toBe(false);
  });
});

describe("validateStockMove — التحقق من حركة المخزون", () => {
  it("يرفض كمية غير صحيحة (كسرية) أو صفرية أو سالبة", () => {
    expect(validateStockMove({ type: "RECEIPT", quantity: 2.5 }).ok).toBe(false);
    expect(validateStockMove({ type: "RECEIPT", quantity: 0 }).ok).toBe(false);
    expect(validateStockMove({ type: "RECEIPT", quantity: -3 }).ok).toBe(false);
  });

  it("يقبل استلام (RECEIPT) بلا حاجة لـ batchQuantity", () => {
    expect(validateStockMove({ type: "RECEIPT", quantity: 10 })).toEqual({ ok: true });
  });

  it("يرفض صرف (SHIPMENT) يتجاوز كمية الدفعة", () => {
    const result = validateStockMove({ type: "SHIPMENT", quantity: 11, batchQuantity: 10 });
    expect(result.ok).toBe(false);
  });

  it("يقبل صرف (DAMAGE) لا يتجاوز كمية الدفعة", () => {
    expect(validateStockMove({ type: "DAMAGE", quantity: 10, batchQuantity: 10 })).toEqual({
      ok: true,
    });
  });

  it("يرفض نوع حركة غير معروف", () => {
    expect(validateStockMove({ type: "TELEPORT", quantity: 1 }).ok).toBe(false);
  });
});
