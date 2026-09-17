export const dynamic = 'force-dynamic';

// Phase 2 (الحسابات والعملاء) من نظام المذاخر B2B: تفاصيل فاتورة مذخر واحدة
// مع كل دفعاتها — أساس صفحة كشف الحساب لكل عميل.
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { agingBucket } from '@/app/lib/warehouse-accounts';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

// GET: تفاصيل فاتورة + دفعاتها — ضمن كتالوج مذخر الفاعل حصراً.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewFinance');
        if (!gate.ok) return gate.response;

        const invoice = await prisma.warehouseInvoice.findFirst({
            where: { id: params.id, warehouseId: ctx.warehouseId },
            include: {
                organization: { select: { name: true } },
                payments: { orderBy: { receivedAt: 'desc' } },
            },
        });
        if (!invoice) {
            return NextResponse.json({ error: 'الفاتورة غير موجودة ضمن هذا المذخر' }, { status: 404 });
        }

        const now = new Date();
        return NextResponse.json({
            invoice: {
                id: invoice.id,
                organizationId: invoice.organizationId,
                organizationName: invoice.organization.name,
                orderId: invoice.orderId,
                invoiceNumber: invoice.invoiceNumber,
                total: invoice.total,
                paidAmount: invoice.paidAmount,
                remaining: Math.max(invoice.total - invoice.paidAmount, 0),
                status: invoice.status,
                issuedAt: invoice.issuedAt,
                dueAt: invoice.dueAt,
                aging: agingBucket(invoice.dueAt, now),
                notes: invoice.notes,
                payments: invoice.payments.map((p) => ({
                    id: p.id,
                    amount: p.amount,
                    method: p.method,
                    reference: p.reference,
                    notes: p.notes,
                    receivedAt: p.receivedAt,
                    actorName: p.actorName,
                })),
            },
        });
    } catch (e: any) {
        console.error('warehouse-portal invoice detail GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب تفاصيل الفاتورة' }, { status: 500 });
    }
}
