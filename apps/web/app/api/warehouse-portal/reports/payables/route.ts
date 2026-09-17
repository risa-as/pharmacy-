export const dynamic = 'force-dynamic';

// مشتريات المذخر وذممه الدائنة: تقرير «الذمم الدائنة» في app/warehouse/reports
// — ما يدين به المذخر لموردّيه، مجمَّعاً حسب المورّد، مع تقادم كل مورّد
// وملخّص إجمالي. agingBucket/summarizeReceivables من warehouse-accounts.ts
// تُعاد استخدامها حرفياً (الأخيرة غير مدركة لاتجاه العلاقة أصلاً) — لا نسخة
// موازية من رياضيات التقادم هنا.
//
// Phase 3 (الأدوار والصلاحيات): يتطلب canViewFinance **و** canViewPurchases
// معاً (AND) — عرض الوضع المالي وحده لا يكفي لرؤية ذمم دائنة تجاه موردين لم
// يمنح الفاعل صلاحية رؤية المشتريات أصلاً.
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { agingBucket, summarizeReceivables, type AgingBucket } from '@/app/lib/warehouse-accounts';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

export async function GET() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, ['canViewFinance', 'canViewPurchases']);
        if (!gate.ok) return gate.response;

        const purchases = await prisma.warehousePurchase.findMany({
            where: { warehouseId: ctx.warehouseId, status: { in: ['UNPAID', 'PARTIAL'] } },
            select: {
                total: true,
                paidAmount: true,
                status: true,
                dueAt: true,
                supplierId: true,
                supplier: { select: { name: true } },
            },
        });

        const summary = summarizeReceivables(purchases);

        const now = new Date();
        type SupplierAgg = { supplierId: string; supplierName: string; outstanding: number; overdue: number; bucket: AgingBucket };
        const bySupplier = new Map<string, SupplierAgg>();

        for (const p of purchases) {
            const remaining = Math.max(p.total - p.paidAmount, 0);
            if (remaining <= 0) continue;

            const bucket = agingBucket(p.dueAt, now);
            const existing = bySupplier.get(p.supplierId);
            if (existing) {
                existing.outstanding += remaining;
                if (bucket !== 'CURRENT') existing.overdue += remaining;
                // أسوأ (أعلى تقادماً) فئة تُعرض لكل مورّد — ترتيب الأولوية
                // نفسه المستخدَم في summarizeReceivables/agingBucket.
                const order: AgingBucket[] = ['CURRENT', 'D30', 'D60', 'D90', 'D90_PLUS'];
                if (order.indexOf(bucket) > order.indexOf(existing.bucket)) existing.bucket = bucket;
            } else {
                bySupplier.set(p.supplierId, {
                    supplierId: p.supplierId,
                    supplierName: p.supplier.name,
                    outstanding: remaining,
                    overdue: bucket !== 'CURRENT' ? remaining : 0,
                    bucket,
                });
            }
        }

        const suppliers = Array.from(bySupplier.values()).sort((a, b) => b.outstanding - a.outstanding);

        return NextResponse.json({ summary, suppliers });
    } catch (e: any) {
        console.error('warehouse-portal reports payables GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب تقرير الذمم الدائنة' }, { status: 500 });
    }
}
