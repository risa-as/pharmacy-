export const dynamic = 'force-dynamic';

// Phase 2 (الحسابات والعملاء) من نظام المذاخر B2B: قائمة فواتير هذا المذخر —
// مع فئة التقادم (aging) لكل فاتورة عبر agingBucket() النقيّة في
// warehouse-accounts.ts، فلا يُعاد حساب قاعدة التقادم هنا. متاحة لكل حسابات
// المذخر (ليست عملية كتابة) — التسجيل الفعلي للدفعات هو ما يتطلب OWNER.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { agingBucket } from '@/app/lib/warehouse-accounts';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

const VALID_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'CANCELLED'];

// GET: قائمة الفواتير — ?status=&organizationId=
export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewFinance');
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status') || undefined;
        const organizationId = searchParams.get('organizationId') || undefined;

        if (status && !VALID_STATUSES.includes(status)) {
            return NextResponse.json({ error: 'status غير صالح' }, { status: 400 });
        }

        const invoices = await prisma.warehouseInvoice.findMany({
            where: {
                warehouseId: ctx.warehouseId,
                ...(status ? { status: status as any } : {}),
                ...(organizationId ? { organizationId } : {}),
            },
            include: {
                organization: { select: { name: true } },
                _count: { select: { payments: true } },
            },
            orderBy: { issuedAt: 'desc' },
            take: 300,
        });

        const now = new Date();
        const rows = invoices.map((inv) => ({
            id: inv.id,
            organizationId: inv.organizationId,
            organizationName: inv.organization.name,
            orderId: inv.orderId,
            invoiceNumber: inv.invoiceNumber,
            total: inv.total,
            paidAmount: inv.paidAmount,
            remaining: Math.max(inv.total - inv.paidAmount, 0),
            status: inv.status,
            issuedAt: inv.issuedAt,
            dueAt: inv.dueAt,
            aging: agingBucket(inv.dueAt, now),
            paymentsCount: inv._count.payments,
            notes: inv.notes,
        }));

        return NextResponse.json({ invoices: rows });
    } catch (e: any) {
        console.error('warehouse-portal invoices GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب الفواتير' }, { status: 500 });
    }
}
