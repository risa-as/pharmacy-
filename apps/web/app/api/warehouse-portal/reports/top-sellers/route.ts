export const dynamic = 'force-dynamic';

// المرحلة 4 من نظام المذاخر B2B (التقارير والأداء): الأكثر مبيعاً — بالقيمة
// أو بالكمية. انظر تعليق رأس app/lib/warehouse-report-data.ts لمصدر بنود المبيعات.
import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { getSoldLines, resolveReportDateRange } from '@/app/lib/warehouse-report-data';
import { topSellers } from '@/app/lib/warehouse-reports';

export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewReports');
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const by = searchParams.get('by') === 'quantity' ? 'quantity' : 'value';
        const limitParam = Number(searchParams.get('limit'));
        const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 100) : 10;

        const range = resolveReportDateRange(searchParams.get('from'), searchParams.get('to'));
        const lines = await getSoldLines(ctx.warehouseId, range);

        return NextResponse.json({
            by,
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            items: topSellers(lines, by, limit),
        });
    } catch (e: any) {
        console.error('warehouse-portal reports/top-sellers GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب تقرير الأكثر مبيعاً' }, { status: 500 });
    }
}
