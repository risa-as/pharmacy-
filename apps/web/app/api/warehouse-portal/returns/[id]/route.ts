export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { applyReturnCredit, validateReturnQuantity } from '@/app/lib/warehouse-returns';
import { effectiveLine } from '@/app/lib/warehouse-quote';
import { WarehouseOperationError } from '@/app/lib/warehouse-operation';
import { stockAllocations } from '@/app/lib/warehouse-return-settlement';
import { hasWarehousePermission } from '@/app/lib/warehouse-permissions';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;
    try {
        const gate = await requireWarehousePermission(ctx, 'canQuoteOrders');
        if (!gate.ok) return gate.response;
        const { id } = await props.params;
        const body = await req.json();
        if (!['ACCEPTED', 'REJECTED'].includes(body?.action)) throw new WarehouseOperationError('قرار الإرجاع غير صالح.', 400);
        const found = await prisma.warehouseReturn.findFirst({ where: { id, warehouseId: ctx.warehouseId }, select: { orderId: true } });
        if (!found) throw new WarehouseOperationError('طلب الإرجاع غير موجود.', 404);
        const result = await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "WarehouseOrder" WHERE id = ${found.orderId} AND "warehouseId" = ${ctx.warehouseId} FOR UPDATE`;
            const record = await tx.warehouseReturn.findFirstOrThrow({ where: { id, warehouseId: ctx.warehouseId }, include: { items: true } });
            // The return ID is the operation identity. A lost response can be retried safely.
            if (record.status === body.action) return { return: record, replayed: true };
            if (record.status !== 'PENDING') throw new WarehouseOperationError('سبق اتخاذ قرار مختلف لهذا المرتجع.');
            if (body.action === 'REJECTED') {
                // Rejection alone cannot prove physical receipt at the pharmacy.
                // The pharmacy explicitly releases its reserved lots after checking them.
            } else {
                if (!record.purchaseId || record.items.some(i => !stockAllocations(i.pharmacyAllocations).length)) {
                    throw new WarehouseOperationError('هذا طلب قديم بلا حجز مخزني موثق؛ ارفضه ثم أنشئ طلباً مرتبطاً بدفعات الاستلام.');
                }
                const order = await tx.warehouseOrder.findUniqueOrThrow({ where: { id: record.orderId }, include: { items: { include: { drug: true } } } });
                const accepted = await tx.warehouseReturn.findMany({ where: { orderId: record.orderId, status: 'ACCEPTED' }, include: { items: true } });
                for (const item of record.items) {
                    const check = validateReturnQuantity({ requestedQuantity: item.quantity,
                        shippedQuantity: order.items.filter(i => i.drug.barcode === item.barcode).reduce((n, i) => n + effectiveLine(i).quantity, 0),
                        alreadyAcceptedQuantity: accepted.flatMap(r => r.items).filter(i => i.barcode === item.barcode).reduce((n, i) => n + i.quantity, 0) });
                    if (!check.ok) throw new WarehouseOperationError(check.error);
                }
                // Same invoice lock as payments: do not compute credit from a stale paid balance.
                await tx.$queryRaw`SELECT id FROM "WarehouseInvoice" WHERE "orderId" = ${record.orderId} FOR UPDATE`;
                const invoice = await tx.warehouseInvoice.findUniqueOrThrow({ where: { orderId: record.orderId } });
                const credit = applyReturnCredit({ invoiceTotal: invoice.total, invoicePaidAmount: invoice.paidAmount,
                    invoiceStatus: invoice.status, creditAmount: record.totalAmount });
                if (!credit.ok) throw new WarehouseOperationError(credit.error, 400);
                const creditBalance = Math.max(invoice.paidAmount - credit.newTotal, 0) - Math.max(invoice.paidAmount - invoice.total, 0);
                await tx.warehouseInvoice.update({ where: { id: invoice.id }, data: { total: credit.newTotal, status: credit.newStatus } });
                await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${record.purchaseId} FOR UPDATE`;
                const purchase = await tx.purchase.findFirst({ where: { id: record.purchaseId, branchId: order.branchId,
                    warehouseOrderId: order.id, status: 'COMPLETED', supplier: { warehouseId: ctx.warehouseId, organizationId: record.organizationId } } });
                if (!purchase || purchase.total + 0.0001 < record.totalAmount) throw new WarehouseOperationError('تعذرت مطابقة فاتورة شراء الصيدلية؛ لم يُنفذ الإرجاع.');
                await tx.purchase.update({ where: { id: purchase.id }, data: { total: Math.max(0, purchase.total - record.totalAmount) } });
                // Negative supplier balance is the pharmacy's credit, never a fabricated cash payment.
                await tx.supplier.update({ where: { id: purchase.supplierId }, data: { balance: { decrement: record.totalAmount } } });
                await tx.warehouseReturn.update({ where: { id }, data: { creditBalance, acceptedAt: new Date() } });
                // Returned medicine stays in quarantine. This operation never increments a saleable lot.
            }
            const updated = await tx.warehouseReturn.update({ where: { id }, data: { status: body.action }, include: { items: true } });
            await tx.warehouseOrderEvent.create({ data: { orderId: record.orderId, actorType: 'WAREHOUSE', actorName: ctx.user.name ?? ctx.user.email,
                type: body.action === 'ACCEPTED' ? 'RETURN_ACCEPTED' : 'RETURN_REJECTED',
                payload: { returnId: id, totalAmount: record.totalAmount, creditBalance: updated.creditBalance,
                    purchaseId: record.purchaseId, stockDisposition: body.action === 'ACCEPTED' ? 'QUARANTINE' : 'WAITING_PHARMACY_RECEIPT' } } });
            return { return: updated };
        }, { maxWait: 20000, timeout: 30000 });
        return NextResponse.json(hasWarehousePermission(gate.actor, 'canViewFinance') ? result : {
            ...result, return: { ...result.return, creditBalance: null, refundedAmount: null },
        });
    } catch (error) {
        if (error instanceof WarehouseOperationError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('warehouse return decision failed', error);
        return NextResponse.json({ error: 'تعذر اعتماد القرار. أعد المحاولة.' }, { status: 500 });
    }
}
