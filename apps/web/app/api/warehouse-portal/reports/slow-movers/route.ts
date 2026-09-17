export const dynamic = 'force-dynamic';

// المرحلة 4 من نظام المذاخر B2B (التقارير والأداء): الأصناف الراكدة — في
// الكتالوج ولم تُطلب منذ N يوماً (days، افتراضي 90)، بما فيها ما لم يُبَع
// إطلاقاً (انظر تعليق slowMovers في app/lib/warehouse-reports.ts).
//
// نافذة البحث عن "آخر بيع" تُختلف عمداً عن باقي تقارير المبيعات: لا تُستخدَم
// آخر 90 يوماً الافتراضية هنا، بل MAX_REPORT_RANGE_DAYS كاملاً — وإلا صنف
// بيع قبل 100 يوم فقط سيظهر خطأً "لم يُبَع إطلاقاً" لمجرد أن بيعه الوحيد وقع
// خارج نافذة قصيرة، بينما هذا التقرير بالذات يحتاج أطول مدى ممكن لتاريخ آخر
// بيع (مع بقاء نفس السقف MAX_REPORT_RANGE_DAYS الذي يمنع مسحاً غير محدود).
import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import {
    getSoldLines,
    getWarehouseCatalogForReports,
    MAX_REPORT_RANGE_DAYS,
} from '@/app/lib/warehouse-report-data';
import { slowMovers } from '@/app/lib/warehouse-reports';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewReports');
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const daysParam = Number(searchParams.get('days'));
        const sinceDays = Number.isFinite(daysParam) && daysParam > 0 ? Math.floor(daysParam) : 90;

        const now = new Date();
        const range = { from: new Date(now.getTime() - MAX_REPORT_RANGE_DAYS * MS_PER_DAY), to: now };

        const [catalog, lines] = await Promise.all([
            getWarehouseCatalogForReports(ctx.warehouseId),
            getSoldLines(ctx.warehouseId, range),
        ]);

        return NextResponse.json({
            sinceDays,
            items: slowMovers(catalog, lines, sinceDays, now),
        });
    } catch (e: any) {
        console.error('warehouse-portal reports/slow-movers GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب تقرير الأصناف الراكدة' }, { status: 500 });
    }
}
