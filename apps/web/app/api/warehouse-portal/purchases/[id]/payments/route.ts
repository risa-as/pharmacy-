export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { applyPayment } from '@/app/lib/warehouse-accounts';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { runWarehouseOperation, warehouseCommand, WarehouseOperationError } from '@/app/lib/warehouse-operation';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;
    try {
        const gate = await requireWarehousePermission(ctx, 'canPaySupplier');
        if (!gate.ok) return gate.response;
        const body = await req.json().catch(() => null);
        const command = warehouseCommand(ctx.warehouseId, `supplier-payment:${id}`, body);
        const result = await prisma.$transaction(tx => runWarehouseOperation(tx, command, async () => {
            await tx.$queryRaw`SELECT id FROM "WarehousePurchase" WHERE id = ${id} AND "warehouseId" = ${ctx.warehouseId} FOR UPDATE`;
            const purchase = await tx.warehousePurchase.findFirst({ where: { id, warehouseId: ctx.warehouseId } });
            if (!purchase) throw new WarehouseOperationError('فاتورة الشراء غير موجودة ضمن هذا المذخر', 404);
            if (purchase.status === 'CANCELLED') throw new WarehouseOperationError('لا يمكن الدفع على فاتورة ملغاة.', 400);
            const amount = Number(body.amount);
            const check = applyPayment({ total: purchase.total, paidAmount: purchase.paidAmount, payment: amount });
            if (!check.ok) throw new WarehouseOperationError(check.error, 400);
            const payment = await tx.warehouseSupplierPayment.create({ data: {
                purchaseId: id, warehouseId: ctx.warehouseId, amount,
                method: typeof body.method === 'string' && body.method.trim() ? body.method.trim() : 'CASH',
                reference: typeof body.reference === 'string' ? body.reference.trim() || null : null,
                notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
                actorName: ctx.user.name ?? ctx.user.email ?? null,
            } });
            const updated = await tx.warehousePurchase.update({ where: { id }, data: { paidAmount: check.newPaid, status: check.newStatus } });
            return { purchase: updated, payment };
        }), { maxWait: 20000, timeout: 20000 });
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        if (error instanceof WarehouseOperationError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('warehouse supplier payment failed', error);
        return NextResponse.json({ error: 'تعذّر تسجيل الدفعة. أعد المحاولة بالعملية نفسها.' }, { status: 500 });
    }
}
