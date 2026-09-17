export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { applyPayment } from '@/app/lib/warehouse-accounts';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;
    try {
        const gate = await requireWarehousePermission(ctx, 'canRecordPayment');
        if (!gate.ok) return gate.response;
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }
        const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
        const amount = Number(body.amount);
        const method = typeof body.method === 'string' && body.method.trim() ? body.method.trim() : 'CASH';
        const reference = typeof body.reference === 'string' ? body.reference.trim() || null : null;
        const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
        if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey) || !Number.isFinite(amount) || amount <= 0) {
            return NextResponse.json({ error: 'مفتاح العملية أو مبلغ الدفع غير صالح' }, { status: 400 });
        }
        return await prisma.$transaction(async tx => {
            // Serialize retries by key, then lock the invoice against payments/cancellation.
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))::text`;
            await tx.$queryRaw`SELECT id FROM "WarehouseInvoice" WHERE id = ${id} AND "warehouseId" = ${ctx.warehouseId} FOR UPDATE`;
            const invoice = await tx.warehouseInvoice.findFirst({ where: { id, warehouseId: ctx.warehouseId } });
            if (!invoice) return NextResponse.json({ error: 'الفاتورة غير موجودة ضمن هذا المذخر' }, { status: 404 });
            const prior = await tx.warehousePayment.findUnique({ where: { idempotencyKey } });
            if (prior) {
                if (prior.invoiceId !== id || prior.warehouseId !== ctx.warehouseId || prior.amount !== amount ||
                    prior.method !== method || prior.reference !== reference || prior.notes !== notes) {
                    return NextResponse.json({ error: 'مفتاح العملية مستخدم لطلب مختلف.' }, { status: 409 });
                }
                return NextResponse.json({ invoice, payment: prior, idempotentReplay: true }, { status: 200 });
            }
            if (invoice.status === 'CANCELLED') return NextResponse.json({ error: 'لا يمكن تسجيل دفعة على فاتورة مُلغاة.' }, { status: 400 });
            const result = applyPayment({ total: invoice.total, paidAmount: invoice.paidAmount, payment: amount });
            if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
            const payment = await tx.warehousePayment.create({ data: {
                invoiceId: id, warehouseId: ctx.warehouseId, idempotencyKey, amount, method, reference, notes,
                actorName: ctx.user.name ?? ctx.user.email ?? null,
            } });
            const updated = await tx.warehouseInvoice.update({ where: { id }, data: { paidAmount: result.newPaid, status: result.newStatus } });
            return NextResponse.json({ invoice: updated, payment }, { status: 201 });
        });
    } catch (error: any) {
        if (error?.code === 'P2002') return NextResponse.json({ error: 'مفتاح العملية مستخدم لطلب مختلف.' }, { status: 409 });
        console.error('warehouse-portal invoice payments POST error:', error);
        return NextResponse.json({ error: 'فشل في تسجيل الدفعة' }, { status: 500 });
    }
}
