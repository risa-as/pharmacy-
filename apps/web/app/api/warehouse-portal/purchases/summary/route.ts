export const dynamic = 'force-dynamic';

// مشتريات المذخر وذممه الدائنة: ملخّص الذمم الدائنة لهذا المذخر — أساس
// البطاقات العلوية في app/warehouse/purchases، ويُعاد جلبه من العميل بعد كل
// دفعة (نفس نمط GET /api/warehouse-portal/accounts/summary تماماً، بالاتجاه
// المعاكس). الحساب بالكامل عبر summarizeReceivables() النقيّة نفسها —
// مباشرة، بلا أي تعديل: هي بالفعل غير مدركة لاتجاه العلاقة (تُدخِل فقط
// {total, paidAmount, status, dueAt})، فتصلح للذمم الدائنة كما هي بالضبط.
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { summarizeReceivables } from '@/app/lib/warehouse-accounts';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

export async function GET() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewPurchases');
        if (!gate.ok) return gate.response;

        const purchases = await prisma.warehousePurchase.findMany({
            where: { warehouseId: ctx.warehouseId, status: { in: ['UNPAID', 'PARTIAL'] } },
            select: { total: true, paidAmount: true, status: true, dueAt: true },
        });

        const summary = summarizeReceivables(purchases);

        return NextResponse.json(summary);
    } catch (e: any) {
        console.error('warehouse-portal purchases summary GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب ملخص المشتريات' }, { status: 500 });
    }
}
