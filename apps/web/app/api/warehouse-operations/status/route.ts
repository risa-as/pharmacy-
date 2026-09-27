export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { warehouseOrderScope } from '@/app/lib/warehouse-access';

// "Was the operation with this idempotency key recorded?" — lets a browser
// resolve an unconfirmed attempt (e.g. one left by an older version) before any
// new key is used. Answers only within the caller's own scope: the warehouse of a
// warehouse user, or the warehouse of an order a pharmacy user can see.
const KEY = /^[A-Za-z0-9._:-]{16,128}$/;
const PHARMACY_ORDER = /^\/api\/warehouses\/orders\/([^/]+)\/(returns|reconciliation)$/;
const INVOICE_PAYMENT = /^\/api\/warehouse-portal\/invoices\/[^/]+\/payments$/;

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null);
    const path = typeof body?.url === 'string' ? body.url.split('?')[0] : '';
    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    if (!KEY.test(key)) return NextResponse.json({ error: 'مفتاح العملية غير صالح' }, { status: 400 });

    const order = path.match(PHARMACY_ORDER);
    if (order) {
        const ctx = await getTenantContext();
        if (ctx instanceof NextResponse) return ctx;
        const scope = warehouseOrderScope({ role: ctx.user.role, organizationId: ctx.organizationId, branchId: ctx.user.branchId });
        if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const found = await prisma.warehouseOrder.findFirst({ where: { AND: [{ id: order[1] }, scope] }, select: { warehouseId: true } });
        if (!found) return NextResponse.json({ error: 'الطلب غير موجود في نطاقك' }, { status: 404 });
        const operation = await prisma.warehouseOperation.findUnique({ where: { warehouseId_key: { warehouseId: found.warehouseId, key } }, select: { id: true } });
        return NextResponse.json({ recorded: !!operation });
    }

    if (path.startsWith('/api/warehouse-portal/')) {
        const ctx = await getWarehouseContext();
        if (ctx instanceof NextResponse) return ctx;
        const recorded = INVOICE_PAYMENT.test(path)
            ? !!await prisma.warehousePayment.findFirst({ where: { idempotencyKey: key, warehouseId: ctx.warehouseId }, select: { id: true } })
            : !!await prisma.warehouseOperation.findUnique({ where: { warehouseId_key: { warehouseId: ctx.warehouseId, key } }, select: { id: true } });
        return NextResponse.json({ recorded });
    }

    return NextResponse.json({ error: 'ليست عملية مذخر' }, { status: 400 });
}
