import { prisma } from '@/app/lib/prisma';
export const dynamic = 'force-dynamic';

// المرحلة 4 من نظام المذاخر B2B (التقارير والأداء): هامش الربح لكل صنف.
// حماية إضافية عمداً فوق canViewReports: هذا التقرير الوحيد الذي يكشف
// التكلفة والربح — SALES وINVENTORY يملكان canViewReports افتراضياً (انظر
// warehouse-permissions.ts) لكن لا يملكان canViewFinance، فيجب ألا يريا هذا
// التقرير تحديداً رغم امتلاكهما التبويب العام. requireWarehousePermission
// يقبل مصفوفة مفاتيح (AND) فتُطلَب الاثنتان معاً باستعلام واحد.
//
// تعتمد التكلفة على الحركات المثبتة وقت الشحن والبيع؛ الحركات القديمة
// التي لا تحمل تكلفة تبقى غير مكتملة ولا تُستبدل بتكلفة الكتالوج الحالية.
import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { getSoldLines, resolveReportDateRange } from '@/app/lib/warehouse-report-data';
import { marginByItem } from '@/app/lib/warehouse-reports';

export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, ['canViewReports', 'canViewFinance']);
        if (!gate.ok) return gate.response;
        const mode = await prisma.warehouse.findUnique({where:{id:ctx.warehouseId},select:{operatingMode:true}});
        if(mode?.operatingMode === 'ORDER_PORTAL') return NextResponse.json({error:'هذا التقرير يحتاج مخزون المذخر وتكاليفه المسجلة في وضع الإدارة الكاملة.'},{status:403});

        const { searchParams } = new URL(req.url);
        const range = resolveReportDateRange(searchParams.get('from'), searchParams.get('to'));
        const lines = await getSoldLines(ctx.warehouseId, range);

        return NextResponse.json({
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            items: marginByItem(lines),
        });
    } catch (e: any) {
        console.error('warehouse-portal reports/margins GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب تقرير الهوامش' }, { status: 500 });
    }
}
