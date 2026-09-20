// تحميل عدد الأشرطة في الباكيت المستنتَج من دفعات «دار التفاؤل».
//
// القاعدة (بقرار صاحب النظام): في البدايات كان يُشترى باكيت واحد لكل دواء، فكمية
// أول دفعة في نافذة البدايات = عدد الأشرطة في الباكيت. الدفعات اللاحقة تُفحص:
// إن كانت مضاعفات للأساس فهي شراء عدة باكيتات (تأكيد)، وإن لم تكن فالأساس مشكوك
// فيه ويُستبعد.
//
// هذه القيم **مقترَحة لا مؤكَّدة**: نحو نصفها فقط دقيق. تُحمَّل كنقطة بداية يراها
// الصيدلاني ويصحّحها عند أول دفعة لكل دواء. لا تُكتب أي قيمة فوق قيمة موجودة.
//
//   node scripts/load-units-per-pack.mjs           # معاينة فقط
//   node scripts/load-units-per-pack.mjs --apply   # تنفيذ

import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const SOURCE_ORG = 'دار التفاؤل';
const EARLY_WINDOW_END = '2026-04'; // آخر شهر تنطبق عليه قاعدة «باكيت واحد»

const prisma = new PrismaClient();

/** أشكال صيدلانية وحدوية — علبتها وحدة واحدة فعلاً، فـ1 رقم معقول لها. */
const UNIT_FORMS = /\b(syr|syrup|drop|cream|creem|gel|jel|oint|lotion|shampoo|soap|serum|spray|vial|amp|ampoule|inj|injection|supp|sachet|powder|milk|solution|susp|foam|patch|pen|kit)\b/i;
/** أقراص وكبسولات — «شريط واحد في الباكيت» فيها مستبعَد غالباً. */
const STRIP_FORMS = /\b(tab|tablet|cap|capsule)\b/i;

async function classify() {
    const rows = await prisma.$queryRawUnsafe(
        `SELECT g.id, g.barcode, g."tradeName" AS name, g."unitsPerPack" AS existing,
                b."initialQuantity" AS q, to_char(b."createdAt",'YYYY-MM') AS m
         FROM "Batch" b
         JOIN "Inventory" i ON i.id = b."inventoryId"
         JOIN "Branch" br ON br.id = i."branchId"
         JOIN "Organization" o ON o.id = br."organizationId"
         JOIN "GlobalDrug" g ON g.id = i."drugId"
         WHERE o.name = $1 AND b."initialQuantity" > 0 AND g.barcode <> ''
         ORDER BY b."createdAt"`,
        SOURCE_ORG
    );

    const byDrug = new Map();
    for (const r of rows) {
        if (!byDrug.has(r.id)) byDrug.set(r.id, { name: r.name, existing: r.existing, list: [] });
        byDrug.get(r.id).list.push(r);
    }

    const accepted = [], skipped = { contradicted: 0, noBase: 0, alreadySet: 0 };
    for (const [id, e] of byDrug) {
        if (e.existing !== null) { skipped.alreadySet++; continue; }
        const qs = e.list.map(r => r.q);
        const first = e.list[0];
        const early = first.m <= EARLY_WINDOW_END;
        const uniq = new Set(qs);

        let base = null;
        if (early) base = first.q;
        else if (uniq.size === 1 && qs.length >= 2) base = qs[0];
        if (base === null || base <= 0) { skipped.noBase++; continue; }

        // الدفعات اللاحقة يجب أن تكون مضاعفات للأساس، وإلا فالأساس مشكوك فيه.
        const later = qs.slice(early ? 1 : 0);
        if (later.some(q => q % base !== 0)) { skipped.contradicted++; continue; }

        const isTablet = STRIP_FORMS.test(e.name) && !UNIT_FORMS.test(e.name);
        accepted.push({
            id, name: e.name, base,
            tier: later.length >= 2 ? 'أ' : 'ب',
            // أخطر شريحة: قرص/كبسولة باقتراح «شريط واحد» — معقول فيزيائياً لكن نادر.
            risky: isTablet && base === 1,
        });
    }
    return { accepted, skipped, total: byDrug.size };
}

async function main() {
    const { accepted, skipped, total } = await classify();
    const byTier = accepted.reduce((a, x) => ((a[x.tier] = (a[x.tier] ?? 0) + 1), a), {});
    const risky = accepted.filter(x => x.risky);

    console.log(`أدوية «${SOURCE_ORG}» ذات دفعات صالحة: ${total}`);
    console.log(`مقبولة للتحميل: ${accepted.length}  (أ: ${byTier['أ'] ?? 0}، ب: ${byTier['ب'] ?? 0})`);
    console.log(`مستبعَدة — كميات تناقض الأساس: ${skipped.contradicted}`);
    console.log(`مستبعَدة — بلا أساس (لا بداية مبكرة ولا تكرار): ${skipped.noBase}`);
    console.log(`متجاوَزة — لها قيمة محفوظة مسبقاً: ${skipped.alreadySet}`);
    console.log(`\nمنها شريحة خطرة (قرص/كبسولة باقتراح «شريط واحد»): ${risky.length}`);
    for (const r of risky.slice(0, 10)) console.log(`   ${r.name}`);
    if (risky.length > 10) console.log(`   … و${risky.length - 10} غيرها`);

    if (!APPLY) {
        console.log('\n— معاينة فقط. أعد التشغيل مع --apply للتنفيذ.');
        return;
    }

    // شرط where على unitsPerPack: null يمنع الكتابة فوق أي قيمة أُدخلت بين
    // المعاينة والتنفيذ — القيم المؤكَّدة من صيدلاني لا تُدهَس أبداً.
    let written = 0;
    for (const a of accepted) {
        const r = await prisma.globalDrug.updateMany({
            where: { id: a.id, unitsPerPack: null },
            data: { unitsPerPack: a.base },
        });
        written += r.count;
    }
    console.log(`\n✓ كُتبت ${written} قيمة.`);

    const after = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) FILTER (WHERE "unitsPerPack" IS NOT NULL)::int AS filled,
                COUNT(*)::int AS total FROM "GlobalDrug"`
    );
    console.log(`التحقق: ${after[0].filled} دواءً يحمل عدد أشرطة من أصل ${after[0].total}.`);
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
