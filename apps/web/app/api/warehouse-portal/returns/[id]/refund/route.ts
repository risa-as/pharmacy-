export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { warehouseCommand, runWarehouseOperation, WarehouseOperationError } from '@/app/lib/warehouse-operation';
import { computeInvoiceStatus } from '@/app/lib/warehouse-accounts';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;
    try {
        const gate = await requireWarehousePermission(ctx, 'canRecordPayment');
        if (!gate.ok) return gate.response;
        const { id } = await props.params;
        const body = await req.json();
        const command = warehouseCommand(ctx.warehouseId, `return-refund:${id}`, body);
        if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0 || typeof body.reference !== 'string' || body.reference.trim().length < 3) {
            throw new WarehouseOperationError('أدخل مبلغ الرد ومرجع سند الصرف.', 400);
        }
        const result = await prisma.$transaction(tx => runWarehouseOperation(tx, command, async () => {
            const record = await tx.warehouseReturn.findFirst({ where: { id, warehouseId: ctx.warehouseId, status: 'ACCEPTED' } });
            if (!record?.purchaseId) throw new WarehouseOperationError('الإشعار الدائن المرتبط غير موجود.', 404);
            await tx.$queryRaw`SELECT id FROM "WarehouseOrder" WHERE id = ${record.orderId} FOR UPDATE`;
            const current = await tx.warehouseReturn.findUniqueOrThrow({ where: { id } });
            if (body.amount > current.creditBalance - current.refundedAmount) throw new WarehouseOperationError('المبلغ يتجاوز الرصيد الدائن غير المردود.');
            await tx.$queryRaw`SELECT id FROM "WarehouseInvoice" WHERE "orderId" = ${record.orderId} FOR UPDATE`;
            const invoice = await tx.warehouseInvoice.findUniqueOrThrow({ where: { orderId: record.orderId } });
            await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${record.purchaseId} FOR UPDATE`;
            const purchase = await tx.purchase.findUniqueOrThrow({ where: { id: record.purchaseId } });
            if (body.amount > invoice.paidAmount - invoice.total || body.amount > purchase.paidAmount - purchase.total) {
                throw new WarehouseOperationError('رصيد الدفعات بين الطرفين يحتاج مطابقة قبل تسجيل الرد النقدي.');
            }
            const historical = await tx.warehouseOrderEvent.findFirst({ where: { type: 'RETURN_REFUNDED', order: { warehouseId: ctx.warehouseId }, payload: { path: ['reference'], equals: body.reference.trim() } } });
            if (historical) throw new WarehouseOperationError('مرجع سند الرد مسجل مسبقًا؛ راجع سجل المرتجع.');
            await tx.warehouseSettlement.create({ data: { warehouseId: ctx.warehouseId, organizationId: record.organizationId,
                kind: 'RETURN_REFUND', reference: body.reference.trim(), sourceId: id, amount: body.amount, direction: 'OUT', actorId: ctx.user.id,
                details: { invoiceId: invoice.id, purchaseId: purchase.id, invoicePaidBefore: invoice.paidAmount, purchasePaidBefore: purchase.paidAmount, operationKey: command.key } } });
            const paidAmount = invoice.paidAmount - body.amount;
            await tx.warehouseInvoice.update({ where: { id: invoice.id }, data: { paidAmount, status: computeInvoiceStatus({ total: invoice.total, paidAmount }) } });
            await tx.purchase.update({ where: { id: purchase.id }, data: { paidAmount: { decrement: body.amount } } });
            await tx.supplier.update({ where: { id: purchase.supplierId }, data: { balance: { increment: body.amount } } });
            // A signed reversal keeps the pharmacy supplier statement consistent
            // with its payable balance; it is linked to the same refund voucher.
            await tx.supplierPayment.create({ data: { supplierId: purchase.supplierId, branchId: purchase.branchId,
                amount: -body.amount, method: 'REFUND', reference: body.reference.trim(),
                notes: 'رد نقدي من المذخر عن الإشعار الدائن ' + (current.creditNoteNumber ?? id) } });
            const updated = await tx.warehouseReturn.update({ where: { id }, data: { refundedAmount: { increment: body.amount } } });
            await tx.warehouseOrderEvent.create({ data: { orderId: record.orderId, actorType: 'WAREHOUSE', actorName: ctx.user.name ?? ctx.user.email,
                type: 'RETURN_REFUNDED', payload: { returnId: id, amount: body.amount, reference: body.reference.trim(), operationKey: command.key } } });
            return { return: updated };
        }), { maxWait: 20000, timeout: 30000 });
        return NextResponse.json(result);
    } catch (error: any) {
        if (error?.code === 'P2002') return NextResponse.json({ error: 'مرجع السند مسجل مسبقًا؛ راجع سجل التسويات قبل إعادة الإدخال.' }, { status: 409 });
        if (error instanceof WarehouseOperationError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('return refund failed', error);
        return NextResponse.json({ error: 'تعذر تسجيل الرد. أعد المحاولة بنفس البيانات.' }, { status: 500 });
    }
}
