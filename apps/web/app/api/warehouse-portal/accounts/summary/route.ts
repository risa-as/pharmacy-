export const dynamic = 'force-dynamic';

// Phase 2 (الحسابات والعملاء) من نظام المذاخر B2B: ملخص الذمم المدينة لهذا
// المذخر — أساس لوحة app/warehouse/accounts. الحساب بالكامل عبر
// summarizeReceivables() النقيّة في warehouse-accounts.ts؛ فواتير CANCELLED/
// PAID مُستبعدة من الاستعلام أصلاً (لا شيء مستحق منها فعلياً).
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { summarizeReceivables } from '@/app/lib/warehouse-accounts';
import { loadOpenReceivables } from '@/app/lib/warehouse-receivables';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

export async function GET() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewFinance');
        if (!gate.ok) return gate.response;

        // دفترا الذمم معاً — فواتير طلبات المنصة وفواتير البيع الميداني
        // (فحص 2026-09-17، فجوة G1): كان هذا الملخّص يقرأ الأول وحده فيُظهر
        // ذمماً أقلّ من الحقيقة لأي مذخر يبيع بمندوبين.
        const receivables = await loadOpenReceivables(prisma, ctx.warehouseId);

        const summary = summarizeReceivables(receivables);

        return NextResponse.json(summary);
    } catch (e: any) {
        console.error('warehouse-portal accounts summary GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب ملخص الحسابات' }, { status: 500 });
    }
}
