// ميزة وحدة التسعير: تصنيف الشكل الصيدلاني من الاسم التجاري.
//
// الغرض واحد محدد: تمييز الأصناف التي **عبوتها وحدة واحدة بطبيعتها** (زجاجة
// شراب، أنبوب كريم، قطرة عين) عن التي تأتي علبةً فيها عدة وحدات (أقراص،
// كبسولات، أمبولات، أكياس). الأولى تعبئتها 1 يقيناً بلا فتح علبة، والثانية لا
// يعرف عددها إلا من يمسكها.
//
// لماذا من الاسم لا من حقل مستقل: لا يوجد حقل للشكل الصيدلاني في المخطط، وقياساً
// على 4,111 صنفاً غير مؤكَّد فإن الاسم يكشف الشكل في نحو 46% منها. الباقي
// (`Cardura 4mg`, `Rennie`) لا مصدر له إلا العلبة — وهذا حدّ معرفي لا نقص تحليل.
//
// منطق نقيّ بلا Prisma عمداً: vitest.config.ts يحمّل app/**/*.test.ts فقط.

export type DosageFormClass =
    /** عبوته وحدة واحدة — التعبئة 1 يقيناً. */
    | 'SINGLE_UNIT'
    /** يأتي علبةً فيها عدة وحدات — يحتاج عدّاً فعلياً. */
    | 'MULTI_UNIT'
    /** الاسم لا يذكر الشكل — لا حكم. */
    | 'UNKNOWN';

/**
 * أشكال الوحدة الواحدة: زجاجة، أنبوب، عبوة رذاذ… كلها تُباع كقطعة واحدة.
 *
 * `amp` مستبعد عمداً رغم أن الأمبولة تبدو وحدة: `Methycobal 500mcg 10amp` علبة
 * فيها عشر أمبولات، فافتراض 1 لها خطأ. وكذلك `vial` و`supp` و`sachet`.
 */
// ملاحظة على الحدّ الأيسر: `(?<![a-z])` لا `\b` — لأن `\b` لا يطابق بين رقم
// وحرف، فـ`100cap` و`10amp` و`3sachets` كانت تفلت من التصنيف وتُعامَل كأنّ
// شكلها غير مذكور، وهي من أكثر الصيغ وروداً في أسماء العلب.
const SINGLE_UNIT =
    /(?<![a-z])(syr|syrup|drop|drops|cream|creem|gel|jel|oint|ointment|lotion|shampoo|soap|serum|spray|solution|susp|suspension|powder|milk|foam|mouthwash|paste|toothpaste)\b/i;

/** أشكال تأتي عادةً علبةً متعددة الوحدات. */
const MULTI_UNIT =
    /(?<![a-z])(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|amp|amps|ampoule|sach|sachet|sachets|supp|suppos|suppository|vial|vials|inj|injection)\b/i;

/**
 * يصنّف الاسم التجاري. التداخل يُرجَّح لصالح MULTI_UNIT: اسم يذكر الشكلين معاً
 * (`Para-denk 250 suppos 10`) يعني علبة، وافتراض 1 له أخطر من تركه للعدّ —
 * خطأ التعبئة يضخّم الكلفة، بينما غياب التعبئة يوقف التسجيل للمراجعة فقط.
 */
export function classifyDosageForm(tradeName: string): DosageFormClass {
    const name = tradeName ?? '';
    if (MULTI_UNIT.test(name)) return 'MULTI_UNIT';
    if (SINGLE_UNIT.test(name)) return 'SINGLE_UNIT';
    return 'UNKNOWN';
}

/** التعبئة المعروفة سلفاً من الشكل وحده — 1 للوحدوي، وnull لما عداه. */
export function unitsFromDosageForm(tradeName: string): number | null {
    return classifyDosageForm(tradeName) === 'SINGLE_UNIT' ? 1 : null;
}
