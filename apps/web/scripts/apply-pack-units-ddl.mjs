// تطبيق DDL ميزة وحدة التسعير.
//
// إضافي بالكامل: أربعة أعمدة nullable بلا قيمة افتراضية وبلا أي تعبئة رجعية.
// كل صف قائم يصير NULL في هذه الأعمدة، وكل استعلام قائم يعيد نفس نتيجته.
//
// **لا يكتب هذا السكربت أي قيمة لعدد الأشرطة في الباكيت** — بقرار صريح من صاحب
// النظام: الأرقام تُراجَع معه أولاً، ولا تُخمَّن ولا تُشتق من نِسَب الأسعار.
// السلوك المقصود اليوم هو أن يبقى كل شيء NULL فتتوقّف مسارات الكلفة للمراجعة
// بدل تسجيل رقم غير موثوق — انظر app/lib/pack-units.ts.
//
//   node scripts/apply-pack-units-ddl.mjs           # معاينة فقط
//   node scripts/apply-pack-units-ddl.mjs --apply   # تنفيذ
//
// يتصل باتصال Neon المباشر (بلا -pooler): pgbouncer في وضع المعاملات لا يصلح
// لتنفيذ DDL متعدد داخل معاملة واحدة. IF NOT EXISTS يجعل تكرار التشغيل غير ضار.

import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');

/** Neon: المضيف المجمَّع يحمل لاحقة -pooler؛ المباشر هو نفسه بلا اللاحقة. */
function directUrl(pooled) {
    const u = new URL(pooled);
    u.hostname = u.hostname.replace('-pooler', '');
    for (const k of ['pgbouncer', 'connection_limit', 'pool_timeout']) {
        u.searchParams.delete(k);
    }
    return u.toString();
}

const COLUMNS = [
    ['GlobalDrug', 'unitsPerPack', 'INTEGER'],
    // NULL = لم يؤكّده صيدلاني بعد. يبقى NULL للقيم المستنتَجة المحمَّلة، فهي
    // مقترحات لا تأكيدات — انظر load-units-per-pack.mjs.
    ['GlobalDrug', 'unitsPerPackConfirmedAt', 'TIMESTAMP(3)'],
    ['WarehouseCatalogItem', 'priceUnit', 'TEXT'],
    ['WarehouseCatalogItem', 'unitsPerPack', 'INTEGER'],
    ['WarehouseOrder', 'priceUnit', 'TEXT'],
];

const prisma = new PrismaClient({
    datasources: { db: { url: directUrl(process.env.DATABASE_URL) } },
});

async function missingColumns() {
    const out = [];
    for (const [table, column, type] of COLUMNS) {
        const r = await prisma.$queryRawUnsafe(
            `SELECT COUNT(*)::int AS n FROM information_schema.columns
             WHERE table_name = $1 AND column_name = $2`,
            table,
            column
        );
        if (r[0].n === 0) out.push([table, column, type]);
    }
    return out;
}

async function main() {
    const missing = await missingColumns();
    if (missing.length === 0) {
        console.log('كل الأعمدة مطبَّقة مسبقاً — لا شيء لتنفيذه.');
        return;
    }
    console.log('الأعمدة الناقصة:');
    for (const [t, c, ty] of missing) console.log(`  ALTER TABLE "${t}" ADD COLUMN "${c}" ${ty};`);

    if (!APPLY) {
        console.log('\nمعاينة فقط. أعد التشغيل مع --apply للتنفيذ.');
        return;
    }

    await prisma.$transaction(
        missing.map(([t, c, ty]) =>
            prisma.$executeRawUnsafe(`ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "${c}" ${ty}`)
        )
    );
    console.log('\nتم التنفيذ. التحقق:');

    const still = await missingColumns();
    if (still.length > 0) {
        console.error('أعمدة لم تُضَف:', still);
        process.exitCode = 1;
        return;
    }
    // تحقّق صريح من أن شيئاً لم يُعبَّأ: كل القيم يجب أن تكون NULL.
    const filled = await prisma.$queryRawUnsafe(
        `SELECT
           (SELECT COUNT(*)::int FROM "GlobalDrug" WHERE "unitsPerPack" IS NOT NULL) AS drugs,
           (SELECT COUNT(*)::int FROM "WarehouseCatalogItem" WHERE "priceUnit" IS NOT NULL OR "unitsPerPack" IS NOT NULL) AS catalog,
           (SELECT COUNT(*)::int FROM "WarehouseOrder" WHERE "priceUnit" IS NOT NULL) AS orders`
    );
    console.log(`  أعمدة موجودة: نعم (${COLUMNS.length}/${COLUMNS.length})`);
    // ملاحظة: drugs لم يعد صفراً بالضرورة — حُمِّلت قيم مستنتَجة لاحقاً عبر
    // load-units-per-pack.mjs. المهم أن هذا السكربت نفسه لا يكتب أي قيمة.
    console.log('  صفوف تحمل قيمة (هذا السكربت لا يكتب أي قيمة):', JSON.stringify(filled[0]));
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
