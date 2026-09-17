export const dynamic = 'force-dynamic';

// المرحلة ب من ميزة تتبّع مخزون المذخر: سجل تدقيق حركات المخزون لصنف واحد —
// ?catalogItemId= إلزامي، الأحدث أولاً، صفحات عبر take/skip (نفس نمط
// app/api/warehouse-portal/orders/route.ts).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

// GET: حركات صنف من كتالوج مذخري حصراً — ?catalogItemId=&take=&skip=
export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewStock');
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const catalogItemId = searchParams.get('catalogItemId');
        if (!catalogItemId) {
            return NextResponse.json({ error: 'catalogItemId مطلوب' }, { status: 400 });
        }

        const take = Math.min(Number(searchParams.get('take') || 50) || 50, 200);
        const skip = Math.max(Number(searchParams.get('skip') || 0) || 0, 0);

        // الملكية: الصنف يجب أن ينتمي لكتالوج مذخر الفاعل حصراً قبل الكشف عن أي حركة.
        const catalogItem = await prisma.warehouseCatalogItem.findFirst({
            where: { id: catalogItemId, warehouseId: ctx.warehouseId },
            select: { id: true },
        });
        if (!catalogItem) {
            return NextResponse.json({ error: 'الصنف غير موجود في كتالوج مذخرك' }, { status: 404 });
        }

        const [moves, total] = await Promise.all([
            prisma.warehouseStockMove.findMany({
                where: { catalogItemId: catalogItem.id },
                include: { batch: { select: { batchNumber: true } } },
                orderBy: { createdAt: 'desc' },
                take,
                skip,
            }),
            prisma.warehouseStockMove.count({ where: { catalogItemId: catalogItem.id } }),
        ]);

        return NextResponse.json({ moves, total, take, skip });
    } catch (e: any) {
        console.error('warehouse-portal stock moves GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب حركات المخزون' }, { status: 500 });
    }
}
