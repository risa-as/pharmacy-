export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { warehouseCommand, runWarehouseOperation, WarehouseOperationError } from '@/app/lib/warehouse-operation';

export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext(); if (ctx instanceof NextResponse) return ctx;
    const gate = await requireWarehousePermission(ctx, 'canViewFinance'); if (!gate.ok) return gate.response;
    const page = Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get('page')) || 1));
    const sourceId = req.nextUrl.searchParams.get('sourceId');
    const where = { warehouseId: ctx.warehouseId, ...(sourceId ? { sourceId } : {}) };
    const [entries, total] = await prisma.$transaction([
        prisma.warehouseSettlement.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 50 }),
        prisma.warehouseSettlement.count({ where }),
    ]);
    return NextResponse.json({ entries, total, page });
}

export async function POST(req: NextRequest) {
    const ctx = await getWarehouseContext(); if (ctx instanceof NextResponse) return ctx;
    try {
        const gate = await requireWarehousePermission(ctx, 'canRecordPayment'); if (!gate.ok) return gate.response;
        const body = await req.json();
        if (body.kind !== 'OPENING_PAYMENT' || typeof body.customerId !== 'string' || typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0 || typeof body.reference !== 'string' || body.reference.trim().length < 3) throw new WarehouseOperationError('حدد العميل والمبلغ ومرجع سند القبض.', 400);
        const command = warehouseCommand(ctx.warehouseId, `opening-payment:${body.customerId}`, body);
        const result = await prisma.$transaction(tx => runWarehouseOperation(tx, command, async () => {
            await tx.$queryRaw`SELECT id FROM "WarehouseCustomer" WHERE id = ${body.customerId} AND "warehouseId" = ${ctx.warehouseId} FOR UPDATE`;
            const customer = await tx.warehouseCustomer.findFirst({ where: { id: body.customerId, warehouseId: ctx.warehouseId } });
            if (!customer) throw new WarehouseOperationError('العميل غير موجود', 404);
            if (body.amount > customer.openingBalance) throw new WarehouseOperationError('المبلغ يتجاوز الرصيد الافتتاحي المتبقي.');
            const remaining = customer.openingBalance - body.amount;
            const entry = await tx.warehouseSettlement.create({ data: { warehouseId: ctx.warehouseId, organizationId: customer.organizationId,
                kind: 'OPENING_PAYMENT', reference: body.reference.trim(), sourceId: customer.id, amount: body.amount, direction: 'IN', actorId: ctx.user.id,
                details: { before: customer.openingBalance, after: remaining, operationKey: command.key } } });
            await tx.warehouseCustomer.update({ where: { id: customer.id }, data: { openingBalance: remaining } });
            return { entry, remaining };
        }), { maxWait: 20000, timeout: 30000 });
        return NextResponse.json(result);
    } catch (error: any) {
        if (error?.code === 'P2002') return NextResponse.json({ error: 'مرجع سند القبض مستخدم؛ راجع السجل.' }, { status: 409 });
        if (error instanceof WarehouseOperationError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('opening settlement failed', error);
        return NextResponse.json({ error: 'تعذر تسجيل التسوية' }, { status: 500 });
    }
}
