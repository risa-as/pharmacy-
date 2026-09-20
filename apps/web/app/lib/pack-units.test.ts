import { describe, it, expect } from "vitest";
import { toStripPrice, toPacketPrice } from "./pack-units";

describe("toStripPrice", () => {
    // قرار صاحب النظام 2026-09: كل أسعار المذاخر أسعار باكيت، فغياب إعلان
    // الوحدة لم يعد يعني «مجهول» بل يعني PACKET ضمناً. هذا الاختبار يحرس هذا
    // القرار تحديداً: priceUnit=null لا يوقف التحويل بذاته — لو أوقفه هنا رغم
    // معرفة التعبئة فهذا رجوع لسلوك UNDECLARED_PRICE_UNIT الملغى.
    it("يعامل الوحدة غير المعلَنة كباكيت — لا كحظر مستقل", () => {
        const r = toStripPrice({ price: 12000, priceUnit: null, drugUnitsPerPack: 10 });
        expect(r).toMatchObject({ ok: true, stripPrice: 1200, unitsPerPack: 10, converted: true });
    });

    // نفس المعنى بالضبط لكن بصياغة أخرى: التوثيق الصريح لقاعدة "PACKET
    // افتراضياً" المطلوبة في هذه الميزة — priceUnit=null + تعبئة معروفة = تحويل
    // ناجح بلا أي استثناء أو حظر.
    it("توثيق القاعدة: priceUnit=null مع unitsPerPack معروف يتحوّل بنجاح", () => {
        const r = toStripPrice({ price: 1200, priceUnit: null, drugUnitsPerPack: 2 });
        expect(r).toMatchObject({ ok: true, stripPrice: 600, unitsPerPack: 2, converted: true });
    });

    it("يمنع التحويل حين التعبئة غير معروفة، سواء أُعلنت PACKET أم لم تُعلَن الوحدة أصلاً", () => {
        for (const priceUnit of ["PACKET", null, undefined] as const) {
            const r = toStripPrice({ price: 12000, priceUnit, drugUnitsPerPack: null });
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe("UNKNOWN_UNITS_PER_PACK");
        }
    });

    it("يقسم على تعبئتنا حين تكون معروفة", () => {
        const r = toStripPrice({ price: 12000, priceUnit: "PACKET", drugUnitsPerPack: 10 });
        expect(r).toMatchObject({ ok: true, stripPrice: 1200, unitsPerPack: 10, converted: true });
    });

    it("يمرّر سعر الشريط كما هو بلا قسمة", () => {
        const r = toStripPrice({ price: 1200, priceUnit: "STRIP", drugUnitsPerPack: null });
        expect(r).toMatchObject({ ok: true, stripPrice: 1200, converted: false });
    });

    it("يعتمد تعبئة المذخر حين تغيب تعبئتنا", () => {
        const r = toStripPrice({
            price: 12000,
            priceUnit: "PACKET",
            drugUnitsPerPack: null,
            warehouseUnitsPerPack: 6,
        });
        expect(r).toMatchObject({ ok: true, stripPrice: 2000, unitsPerPack: 6 });
    });

    it("يوقف السطر عند تعارض التعبئتين بدل ترجيح إحداهما", () => {
        const r = toStripPrice({
            price: 12000,
            priceUnit: "PACKET",
            drugUnitsPerPack: 10,
            warehouseUnitsPerPack: 6,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe("UNITS_PER_PACK_CONFLICT");
    });

    it("يمرّر سطر البونص الصفري بلا اشتراط وحدة", () => {
        const r = toStripPrice({ price: 0, priceUnit: null, drugUnitsPerPack: null });
        expect(r).toMatchObject({ ok: true, stripPrice: 0 });
    });

    it("يرفض السعر السالب وغير المنتهي", () => {
        expect(toStripPrice({ price: -5, priceUnit: "STRIP", drugUnitsPerPack: 1 }).ok).toBe(false);
        expect(toStripPrice({ price: NaN, priceUnit: "STRIP", drugUnitsPerPack: 1 }).ok).toBe(false);
    });

    it("يتجاهل تعبئة غير صحيحة (صفر/كسر/سالب) فيعاملها كمجهولة", () => {
        for (const bad of [0, -3, 2.5]) {
            const r = toStripPrice({ price: 12000, priceUnit: "PACKET", drugUnitsPerPack: bad });
            expect(r.ok).toBe(false);
        }
    });
});

describe("toPacketPrice", () => {
    it("يشتق سعر الباكيت حين التعبئة معروفة", () => {
        expect(toPacketPrice(1200, 10)).toBe(12000);
    });
    it("يعيد null حين التعبئة مجهولة فلا يُخترَع رقم", () => {
        expect(toPacketPrice(1200, null)).toBeNull();
        expect(toPacketPrice(1200, 0)).toBeNull();
    });
});
