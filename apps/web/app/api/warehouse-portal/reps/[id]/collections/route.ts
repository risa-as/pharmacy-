export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { applyPayment } from '@/app/lib/warehouse-accounts';
import { runWarehouseOperation, warehouseCommand, WarehouseOperationError } from '@/app/lib/warehouse-operation';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;
    try {
        const gate = await requireWarehousePermission(ctx, 'canSellField');
        if (!gate.ok) return gate.response;
        const body = await req.json().catch(() => null);
        const command = warehouseCommand(ctx.warehouseId, `rep-collection:${id}`, body);
        const result = await prisma.$transaction(tx => runWarehouseOperation(tx, command, async () => {
            const rep = await tx.warehouseRep.findFirst({ where: { id, warehouseId: ctx.warehouseId } });
            if (!rep) throw new WarehouseOperationError('المندوب غير موجود ضمن هذا المذخر', 404);
            const amount = Number(body.amount);
            if (!Number.isFinite(amount) || amount <= 0) throw new WarehouseOperationError('مبلغ التحصيل غير صالح.', 400);
            const fieldSaleId = typeof body.fieldSaleId === 'string' && body.fieldSaleId ? body.fieldSaleId : null;
            const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
            let fieldSale = null;
            if (fieldSaleId) {
                await tx.$queryRaw`SELECT id FROM "WarehouseFieldSale" WHERE id = ${fieldSaleId} AND "warehouseId" = ${ctx.warehouseId} FOR UPDATE`;
                const sale = await tx.warehouseFieldSale.findFirst({ where: { id: fieldSaleId, repId: id, warehouseId: ctx.warehouseId } });
                if (!sale) throw new WarehouseOperationError('الفاتورة غير موجودة ضمن مبيعات هذا المندوب', 404);
                if (sale.status === 'CANCELLED') throw new WarehouseOperationError('الفاتورة ملغاة.', 400);
                const check = applyPayment({ total: sale.total, paidAmount: sale.paidAmount, payment: amount });
                if (!check.ok) throw new WarehouseOperationError(check.error, 400);
                fieldSale = await tx.warehouseFieldSale.update({ where: { id: fieldSaleId }, data: { paidAmount: check.newPaid, status: check.newStatus } });
            }
            const collection = await tx.warehouseRepCollection.create({ data: { repId: id, warehouseId: ctx.warehouseId, fieldSaleId, amount, notes } });
            return { collection, fieldSale };
        }), { maxWait: 20000, timeout: 20000 });
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        if (error instanceof WarehouseOperationError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('warehouse representative collection failed', error);
        return NextResponse.json({ error: 'تعذّر تسجيل التحصيل. أعد المحاولة بالعملية نفسها.' }, { status: 500 });
    }
}
