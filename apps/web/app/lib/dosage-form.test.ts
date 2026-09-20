import { describe, it, expect } from "vitest";
import { classifyDosageForm, unitsFromDosageForm } from "./dosage-form";

describe("classifyDosageForm", () => {
    it("يصنّف الأشكال الوحدوية — زجاجة أو أنبوب أو عبوة واحدة", () => {
        for (const n of [
            "Dora syr",
            "AERIUS syrup اصلي",
            "Pacroma cream",
            "albendazole oral susp 20ml WRC",
            "Piofresh 0.2% 10ml eye drop",
            "Olfen 1% gel",
            "Povidone solution",
        ]) {
            expect(classifyDosageForm(n)).toBe("SINGLE_UNIT");
        }
    });

    it("يصنّف الأشكال متعددة الوحدات", () => {
        for (const n of [
            "Amaryl 3mg tab sanofi",
            "Sefarin 300mg cap",
            "Methycobal 500mcg 10amp",
            "Mubact 4mg-30 Sachets",
            "Gestophil 400 supp",
            "vancomycin vial 500mg",
        ]) {
            expect(classifyDosageForm(n)).toBe("MULTI_UNIT");
        }
    });

    // الأمبولة تبدو وحدة واحدة، لكن العلبة قد تحوي عشراً — الافتراض هنا يضخّم
    // الكلفة عشرة أضعاف، فتُعامَل متعددةً ويُعدّها الصيدلاني.
    it("لا يعدّ الأمبولة والتحميلة والكيس أشكالاً وحدوية", () => {
        expect(classifyDosageForm("Nefopam amp")).toBe("MULTI_UNIT");
        expect(classifyDosageForm("Adol 125 supp")).toBe("MULTI_UNIT");
        expect(classifyDosageForm("Uroday 3g 3sachets")).toBe("MULTI_UNIT");
    });

    // التداخل يُرجَّح لصالح المتعدد: خطأ التعبئة يضخّم الكلفة، وغيابها يوقف
    // التسجيل للمراجعة فقط — والثاني أهون.
    it("يرجّح المتعدد عند ذكر الشكلين معاً", () => {
        expect(classifyDosageForm("Para-denk 250 suppos 10")).toBe("MULTI_UNIT");
        expect(classifyDosageForm("amoxicillin susp 100cap")).toBe("MULTI_UNIT");
    });

    it("لا يحكم على اسم لا يذكر الشكل", () => {
        for (const n of ["Cardura 4mg", "Lipanthyl 200mg", "Rennie", ""]) {
            expect(classifyDosageForm(n)).toBe("UNKNOWN");
        }
    });

    it("unitsFromDosageForm يعطي 1 للوحدوي فقط", () => {
        expect(unitsFromDosageForm("Dora syr")).toBe(1);
        expect(unitsFromDosageForm("Amaryl 3mg tab")).toBeNull();
        expect(unitsFromDosageForm("Cardura 4mg")).toBeNull();
    });
});
