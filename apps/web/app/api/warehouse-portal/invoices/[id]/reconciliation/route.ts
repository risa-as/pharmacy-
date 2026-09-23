export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { warehouseCommand, runWarehouseOperation, WarehouseOperationError } from '@/app/lib/warehouse-operation';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const ctx = await getWarehouseContext(); if (ctx instanceof NextResponse) return ctx;
    try {
        const gate = await requireWarehousePermission(ctx, 'canRecordPayment'); if (!gate.ok) return gate.response;
        const { id } = await props.params;
        const body = await req.json();
        if (typeof body.reference !== 'string' || body.reference.trim().length < 3 || typeof body.note !== 'string' || body.note.trim().length < 5) throw new WarehouseOperationError('اكتب مرجع السند ومصدر المطابقة.', 400);
        const command = warehouseCommand(ctx.warehouseId, `payment-match:${id}`, body);
        const result = await prisma.$transaction(tx => runWarehouseOperation(tx, command, async () => {
            const found = await tx.warehouseInvoice.findFirst({ where: { id, warehouseId: ctx.warehouseId, status: { not: 'CANCELLED' } } });
            if (!found) throw new WarehouseOperationError('الفاتورة غير موجودة', 404);
            await tx.$queryRaw`SELECT id FROM "WarehouseOrder" WHERE id = ${found.orderId} FOR UPDATE`;
            await tx.$queryRaw`SELECT id FROM "WarehouseInvoice" WHERE id = ${id} FOR UPDATE`;
            const invoice = await tx.warehouseInvoice.findUniqueOrThrow({ where: { id } });
            const purchase = await tx.purchase.findUnique({ where: { warehouseOrderId: invoice.orderId }, include: { supplier: true } });
            if (!purchase || purchase.supplier.warehouseId !== ctx.warehouseId || purchase.supplier.organizationId !== invoice.organizationId || purchase.status !== 'COMPLETED') throw new WarehouseOperationError('اربط فاتورة الاستلام أولاً.');
            await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${purchase.id} FOR UPDATE`;
            const current = await tx.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
            if (Math.abs(current.total - invoice.total) > 0.0001) throw new WarehouseOperationError('إجماليا الفاتورتين مختلفان؛ دقق البنود قبل مطابقة السداد.');
            const event = await tx.warehouseOrderEvent.create({ data: { orderId: invoice.orderId, type: 'PAYMENT_MATCH_PROPOSED', actorType: 'WAREHOUSE', actorName: ctx.user.name ?? ctx.user.email,
                payload: { invoiceId: id, purchaseId: purchase.id, invoicePaid: invoice.paidAmount, purchasePaid: current.paidAmount,
                    total: invoice.total, targetPaid: Math.max(invoice.paidAmount, current.paidAmount), reference: body.reference.trim(), note: body.note.trim(), actorId: ctx.user.id } } });
            return { proposalId: event.id, message: 'أُرسلت المطابقة إلى مدير الصيدلية؛ لم تتغير الأرصدة.' };
        }), { maxWait: 20000, timeout: 30000 });
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof WarehouseOperationError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('payment match proposal failed', error);
        return NextResponse.json({ error: 'تعذر طلب المطابقة' }, { status: 500 });
    }
}
