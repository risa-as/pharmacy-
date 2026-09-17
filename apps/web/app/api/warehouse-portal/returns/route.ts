export const dynamic = 'force-dynamic';

// المرحلة 5 (الصقل التجاري) §Part 4: قائمة طلبات الإرجاع الواردة على هذا
// المذخر. عرض فقط — القبول/الرفض في PATCH /api/warehouse-portal/returns/[id]
// (يتطلب canQuoteOrders هناك). القراءة هنا تتطلب canViewOrders — نفس صلاحية
// عرض الطلبات، فالإرجاع امتداد لدورة حياة الطلب نفسها.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewOrders');
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status');

        const returns = await prisma.warehouseReturn.findMany({
            where: {
                warehouseId: ctx.warehouseId,
                ...(status ? { status } : {}),
            },
            include: { items: true },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });

        // اسم المنظمة للعرض — استعلام واحد إضافي بدل تضمينه لكل صف (لا علاقة
        // @relation على WarehouseReturn.organizationId عمداً، انظر تعليق المخطط).
        const orgIds = Array.from(new Set(returns.map((r) => r.organizationId)));
        const orgs = orgIds.length
            ? await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
            : [];
        const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

        return NextResponse.json({
            returns: returns.map((r) => ({ ...r, organizationName: orgNameById.get(r.organizationId) ?? r.organizationId })),
        });
    } catch (e: any) {
        console.error('warehouse-portal returns GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب طلبات الإرجاع' }, { status: 500 });
    }
}
