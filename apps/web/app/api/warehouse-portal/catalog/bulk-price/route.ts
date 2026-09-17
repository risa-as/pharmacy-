export const dynamic = 'force-dynamic';

// المرحلة 5 (الصقل التجاري) §Part 3: تعديل سعر جماعي (نسبة أو مبلغ ثابت) على
// أصناف مُحدَّدة من الكتالوج، أو الكتالوج كله. applyBulkPriceChange() النقيّة
// في app/lib/warehouse-pricing.ts تحسب السعر الجديد وترفض أي نتيجة <= 0؛ هذا
// المسار كل-أو-لا-شيء: لو رفض أي صنف واحد يفشل الطلب كاملاً باسم الأصناف
// الرافضة، بلا أي كتابة جزئية — نفس ثقافة رسالة "الشحّة" في مسار الشحن.
// هذه عملية تسعير بحتة: لا تُسجَّل أي حركة في WarehouseStockMove.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { applyBulkPriceChange, type BulkPriceChangeMode } from '@/app/lib/warehouse-pricing';

export async function POST(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canEditPricing');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const mode: BulkPriceChangeMode = body.mode;
        const value = Number(body.value);
        const roundTo = body.roundTo !== undefined ? Number(body.roundTo) : undefined;
        // itemIds غير مُرسَل أو فارغ = الكتالوج كله.
        const itemIds: string[] | undefined =
            Array.isArray(body.itemIds) && body.itemIds.length > 0 ? body.itemIds.filter((x: any) => typeof x === 'string') : undefined;

        if (mode !== 'PERCENT' && mode !== 'AMOUNT') {
            return NextResponse.json({ error: 'mode يجب أن يكون PERCENT أو AMOUNT' }, { status: 400 });
        }
        if (!Number.isFinite(value)) {
            return NextResponse.json({ error: 'قيمة التعديل مطلوبة ويجب أن تكون رقماً صالحاً' }, { status: 400 });
        }

        // النطاق: أصناف مذخر الفاعل حصراً — id.in يُطابَق داخل هذا النطاق فقط،
        // لا يُوثَق بمعرّفات الجسم وحدها (id قد ينتمي لكتالوج مذخر آخر).
        const items = await prisma.warehouseCatalogItem.findMany({
            where: { warehouseId: ctx.warehouseId, ...(itemIds ? { id: { in: itemIds } } : {}) },
            select: { id: true, price: true, drug: { select: { tradeName: true } } },
        });

        if (items.length === 0) {
            return NextResponse.json({ error: 'لا توجد أصناف مطابقة لتطبيق التعديل عليها' }, { status: 400 });
        }

        const computed: Array<{ id: string; newPrice: number }> = [];
        const rejected: Array<{ tradeName: string; error: string }> = [];

        for (const item of items) {
            const result = applyBulkPriceChange({ currentPrice: item.price, mode, value, roundTo });
            if (!result.ok) {
                rejected.push({ tradeName: item.drug.tradeName, error: result.error });
                continue;
            }
            computed.push({ id: item.id, newPrice: result.newPrice });
        }

        // كل-أو-لا-شيء: أي صنف واحد مرفوض يوقف العملية كاملة بلا أي كتابة —
        // لا نُطبِّق التعديل على الأصناف "الآمنة" ونتجاهل البقية صامتين.
        if (rejected.length > 0) {
            const detail = rejected.map((r) => `${r.tradeName} (${r.error})`).join('، ');
            return NextResponse.json(
                {
                    error: `تعذّر تطبيق التعديل — الأصناف التالية سينتج عنها سعر غير صالح: ${detail}.`,
                    rejected,
                },
                { status: 400 }
            );
        }

        // الكتابة: عمليات مستقلة بلا أي تبعية بينية — الشكل المصفوفي لـ
        // $transaction (وليس دالة تفاعلية async) كي لا يُقارَب سقف المهلة
        // التفاعلية الافتراضي (5 ثوانٍ) مع كتالوج يصل إلى 500 صنف دفعة واحدة.
        await prisma.$transaction(
            computed.map((c) => prisma.warehouseCatalogItem.update({ where: { id: c.id }, data: { price: c.newPrice } }))
        );

        return NextResponse.json({ updated: computed.length });
    } catch (e: any) {
        console.error('warehouse-portal bulk-price POST error:', e);
        return NextResponse.json({ error: 'فشل في تطبيق التعديل الجماعي' }, { status: 500 });
    }
}
