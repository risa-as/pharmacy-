// إفراغ عدد الأشرطة للأقراص/الكبسولات التي جاء اقتراحها «شريط واحد».
//
// بطلب صريح من صاحب النظام. الأثر عملياً: هذه الأدوية تُسأل عن عددها عند أول
// دفعة بخانة فارغة بدل خانة معبّأة باقتراح — وهو ما كانت ستؤول إليه على أي حال
// بعد إضافة إشارة التأكيد، لكن بلا رقم مقترَح يسبق نظر الصيدلاني.
//
// ملاحظة للسجل: فحص الهامش (كلفة الشريط مقابل سعر بيعه) لم يُظهر خللاً منهجياً
// في هذه الشريحة — 2% منها منهار الهامش مقابل 5% في الأدوية باقتراح أكبر من 1.
// أي أن «شريط واحد» قيمة مشروعة شائعة، والإفراغ هنا احتياط لا تصحيح خطأ.
//
// يُفرِغ فقط ما لم يؤكّده صيدلاني (unitsPerPackConfirmedAt IS NULL) — التأكيد
// البشري لا يُمحى أبداً.
//
//   node scripts/clear-tablet-single-strip.mjs           # معاينة
//   node scripts/clear-tablet-single-strip.mjs --apply   # تنفيذ

import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

const UNIT_FORMS = /\b(syr|syrup|drop|cream|creem|gel|jel|oint|lotion|shampoo|soap|serum|spray|vial|amp|ampoule|inj|injection|supp|sachet|powder|milk|solution|susp|foam|patch|pen|kit)\b/i;
const STRIP_FORMS = /\b(tab|tablet|cap|capsule)\b/i;

async function main() {
    const candidates = await prisma.globalDrug.findMany({
        where: { unitsPerPack: 1, unitsPerPackConfirmedAt: null },
        select: { id: true, tradeName: true },
    });
    const targets = candidates.filter(
        (d) => STRIP_FORMS.test(d.tradeName) && !UNIT_FORMS.test(d.tradeName)
    );

    console.log(`أدوية باقتراح «شريط واحد» غير مؤكَّدة: ${candidates.length}`);
    console.log(`منها أقراص/كبسولات (ستُفرَّغ): ${targets.length}`);
    for (const t of targets.slice(0, 12)) console.log(`   ${t.tradeName}`);
    if (targets.length > 12) console.log(`   … و${targets.length - 12} غيرها`);

    if (!APPLY) {
        console.log('\n— معاينة فقط. أعد التشغيل مع --apply للتنفيذ.');
        return;
    }

    const r = await prisma.globalDrug.updateMany({
        where: { id: { in: targets.map((t) => t.id) }, unitsPerPackConfirmedAt: null },
        data: { unitsPerPack: null },
    });
    console.log(`\n✓ أُفرِغت ${r.count} قيمة.`);

    const after = await prisma.globalDrug.count({ where: { unitsPerPack: { not: null } } });
    console.log(`المتبقي يحمل عدد أشرطة: ${after} دواء.`);
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
