export const dynamic = 'force-dynamic';

// المرحلة 4 من نظام المذاخر B2B (التقارير والأداء): نسبة التلبية — أهم
// مؤشر جودة لمذخر. البنود المُمرَّرة إلى fulfilmentRate() تأتي من
// getFulfilmentItems() (تستبعد الطلبات غير المُسعَّرة بعد وCANCELLED، وبنود
// REQUESTED غير المحسومة — انظر تعليقها في warehouse-report-data.ts).
import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { getFulfilmentItems, resolveReportDateRange } from '@/app/lib/warehouse-report-data';
import { fulfilmentRate } from '@/app/lib/warehouse-reports';

export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewReports');
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const range = resolveReportDateRange(searchParams.get('from'), searchParams.get('to'));
        const items = await getFulfilmentItems(ctx.warehouseId, range);

        return NextResponse.json({
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            ...fulfilmentRate(items),
        });
    } catch (e: any) {
        console.error('warehouse-portal reports/fulfilment GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب تقرير نسبة التلبية' }, { status: 500 });
    }
}
