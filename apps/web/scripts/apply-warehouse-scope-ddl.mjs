// تطبيق DDL ميزة نطاق المذخر على GlobalDrug.
//
// تعديل إضافي بالكامل: عمود nullable بلا قيمة افتراضية ولا تعبئة رجعية، ففي
// كل صف قائم يصير warehouseId = NULL وكل استعلام قائم يعيد نفس نتيجته.
//
//   node scripts/apply-warehouse-scope-ddl.mjs           # معاينة فقط
//   node scripts/apply-warehouse-scope-ddl.mjs --apply   # تنفيذ
//
// يتصل باتصال Neon المباشر (بلا -pooler) لأن pgbouncer في وضع المعاملات لا يصلح
// لتنفيذ DDL متعدد داخل معاملة واحدة. السكربت يتوقف من تلقاء نفسه إن كان
// العمود مطبَّقاً مسبقاً، فتشغيله مرتين غير ضار.

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

const STATEMENTS = [
    `ALTER TABLE "GlobalDrug" ADD COLUMN "warehouseId" TEXT`,
    // قيد منفصل عن @@unique([barcode, organizationId]) بقصد: Postgres يعتبر NULL
    // مميزاً، فدمج العمودين في قيد واحد كان سيُفقد صفوف المؤسسات حمايتها بصمت.
    `CREATE UNIQUE INDEX "GlobalDrug_barcode_warehouseId_key" ON "GlobalDrug"("barcode", "warehouseId")`,
    `CREATE INDEX "GlobalDrug_warehouseId_idx" ON "GlobalDrug"("warehouseId")`,
    `ALTER TABLE "GlobalDrug" ADD CONSTRAINT "GlobalDrug_warehouseId_fkey"
       FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
];

const prisma = new PrismaClient({
    datasources: { db: { url: directUrl(process.env.DATABASE_URL) } },
});

async function columnExists() {
    const r = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM information_schema.columns
         WHERE table_name = 'GlobalDrug' AND column_name = 'warehouseId'`);
    return r[0].n > 0;
}

async function main() {
    const before = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE "organizationId" IS NULL)::int AS global,
                COUNT(*) FILTER (WHERE "organizationId" IS NOT NULL)::int AS "orgPrivate"
         FROM "GlobalDrug"`);
    console.log('قبل:', before[0]);

    if (await columnExists()) {
        console.log('\nالعمود warehouseId مطبَّق مسبقاً — لا شيء لفعله.');
        return;
    }

    console.log('\nالعبارات المزمع تنفيذها:');
    STATEMENTS.forEach((s, i) => console.log(`  ${i + 1}. ${s.replace(/\s+/g, ' ').trim()}`));

    if (!APPLY) {
        console.log('\n— معاينة فقط. أعد التشغيل مع --apply للتنفيذ.');
        return;
    }

    // معاملة واحدة: إما أن تُطبَّق العبارات الأربع كلها أو لا شيء منها.
    await prisma.$transaction(STATEMENTS.map((s) => prisma.$executeRawUnsafe(s)));
    console.log('\n✓ طُبِّقت العبارات الأربع.');

    const after = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE "warehouseId" IS NULL)::int AS "scopeNull",
                COUNT(*) FILTER (WHERE "warehouseId" IS NOT NULL)::int AS "scopeSet"
         FROM "GlobalDrug"`);
    console.log('بعد:', after[0]);

    const idx = await prisma.$queryRawUnsafe(
        `SELECT indexname FROM pg_indexes
         WHERE tablename = 'GlobalDrug' AND indexname LIKE '%warehouseId%' ORDER BY indexname`);
    console.log('الفهارس المُنشأة:', idx.map((r) => r.indexname).join(', '));
}

main()
    .catch((e) => { console.error('فشل:', e.message?.split('\n')[0] ?? e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
