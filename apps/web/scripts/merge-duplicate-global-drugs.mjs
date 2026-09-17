// دمج الصفوف العالمية المكرّرة في GlobalDrug.
//
// لماذا وُجدت أصلاً: @@unique([barcode, organizationId]) لا يحرس الصفوف العالمية
// إطلاقاً — كلا عمودي النطاق NULL، وPostgres يعتبر NULL مميزاً، فلا يقع P2002.
// أُغلقت الثغرة في الكود (createGlobalDrug/updateGlobalDrug في app/lib/actions/drug.ts)
// فلن تُنشأ صفوف مكرّرة جديدة؛ هذا السكربت لتنظيف ما دخل قبل الإغلاق.
//
// الاستعمال:
//   node scripts/merge-duplicate-global-drugs.mjs            # معاينة فقط (افتراضي)
//   node scripts/merge-duplicate-global-drugs.mjs --apply    # تنفيذ فعلي
//
// آلية الدمج: يبقى أقدم صف (الأصل) وتُحوَّل إليه كل المراجع من الصفوف الأحدث ثم
// تُحذف. كل التحويل والحذف داخل معاملة واحدة — إما أن ينجح كاملاً أو لا شيء.
//
// ⚠ قبل التنفيذ: خذ نسخة احتياطية. هذا يُعدّل بنود مبيعات فعلية على قاعدة حيّة
// يعمل عليها أكثر من عميل.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// الجداول التي تشير إلى GlobalDrug.id — لو أُضيف جدول جديد يشير إليه لاحقاً
// فيجب إضافته هنا، وإلا فشل الحذف بخطأ مفتاح أجنبي (فشل صاخب لا صامت — مقصود).
const REFERENCING = [
    ['Inventory', 'drugId'],
    ['SaleItem', 'drugId'],
    ['PurchaseItem', 'drugId'],
    ['SaleReturnItem', 'drugId'],
    ['TransferItem', 'drugId'],
    ['WarehouseOrderItem', 'drugId'],
    ['MarketplaceListing', 'drugId'],
    ['PatientAppOrderItem', 'drugId'],
    ['DemandForecast', 'drugId'],
    ['WarehouseCatalogItem', 'drugId'],
];

async function main() {
    const dupes = await prisma.$queryRawUnsafe(`
        SELECT barcode, COUNT(*)::int AS n FROM "GlobalDrug"
        WHERE "organizationId" IS NULL AND "warehouseId" IS NULL
        GROUP BY barcode HAVING COUNT(*) > 1 ORDER BY barcode`);

    if (dupes.length === 0) {
        console.log('لا توجد صفوف عالمية مكرّرة. لا شيء لفعله.');
        return;
    }

    console.log(`باركودات مكرّرة عالمياً: ${dupes.length}\n`);

    for (const { barcode } of dupes) {
        const rows = await prisma.$queryRawUnsafe(`
            SELECT id, "tradeName", "scientificName", "createdAt"
            FROM "GlobalDrug"
            WHERE "organizationId" IS NULL AND "warehouseId" IS NULL AND barcode = $1
            ORDER BY "createdAt" ASC`, barcode);

        const [keep, ...drop] = rows;
        console.log(`── ${barcode}`);
        console.log(`   يبقى : ${keep.id}  «${keep.tradeName}»  (${keep.createdAt.toISOString().slice(0, 10)})`);

        for (const d of drop) {
            const counts = {};
            for (const [table, col] of REFERENCING) {
                const r = await prisma.$queryRawUnsafe(
                    `SELECT COUNT(*)::int AS n FROM "${table}" WHERE "${col}" = $1`, d.id);
                if (r[0].n > 0) counts[table] = r[0].n;
            }
            const summary = Object.entries(counts).map(([t, n]) => `${t}=${n}`).join(' ') || 'بلا مراجع';
            console.log(`   يُدمج: ${d.id}  «${d.tradeName}»  → ${summary}`);

            if (!APPLY) continue;

            await prisma.$transaction(async (tx) => {
                for (const [table, col] of REFERENCING) {
                    await tx.$executeRawUnsafe(
                        `UPDATE "${table}" SET "${col}" = $1 WHERE "${col}" = $2`, keep.id, d.id);
                }
                await tx.$executeRawUnsafe(`DELETE FROM "GlobalDrug" WHERE id = $1`, d.id);
            });
            console.log(`   ✓ دُمج وحُذف`);
        }
        console.log();
    }

    if (!APPLY) {
        console.log('— معاينة فقط. أعد التشغيل مع --apply للتنفيذ الفعلي.');
    }
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
