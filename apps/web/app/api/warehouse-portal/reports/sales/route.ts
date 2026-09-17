export const dynamic = 'force-dynamic';

// المرحلة 4 من نظام المذاخر B2B (التقارير والأداء): إجمالي المبيعات مجمّعاً
// بفترة (يوم/أسبوع/شهر). بنود المبيعات تُشتق حصراً عبر getSoldLines() —
// انظر تعليق رأس app/lib/warehouse-report-data.ts لمصدر كل حقل وسبب اعتماد
// effectiveLine() من warehouse-quote.ts كطريقة وحيدة لحساب كمية/قيمة السطر.
import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { getSoldLines, resolveReportDateRange } from '@/app/lib/warehouse-report-data';
import { salesByPeriod } from '@/app/lib/warehouse-reports';

export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewReports');
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const periodParam = searchParams.get('period');
        const period = periodParam === 'week' || periodParam === 'month' ? periodParam : 'day';

        const range = resolveReportDateRange(searchParams.get('from'), searchParams.get('to'));
        const lines = await getSoldLines(ctx.warehouseId, range);

        return NextResponse.json({
            period,
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            series: salesByPeriod(lines, period),
        });
    } catch (e: any) {
        console.error('warehouse-portal reports/sales GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب تقرير المبيعات' }, { status: 500 });
    }
}
