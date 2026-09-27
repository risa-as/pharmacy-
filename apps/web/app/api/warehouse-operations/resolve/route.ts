export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { warehouseOrderScope } from '@/app/lib/warehouse-access';
import { VOIDED_SCOPE, operationLockKey } from '@/app/lib/warehouse-operation';

// Resolves an unconfirmed idempotency key (e.g. one left by an older version of
// the page): answers «recorded», or voids the key so that its old request — even
// one still on its way — can never be applied afterwards. A plain «not recorded»
// would be unsafe: the old request could land a moment later, next to the new one.
//
// It runs under the same per-key lock as the operation routes, so the operation
// and the void are serialized and exactly one of them wins. Answers only within
// the caller's scope: a warehouse user's warehouse, or the warehouse of an order
// a pharmacy user can see.
const KEY = /^[A-Za-z0-9._:-]{16,128}$/;
const PHARMACY_ORDER = /^\/api\/warehouses\/orders\/([^/]+)\/(returns|reconciliation)$/;
const INVOICE_PAYMENT = /^\/api\/warehouse-portal\/invoices\/[^/]+\/payments$/;

type Answer = { recorded: true } | { recorded: false; voided: true };

function resolveKey(warehouseId: string, key: string, invoicePayment: boolean): Promise<Answer> {
    return prisma.$transaction(async (tx) => {
        // Invoice payments lock by the bare key (see that route); every other operation by warehouse + key.
        const lock = invoicePayment ? key : operationLockKey(warehouseId, key);
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))::text`;
        const operation = await tx.warehouseOperation.findUnique({ where: { warehouseId_key: { warehouseId, key } }, select: { scope: true } });
        if (operation) return operation.scope === VOIDED_SCOPE ? { recorded: false, voided: true } : { recorded: true };
        if (invoicePayment) {
            const payment = await tx.warehousePayment.findUnique({ where: { idempotencyKey: key }, select: { warehouseId: true } });
            if (payment?.warehouseId === warehouseId) return { recorded: true };
        }
        await tx.warehouseOperation.create({ data: { warehouseId, key, scope: VOIDED_SCOPE, requestHash: VOIDED_SCOPE, result: {} } });
        return { recorded: false, voided: true };
    });
}

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
        return NextResponse.json(await resolveKey(found.warehouseId, key, false));
    }

    if (path.startsWith('/api/warehouse-portal/')) {
        const ctx = await getWarehouseContext();
        if (ctx instanceof NextResponse) return ctx;
        return NextResponse.json(await resolveKey(ctx.warehouseId, key, INVOICE_PAYMENT.test(path)));
    }

    return NextResponse.json({ error: 'ليست عملية مذخر' }, { status: 400 });
}
