export const dynamic = 'force-dynamic';

// Phase 2 (الحسابات والعملاء) من نظام المذاخر B2B: ملخص الذمم المدينة لهذا
// المذخر — أساس لوحة app/warehouse/accounts. الحساب بالكامل عبر
// summarizeReceivables() النقيّة في warehouse-accounts.ts؛ فواتير CANCELLED/
// PAID مُستبعدة من الاستعلام أصلاً (لا شيء مستحق منها فعلياً).
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { summarizeReceivables } from '@/app/lib/warehouse-accounts';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

export async function GET() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewFinance');
        if (!gate.ok) return gate.response;

        const invoices = await prisma.warehouseInvoice.findMany({
            where: { warehouseId: ctx.warehouseId, status: { in: ['UNPAID', 'PARTIAL'] } },
            select: { total: true, paidAmount: true, status: true, dueAt: true },
        });

        const summary = summarizeReceivables(invoices);

        return NextResponse.json(summary);
    } catch (e: any) {
        console.error('warehouse-portal accounts summary GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب ملخص الحسابات' }, { status: 500 });
    }
}
