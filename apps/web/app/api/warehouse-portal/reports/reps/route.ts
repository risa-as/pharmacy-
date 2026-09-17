export const dynamic = 'force-dynamic';

// المندوبون (مذاخر B2B): تقرير أداء المندوبين — مبيعات/ربح/تحصيل وعمولة
// محسوبة لكل مندوب خلال الفترة المطلوبة. مصدر التجميع مشترك مع
// GET /api/warehouse-portal/reps (getRepPerformance في warehouse-report-data.ts)
// — لا نسخة موازية لحساب الإيراد/الربح/التحصيل هنا. العمولة نفسها عبر
// computeCommission من app/lib/warehouse-reps.ts حصراً.
//
// حماية إضافية عمداً فوق canViewReports: هذا التقرير يكشف أداء وعمولة كل
// مندوب — يتطلب canViewReps أيضاً (مصفوفة OWNER/MANAGER/ACCOUNTANT)، بنفس
// نمط AND المستخدَم في reports/margins وreports/customers.
import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { getRepPerformance, resolveReportDateRange } from '@/app/lib/warehouse-report-data';
import { computeCommission, type CommissionBasisValue } from '@/app/lib/warehouse-reps';

export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, ['canViewReports', 'canViewReps']);
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const range = resolveReportDateRange(searchParams.get('from'), searchParams.get('to'));

        const performance = await getRepPerformance(ctx.warehouseId, range);

        const reps = performance.map((p) => ({
            repId: p.repId,
            name: p.name,
            commissionBasis: p.commissionBasis,
            commissionRate: p.commissionRate,
            salesTotal: p.salesTotal,
            profitTotal: p.profitTotal,
            collectedTotal: p.collectedTotal,
            commission: computeCommission({
                basis: p.commissionBasis as CommissionBasisValue,
                rate: p.commissionRate,
                salesTotal: p.salesTotal,
                profitTotal: p.profitTotal,
                collectedTotal: p.collectedTotal,
            }),
        }));

        return NextResponse.json({
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            reps,
        });
    } catch (e: any) {
        console.error('warehouse-portal reports/reps GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب تقرير المندوبين' }, { status: 500 });
    }
}
