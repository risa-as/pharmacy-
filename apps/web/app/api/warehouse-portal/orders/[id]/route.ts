export const dynamic = 'force-dynamic';

// المرحلة 3 من ميزة المذاخر: تفاصيل طلب واحد في بوابة المذخر (قراءة فقط).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { buildAlternativesByItemId } from '@/app/lib/warehouse-order-alternatives';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewOrders');
        if (!gate.ok) return gate.response;

        const order = await prisma.warehouseOrder.findFirst({
            where: { id: params.id, warehouseId: ctx.warehouseId },
            include: {
                branch: { select: { name: true } },
                items: {
                    include: {
                        drug: {
                            select: { tradeName: true, barcode: true, scientificName: true, alternatives: true },
                        },
                    },
                    orderBy: { id: 'asc' },
                },
                events: { orderBy: { createdAt: 'asc' } },
            },
        });
        if (!order) {
            return NextResponse.json({ error: 'الطلب غير موجود في صندوق مذخرك' }, { status: 404 });
        }

        // ميزة البونص: نفس دمج قاعدة الكتالوج المستخدَم في app/warehouse/orders/page.tsx
        // (اقتراح أولي فقط في شاشة المراجعة — لا تخزين ولا فرض). هذا المسار
        // يُستدعى من refreshOne في OrdersClient.tsx بعد إرسال العرض، فيجب أن
        // يحمل نفس الحقلين المُضافين هناك كي لا تفقد الشاشة الاقتراح بعد التحديث.
        const barcodes = Array.from(new Set(order.items.map((it) => it.drug.barcode)));
        const bonusRules =
            barcodes.length > 0
                ? await prisma.warehouseCatalogItem.findMany({
                      where: { warehouseId: ctx.warehouseId, barcode: { in: barcodes } },
                      select: { barcode: true, bonusThreshold: true, bonusQuantity: true },
                  })
                : [];
        const bonusRuleByBarcode = new Map(bonusRules.map((r) => [r.barcode, r]));

        // المرحلة 4 (بدائل الدواء): دالة مشتركة مع app/warehouse/orders/page.tsx
        // (انظر app/lib/warehouse-order-alternatives.ts لسبب اشتراكهما تحديداً —
        // نفس فخ ميزة البونص أعلاه بالضبط، لا نكرّره لميزة جديدة). بما أن
        // GlobalDrug.alternatives فارغ في كل صفوف الإنتاج اليوم (انظر تعليق ملف
        // warehouse-alternatives.ts)، الخريطة الناتجة ستكون [] لكل الأصناف عملياً
        // الآن بلا أي استعلام إضافي فعلي — الحقل يبقى معطَّلاً بصمت لا أن يُخطئ.
        const alternativesByItemId = await buildAlternativesByItemId(prisma, ctx.warehouseId, order.items);

        const orderWithBonusRule = {
            ...order,
            items: order.items.map((it) => ({
                ...it,
                catalogBonusThreshold: bonusRuleByBarcode.get(it.drug.barcode)?.bonusThreshold ?? 0,
                catalogBonusQuantity: bonusRuleByBarcode.get(it.drug.barcode)?.bonusQuantity ?? 0,
                // تُحسَب لكل صنف بصرف النظر عن حالته المخزَّنة حالياً — الحكم
                // بالنفاد نفسه يبدأ محلياً في ReviewModal (OrdersClient.tsx) قبل أي
                // حفظ على الخادم، فيجب أن تكون البدائل جاهزة فوراً عند التبديل إلى
                // "نافد" في الواجهة لا فقط بعد إرسال العرض. الواجهة هي من تقرر متى
                // تعرضها فعلياً (عند decision === "OUT_OF_STOCK" محلياً).
                alternatives: alternativesByItemId.get(it.id) ?? [],
            })),
        };

        return NextResponse.json({ order: orderWithBonusRule });
    } catch (e: any) {
        console.error('warehouse-portal order GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب الطلب' }, { status: 500 });
    }
}
