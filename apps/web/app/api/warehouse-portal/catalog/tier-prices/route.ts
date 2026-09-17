export const dynamic = 'force-dynamic';

// المرحلة 5 (الصقل التجاري) §Part 2: إدارة أسعار الشرائح لكل صنف من كتالوج
// المذخر. resolveTierPrice() في app/lib/warehouse-pricing.ts هي القاعدة
// النقية الوحيدة التي تقرر أي سعر تراه صيدلية معيّنة — هذا المسار لا يفعل
// أكثر من الكتابة/القراءة/الحذف على WarehouseCatalogPrice.
//
// تطبيع اسم الشريحة (trim + uppercase) عند الكتابة هنا فقط — يمنع تراكم
// صفّين لنفس الشريحة فعلياً بحالة أحرف مختلفة تحت @@unique([catalogItemId,
// tier]) الحساس لحالة الأحرف (resolveTierPrice يقارن بلا حساسية لحالة
// الأحرف من جهته، لكن هذا لا يمنع الازدواج في التخزين نفسه).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

function normalizeTier(tier: string): string {
    return tier.trim().toUpperCase();
}

// GET ?catalogItemId=... — كل أسعار الشرائح لصنف واحد.
export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canEditPricing');
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const catalogItemId = searchParams.get('catalogItemId');
        if (!catalogItemId) {
            return NextResponse.json({ error: 'catalogItemId مطلوب' }, { status: 400 });
        }

        const item = await prisma.warehouseCatalogItem.findFirst({
            where: { id: catalogItemId, warehouseId: ctx.warehouseId },
            select: { id: true },
        });
        if (!item) {
            return NextResponse.json({ error: 'الصنف غير موجود في كتالوج مذخرك' }, { status: 404 });
        }

        const tierPrices = await prisma.warehouseCatalogPrice.findMany({
            where: { catalogItemId },
            orderBy: { tier: 'asc' },
        });

        return NextResponse.json({ tierPrices });
    } catch (e: any) {
        console.error('warehouse-portal tier-prices GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب أسعار الشرائح' }, { status: 500 });
    }
}

// POST: إنشاء/تعديل سعر شريحة — { catalogItemId, tier, price }
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

        const catalogItemId: string | undefined = body.catalogItemId;
        const tierRaw = typeof body.tier === 'string' ? body.tier.trim() : '';
        const price = Number(body.price);

        if (!catalogItemId) {
            return NextResponse.json({ error: 'catalogItemId مطلوب' }, { status: 400 });
        }
        if (!tierRaw) {
            return NextResponse.json({ error: 'اسم شريحة التسعير مطلوب' }, { status: 400 });
        }
        if (!Number.isFinite(price) || price <= 0) {
            return NextResponse.json({ error: 'سعر الشريحة يجب أن يكون رقماً موجباً — الأصفار والسالب تُرفض هنا صراحة.' }, { status: 400 });
        }

        const item = await prisma.warehouseCatalogItem.findFirst({
            where: { id: catalogItemId, warehouseId: ctx.warehouseId },
            select: { id: true },
        });
        if (!item) {
            return NextResponse.json({ error: 'الصنف غير موجود في كتالوج مذخرك' }, { status: 404 });
        }

        const tier = normalizeTier(tierRaw);

        const tierPrice = await prisma.warehouseCatalogPrice.upsert({
            where: { catalogItemId_tier: { catalogItemId, tier } },
            update: { price },
            create: { catalogItemId, tier, price },
        });

        return NextResponse.json({ tierPrice }, { status: 201 });
    } catch (e: any) {
        console.error('warehouse-portal tier-prices POST error:', e);
        return NextResponse.json({ error: 'فشل في حفظ سعر الشريحة' }, { status: 500 });
    }
}

// DELETE ?id=... — إعادة الصنف لسعر القائمة لهذه الشريحة.
export async function DELETE(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canEditPricing');
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id مطلوب' }, { status: 400 });

        // الملكية: سعر الشريحة يجب أن يتبع صنفاً في كتالوج مذخر الفاعل حصراً.
        const existing = await prisma.warehouseCatalogPrice.findFirst({
            where: { id, catalogItem: { warehouseId: ctx.warehouseId } },
            select: { id: true },
        });
        if (!existing) {
            return NextResponse.json({ error: 'سعر الشريحة غير موجود ضمن كتالوج مذخرك' }, { status: 404 });
        }

        await prisma.warehouseCatalogPrice.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        console.error('warehouse-portal tier-prices DELETE error:', e);
        return NextResponse.json({ error: 'فشل في حذف سعر الشريحة' }, { status: 500 });
    }
}
