export const dynamic = 'force-dynamic';

// ميزة وحدة التسعير — الطبقة ٢: آخر كلفة مسجَّلة لدواء، لتعبئة نموذج الدفعة.
//
// لماذا **لكل دواء** لا لكل (دواء، مورد): عند فتح نموذج إضافة دفعة لا يكون
// المورد مختاراً بعد (يُختار يدوياً من قائمة، ولا يُملأ تلقائياً) — فالمفتاح
// الوحيد المتاح لحظة الفتح هو الدواء. التقييد بالمورد كان سيجعل التعبئة فارغة
// دائماً في اللحظة التي تُفيد فيها.
//
// الوحدة: costPrice في Batch هو **سعر الشريط** في كل بيانات النظام القائمة،
// فما يُعاد هنا سعر شريط ويُوسَم كذلك صراحةً. سعر الباكيت المشتق يُعاد فقط إن
// كان unitsPerPack معروفاً — وهو NULL في كل الصفوف حالياً بقرار صريح، فيُعاد
// null ولا يُخترَع رقم.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { resolveHistoryScope } from '@/app/lib/supplier-price-history';
import { toPacketPrice } from '@/app/lib/pack-units';

export async function GET(req: NextRequest) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    try {
        const scope = await resolveHistoryScope(tenantCtx);
        if (!scope) return NextResponse.json({ error: 'لا يوجد نطاق مؤسسة صالح.' }, { status: 403 });

        const { searchParams } = new URL(req.url);
        const inventoryId = (searchParams.get('inventoryId') || '').trim();
        if (!inventoryId) return NextResponse.json({ error: 'inventoryId مطلوب' }, { status: 400 });

        // التقييد بفروع النطاق هو حارس العزل بين المؤسسات — لا يكفي معرّف صف
        // المخزون وحده لأنه معرّف عالمي يُخمَّن.
        const inventory = await prisma.inventory.findFirst({
            where: { id: inventoryId, branchId: { in: scope.branchIds } },
            select: {
                drugId: true,
                price: true,
                drug: { select: { unitsPerPack: true, unitsPerPackConfirmedAt: true } },
            },
        });
        if (!inventory) return NextResponse.json({ error: 'صف المخزون غير موجود.' }, { status: 404 });

        const lastBatch = await prisma.batch.findFirst({
            where: {
                inventory: { drugId: inventory.drugId, branchId: { in: scope.branchIds } },
                costPrice: { gt: 0 }, // دفعة بونص بكلفة صفر ليست مرجعاً للسعر
            },
            orderBy: { createdAt: 'desc' },
            select: {
                costPrice: true,
                createdAt: true,
                supplier: { select: { name: true } },
            },
        });

        const unitsPerPack = inventory.drug.unitsPerPack ?? null;
        // التمييز بين «رقم موجود» و«رقم تحقّق منه إنسان». الرقم المستنتَج من
        // الدفعات القديمة موجود وغير مؤكَّد، ونحو نصفه غير دقيق — فعرضه بلا هذا
        // التمييز يجعل الصيدلاني يحفظه دون نظر فيصير الخطأ مُوقَّعاً باسمه.
        const unitsPerPackConfirmed = inventory.drug.unitsPerPackConfirmedAt !== null;
        return NextResponse.json({
            // سعر البيع الحالي للشريط — يُعرض للمقارنة لا للتعبئة.
            sellPrice: inventory.price,
            unitsPerPack,
            unitsPerPackConfirmed,
            lastCost: lastBatch
                ? {
                      stripPrice: lastBatch.costPrice,
                      // null حين التعبئة مجهولة — تُعرض حينها خانة سعر الشريط وحدها.
                      packetPrice: toPacketPrice(lastBatch.costPrice, unitsPerPack),
                      recordedAt: lastBatch.createdAt.toISOString(),
                      supplierName: lastBatch.supplier?.name ?? null,
                  }
                : null,
        });
    } catch (e) {
        console.error('inventory last-cost GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب آخر كلفة مسجّلة' }, { status: 500 });
    }
}
