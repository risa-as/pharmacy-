export const dynamic = 'force-dynamic';

// فروع صيدلية عميلة — لاختيار فرع الاستلام عند إدخال طلب هاتفي
// (فحص 2026-09-17، فجوة G3).
//
// لزم مسار جديد لأن WarehouseOrder.branchId إلزامي: الطلب يُسلَّم إلى فرع
// بعينه لا إلى مؤسسة. و GET /customers يعيد المؤسسات لا فروعها، وتوسيعه كان
// سيُضخّم حمولة صفحة العملاء بفروع لا تستعملها.
//
// [id] هو organizationId — نفس ما يستعمله PATCH /customers/[id].
//
// الحراسة: canQuoteOrders — هذه بيانات تخدم إنشاء الطلب الهاتفي وحده،
// فتُقاس بصلاحيته لا بـcanViewCustomers.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id: organizationId } = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canQuoteOrders');
        if (!gate.ok) return gate.response;

        // علاقة العميل شرطٌ للقراءة: لا يتصفّح المذخر فروع صيدلية لا يتعامل
        // معها — وإلا صار هذا المسار كشفاً لبنية أي مؤسسة على المنصة.
        const customer = await prisma.warehouseCustomer.findFirst({
            where: { warehouseId: ctx.warehouseId, organizationId },
            select: { isBlocked: true },
        });
        if (!customer) {
            return NextResponse.json(
                { error: 'هذه الصيدلية ليست من عملائك' },
                { status: 403 }
            );
        }

        const branches = await prisma.branch.findMany({
            where: { organizationId },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({ branches, isBlocked: customer.isBlocked });
    } catch (e: any) {
        console.error('warehouse-portal customer branches GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب فروع الصيدلية' }, { status: 500 });
    }
}
