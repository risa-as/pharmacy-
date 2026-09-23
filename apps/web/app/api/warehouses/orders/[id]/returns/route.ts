export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { warehouseOrderScope } from '@/app/lib/warehouse-access';
import { warehouseCommand, runWarehouseOperation, WarehouseOperationError } from '@/app/lib/warehouse-operation';
import { requestWarehouseReturn, restorePharmacyReservation } from '@/app/lib/warehouse-return-settlement';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await getTenantContext();
        if (ctx instanceof NextResponse) return ctx;
        if (!ctx.userPermissions.canReturnWarehouseOrder) return NextResponse.json({error:'ليس لديك صلاحية إدارة المشتريات'}, {status:403});
        if (!ctx.userPermissions.canViewWarehouseOrders) return NextResponse.json({error:'غير مصرح'}, {status:403});
        const { id } = await props.params;
        const scope = warehouseOrderScope({ role: ctx.user.role, organizationId: ctx.organizationId, branchId: ctx.user.branchId });
        if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const order = await prisma.warehouseOrder.findFirst({ where: { AND: [{ id }, scope] }, select: { warehouseId: true } });
        if (!order) return NextResponse.json({ error: 'الطلب غير موجود في نطاقك' }, { status: 404 });
        const body = await req.json();
        const command = warehouseCommand(order.warehouseId, `pharmacy-return:${ctx.organizationId}:${id}`, body);
        const result = await prisma.$transaction(tx => runWarehouseOperation(tx, command,
            () => requestWarehouseReturn(tx, id, scope, body, ctx.user.name ?? ctx.user.email ?? null)), { maxWait: 20000, timeout: 30000 });
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        if (error instanceof WarehouseOperationError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('warehouse return request failed', error);
        return NextResponse.json({ error: 'تعذر إنشاء طلب الإرجاع؛ أعد المحاولة بنفس البيانات.' }, { status: 500 });
    }
}

// Read and confirm physical custody from the pharmacy, never from the warehouse.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) return ctx;
        if (!ctx.userPermissions.canViewWarehouseOrders) return NextResponse.json({error:'غير مصرح'}, {status:403});
    const { id } = await props.params;
    const scope = warehouseOrderScope({ role: ctx.user.role, organizationId: ctx.organizationId, branchId: ctx.user.branchId });
    if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const order = await prisma.warehouseOrder.findFirst({ where: { AND: [{ id }, scope] }, include: { events: { where: { type: { in: ['RETURN_REJECTED', 'RETURN_PHARMACY_RESTORED', 'RETURN_DISPATCHED'] } } } } });
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 });
    const rows = await prisma.warehouseReturn.findMany({ where: { orderId: id, warehouseId: order.warehouseId }, include: { items: true }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ returns: rows.map(row => ({ ...row,
        restored: order.events.some(e => (e.payload as any)?.returnId === row.id && (e.type === 'RETURN_PHARMACY_RESTORED' || (e.payload as any)?.stockDisposition === 'RESTORED_TO_PHARMACY')),
        dispatched: order.events.some(e => e.type === 'RETURN_DISPATCHED' && (e.payload as any)?.returnId === row.id),
    })) });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await getTenantContext();
        if (ctx instanceof NextResponse) return ctx;
        if (!ctx.userPermissions.canReturnWarehouseOrder) return NextResponse.json({error:'ليس لديك صلاحية إدارة المشتريات'}, {status:403});
        if (!ctx.userPermissions.canViewWarehouseOrders) return NextResponse.json({error:'غير مصرح'}, {status:403});
        if (!['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(ctx.user.role)) return NextResponse.json({ error: 'تأكيد الاستلام يتطلب مدير الصيدلية.' }, { status: 403 });
        const { id } = await props.params;
        const scope = warehouseOrderScope({ role: ctx.user.role, organizationId: ctx.organizationId, branchId: ctx.user.branchId });
        if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const body = await req.json();
        if (!['DISPATCH', 'RESTORE'].includes(body.action) || typeof body.returnId !== 'string' || typeof body.note !== 'string' || body.note.trim().length < 5) throw new WarehouseOperationError('حدد المرتجع واكتب مرجع التسليم أو نتيجة الفحص.', 400);
        const result = await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "WarehouseOrder" WHERE id = ${id} FOR UPDATE`;
            const order = await tx.warehouseOrder.findFirst({ where: { AND: [{ id }, scope] } });
            if (!order) throw new WarehouseOperationError('الطلب غير موجود', 404);
            const record = await tx.warehouseReturn.findFirst({ where: { id: body.returnId, orderId: id, warehouseId: order.warehouseId }, include: { items: true } });
            if (!record) throw new WarehouseOperationError('المرتجع غير موجود', 404);
            const events = await tx.warehouseOrderEvent.findMany({ where: { orderId: id, type: { in: ['RETURN_REJECTED', 'RETURN_PHARMACY_RESTORED', 'RETURN_DISPATCHED'] } } });
            const relevant = events.filter(e => (e.payload as any)?.returnId === record.id);
            const type = body.action === 'DISPATCH' ? 'RETURN_DISPATCHED' : 'RETURN_PHARMACY_RESTORED';
            if (relevant.some(e => e.type === type || (body.action === 'RESTORE' && (e.payload as any)?.stockDisposition === 'RESTORED_TO_PHARMACY'))) return { replayed: true };
            if (body.action === 'DISPATCH') {
                if (record.status !== 'PENDING') throw new WarehouseOperationError('لا يمكن إرسال مرتجع اتُخذ قراره.');
            } else {
                if (record.status !== 'REJECTED' || body.confirmedPresentAndSaleable !== true) throw new WarehouseOperationError('أكد استلام وفحص المرتجع المرفوض وصلاحيته للبيع.');
                if (record.items.some(i => !Array.isArray(i.pharmacyAllocations) || !i.pharmacyAllocations.length)) throw new WarehouseOperationError('المرتجع القديم بلا حجز موثق؛ يحتاج تسوية ولا يجوز زيادة المخزون.');
                await restorePharmacyReservation(tx, record.items);
            }
            await tx.warehouseOrderEvent.create({ data: { orderId: id, actorType: 'PHARMACY', actorName: ctx.user.name ?? ctx.user.email,
                type, payload: { returnId: record.id, note: body.note.trim(), actorId: ctx.user.id, confirmedPresentAndSaleable: body.action === 'RESTORE' } } });
            return { success: true };
        }, { maxWait: 20000, timeout: 30000 });
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof WarehouseOperationError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('pharmacy return custody failed', error);
        return NextResponse.json({ error: 'تعذر تسجيل حركة المرتجع' }, { status: 500 });
    }
}
