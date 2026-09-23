import { prisma } from '@/app/lib/prisma';
export const dynamic = 'force-dynamic';

// المرحلة 4 من نظام المذاخر B2B (التقارير والأداء): مخاطر الصلاحية — قيمة
// البضاعة الحية (كمية > 0) حسب فئة الانتهاء. الفئات وعتباتها من expiryBucket()
// في warehouse-stock.ts حصراً (لا تُكرَّر هنا) — نفس الفئات المستخدَمة في
// صفحة app/warehouse/stock.
import { NextResponse } from 'next/server';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { getWarehouseBatchesForReports } from '@/app/lib/warehouse-report-data';
import { expiryRisk } from '@/app/lib/warehouse-reports';

export async function GET() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewReports');
        if (!gate.ok) return gate.response;
        const mode = await prisma.warehouse.findUnique({where:{id:ctx.warehouseId},select:{operatingMode:true}});
        if(mode?.operatingMode === 'ORDER_PORTAL') return NextResponse.json({error:'هذا التقرير يحتاج مخزون المذخر وتكاليفه المسجلة في وضع الإدارة الكاملة.'},{status:403});

        const batches = await getWarehouseBatchesForReports(ctx.warehouseId);
        return NextResponse.json(expiryRisk(batches));
    } catch (e: any) {
        console.error('warehouse-portal reports/expiry-risk GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب تقرير مخاطر الصلاحية' }, { status: 500 });
    }
}
