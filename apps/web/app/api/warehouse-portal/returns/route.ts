export const dynamic = 'force-dynamic';

// المرحلة 5 (الصقل التجاري) §Part 4: قائمة طلبات الإرجاع الواردة على هذا
// المذخر. عرض فقط — القبول/الرفض في PATCH /api/warehouse-portal/returns/[id]
// (يتطلب canQuoteOrders هناك). القراءة هنا تتطلب canViewOrders — نفس صلاحية
// عرض الطلبات، فالإرجاع امتداد لدورة حياة الطلب نفسها.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { warehousePage } from '@/app/lib/warehouse-pagination';
import { hasWarehousePermission } from '@/app/lib/warehouse-permissions';

export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewOrders');
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status');
        const pagination = warehousePage(searchParams);
        if (status && !['PENDING', 'ACCEPTED', 'REJECTED'].includes(status)) return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 });

        const returns = await prisma.warehouseReturn.findMany({
            where: {
                warehouseId: ctx.warehouseId,
                ...(status ? { status } : {}),
            },
            include: { items: true },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: pagination.take, skip: pagination.skip,
        });
        const total = await prisma.warehouseReturn.count({ where: { warehouseId: ctx.warehouseId, ...(status ? { status } : {}) } });

        // اسم المنظمة للعرض — استعلام واحد إضافي بدل تضمينه لكل صف (لا علاقة
        // @relation على WarehouseReturn.organizationId عمداً، انظر تعليق المخطط).
        const shipmentOrders = await prisma.warehouseOrder.findMany({where:{id:{in:returns.map(r=>r.orderId)},warehouseId:ctx.warehouseId},select:{id:true,shipmentMode:true}});
    const shipmentModes = new Map(shipmentOrders.map(o=>[o.id,o.shipmentMode]));
    const orgIds = Array.from(new Set(returns.map((r) => r.organizationId)));
        const orgs = orgIds.length
            ? await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
            : [];
        const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));
        const drugIds = Array.from(new Set(returns.flatMap(row => row.items.map(item => item.drugId))));
        const drugs = drugIds.length ? await prisma.globalDrug.findMany({ where: { id: { in: drugIds } }, select: { id: true, tradeName: true } }) : [];
        const drugNames = new Map(drugs.map(drug => [drug.id, drug.tradeName]));

        return NextResponse.json({
            total, page: pagination.page, pageSize: pagination.pageSize,
            returns: returns.map((r) => ({ ...r, shipmentMode:shipmentModes.get(r.orderId) ?? null,
                items: r.items.map(item => ({ ...item, drugName: drugNames.get(item.drugId) ?? null })),
                creditBalance: hasWarehousePermission(gate.actor, 'canViewFinance') ? r.creditBalance : null,
                refundedAmount: hasWarehousePermission(gate.actor, 'canViewFinance') ? r.refundedAmount : null,
                organizationName: orgNameById.get(r.organizationId) ?? r.organizationId })),
        });
    } catch (e: any) {
        console.error('warehouse-portal returns GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب طلبات الإرجاع' }, { status: 500 });
    }
}
