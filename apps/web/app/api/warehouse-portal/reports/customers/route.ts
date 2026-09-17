export const dynamic = 'force-dynamic';

// المرحلة 4 من نظام المذاخر B2B (التقارير والأداء): مبيعات لكل صيدلية.
// حماية إضافية عمداً فوق canViewReports: هذا التقرير يكشف أسماء الصيدليات
// وأحجام تعاملها — INVENTORY يملك canViewReports افتراضياً لكن لا يملك
// canViewCustomers (انظر warehouse-permissions.ts)، فيجب ألا يرى هذا
// التقرير رغم امتلاكه التبويب العام. requireWarehousePermission يقبل مصفوفة
// مفاتيح (AND) فتُطلَب الاثنتان معاً باستعلام واحد.
import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { getSoldLines, resolveReportDateRange } from '@/app/lib/warehouse-report-data';
import { salesByCustomer } from '@/app/lib/warehouse-reports';

export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, ['canViewReports', 'canViewCustomers']);
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const range = resolveReportDateRange(searchParams.get('from'), searchParams.get('to'));
        const lines = await getSoldLines(ctx.warehouseId, range);

        return NextResponse.json({
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            items: salesByCustomer(lines),
        });
    } catch (e: any) {
        console.error('warehouse-portal reports/customers GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب تقرير مبيعات العملاء' }, { status: 500 });
    }
}
