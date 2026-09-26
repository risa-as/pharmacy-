export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { warehouseOrderScope } from '@/app/lib/warehouse-access';
import { warehouseCommand, runWarehouseOperation, WarehouseOperationError } from '@/app/lib/warehouse-operation';
import { effectiveLine } from '@/app/lib/warehouse-quote';
import { computeInvoiceStatus } from '@/app/lib/warehouse-accounts';

async function context(id: string) {
    const ctx = await getTenantContext(); if (ctx instanceof NextResponse) return ctx;
    if (!['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(ctx.user.role)) return NextResponse.json({ error: 'المطابقة تتطلب مدير الصيدلية.' }, { status: 403 });
    if (!ctx.userPermissions.canViewWarehouseOrders || !ctx.userPermissions.canReconcileWarehouseOrder) return NextResponse.json({ error: 'ليس لديك صلاحية مطابقة الاستلام والسداد.' }, { status: 403 });
    const scope = warehouseOrderScope({ role: ctx.user.role, organizationId: ctx.organizationId, branchId: ctx.user.branchId });
    if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const order = await prisma.warehouseOrder.findFirst({ where: { AND: [{ id }, scope] }, include: { branch: true, items: true } });
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود', }, { status: 404 });
    return { ctx, scope, order };
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params; const access = await context(id); if (access instanceof NextResponse) return access;
    const { order } = access;
    const [purchases, events, supplierPayments] = await Promise.all([
        prisma.purchase.findMany({ where: { branchId: order.branchId, status: 'COMPLETED', supplier: { warehouseId: order.warehouseId, organizationId: order.branch.organizationId }, OR: [{ warehouseOrderId: null }, { warehouseOrderId: id }] },
            include: { items: { include: { drug: { select: { tradeName: true } } } } }, orderBy: { createdAt: 'desc' } }),
        prisma.warehouseOrderEvent.findMany({ where: { orderId: id, type: { in: ['PAYMENT_MATCH_PROPOSED', 'PAYMENT_MATCH_CONFIRMED'] } }, orderBy: { createdAt: 'desc' } }),
        prisma.supplierPayment.findMany({ where: { branchId: order.branchId, supplier: { warehouseId: order.warehouseId, organizationId: order.branch.organizationId } }, select: { id: true, amount: true, reference: true, date: true }, orderBy: { date: 'desc' } }),
    ]);
    const batches = await prisma.batch.findMany({ where: { inventory: { branchId: order.branchId }, supplier: { warehouseId: order.warehouseId }, OR: [{ purchaseItemId: null }, { purchaseItemId: { in: purchases.flatMap(p => p.items.map(i => i.id)) } }] },
        select: { id: true, purchaseItemId: true, batchNumber: true, expiryDate: true, initialQuantity: true, quantity: true, costPrice: true, inventory: { select: { drugId: true } } } });
    const completed = new Set(events.filter(e => e.type === 'PAYMENT_MATCH_CONFIRMED').map(e => (e.payload as any)?.proposalId));
    const linked = purchases.find(p => p.warehouseOrderId === id);
    const receiptLinked = !!linked && order.items.filter(item => effectiveLine(item).quantity > 0).every(item => {
        if (!item.unitsPerPack) return false;
        const receiptIds = new Set(linked.items.filter(i => i.drugId === item.drugId && i.cost > 0).map(i => i.id));
        return batches.filter(b => {
            const receipt = linked.items.find(i => i.id === b.purchaseItemId);
            return receipt && receiptIds.has(receipt.id) && b.inventory.drugId === (receipt.receivedDrugId || receipt.drugId);
        }).reduce((sum, b) => sum + b.initialQuantity, 0) >= effectiveLine(item).quantity * item.unitsPerPack;
    });
    return NextResponse.json({ receiptLinked, purchases, batches, supplierPayments, proposals: events.filter(e => e.type === 'PAYMENT_MATCH_PROPOSED' && !completed.has(e.id)).map(e => ({ id: e.id, ...e.payload as object })) });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await props.params; const access = await context(id); if (access instanceof NextResponse) return access;
        const { ctx, scope, order: initial } = access;
        const body = await req.json();
        if (!['LINK_RECEIPT', 'CONFIRM_PAYMENT'].includes(body.action) || typeof body.reference !== 'string' || body.reference.trim().length < 3 || typeof body.note !== 'string' || body.note.trim().length < 5 || body.confirmed !== true) throw new WarehouseOperationError('أدخل المرجع ومصدر المطابقة وأكد صحة المستندات.', 400);
        const command = warehouseCommand(initial.warehouseId, `pharmacy-reconciliation:${id}`, body);
        const result = await prisma.$transaction(tx => runWarehouseOperation(tx, command, async () => {
            await tx.$queryRaw`SELECT id FROM "WarehouseOrder" WHERE id = ${id} FOR UPDATE`;
            const order = await tx.warehouseOrder.findFirst({ where: { AND: [{ id }, scope] }, include: { items: true, branch: true } });
            if (!order || !['SHIPPED', 'DELIVERED'].includes(order.status)) throw new WarehouseOperationError('الطلب غير قابل للمطابقة.', 409);
            if (body.action === 'CONFIRM_PAYMENT') {
                const proposal = await tx.warehouseOrderEvent.findFirst({ where: { id: body.proposalId, orderId: id, type: 'PAYMENT_MATCH_PROPOSED' } });
                if (!proposal) throw new WarehouseOperationError('طلب المطابقة غير موجود.', 404);
                const data = proposal.payload as any;
                const prior = await tx.warehouseSettlement.findFirst({ where: { warehouseId: order.warehouseId, kind: 'PAYMENT_MATCH', sourceId: proposal.id } });
                if (prior) return { entry: prior, replayed: true };
                if (body.reference.trim() !== data.reference) throw new WarehouseOperationError('مرجع المستند لا يطابق طلب المذخر.');
                await tx.$queryRaw`SELECT id FROM "WarehouseInvoice" WHERE id = ${data.invoiceId} FOR UPDATE`;
                await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${data.purchaseId} FOR UPDATE`;
                const invoice = await tx.warehouseInvoice.findFirst({ where: { id: data.invoiceId, orderId: id, warehouseId: order.warehouseId, status: { not: 'CANCELLED' } } });
                const purchase = await tx.purchase.findFirst({ where: { id: data.purchaseId, warehouseOrderId: id, branchId: order.branchId, status: 'COMPLETED', supplier: { warehouseId: order.warehouseId, organizationId: order.branch.organizationId } } });
                if (!invoice || !purchase || invoice.paidAmount !== data.invoicePaid || purchase.paidAmount !== data.purchasePaid || invoice.total !== data.total || purchase.total !== data.total) throw new WarehouseOperationError('تغيرت الأرصدة منذ طلب المطابقة؛ اطلب مطابقة حديثة.');
                const target = Math.max(invoice.paidAmount, purchase.paidAmount);
                const pharmacyIncrease = target - purchase.paidAmount;
                let supplierPaymentId: string | null = null;
                if (pharmacyIncrease > 0) {
                    // A supplier payment may already have reduced Supplier.balance
                    // without being allocated to Purchase.paidAmount. Never debit it twice.
                    await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id = ${purchase.supplierId} FOR UPDATE`;
                    if (body.pharmacyPaymentSource === 'EXISTING' && typeof body.supplierPaymentId === 'string') {
                        const payment = await tx.supplierPayment.findFirst({ where: { id: body.supplierPaymentId, supplierId: purchase.supplierId, branchId: purchase.branchId } });
                        if (!payment) throw new WarehouseOperationError('سند سداد المورد غير موجود في الفرع.', 404);
                        const allocations = await tx.warehouseSettlement.findMany({ where: { warehouseId: order.warehouseId, kind: 'PAYMENT_MATCH', details: { path: ['supplierPaymentId'], equals: payment.id } }, select: { amount: true } });
                        if (pharmacyIncrease > payment.amount - allocations.reduce((sum, a) => sum + a.amount, 0)) throw new WarehouseOperationError('المبلغ يتجاوز الجزء غير المخصص من سند المورد.');
                        supplierPaymentId = payment.id;
                    } else if (body.pharmacyPaymentSource === 'UNRECORDED') {
                        if (await tx.supplierPayment.findFirst({ where: { supplierId: purchase.supplierId, reference: data.reference } })) throw new WarehouseOperationError('مرجع السداد موجود في دفتر المورد؛ اختر السند الموجود لمنع الخصم مرتين.');
                        const payment = await tx.supplierPayment.create({ data: { supplierId: purchase.supplierId, branchId: purchase.branchId, amount: pharmacyIncrease,
                            method: 'RECONCILIATION', reference: data.reference, notes: 'إثبات سداد سابق بمطابقة الطرفين؛ ليس دفعًا نقديًا جديدًا. ' + body.note.trim() } });
                        supplierPaymentId = payment.id;
                        await tx.supplier.update({ where: { id: purchase.supplierId }, data: { balance: { decrement: pharmacyIncrease } } });
                    } else throw new WarehouseOperationError('حدد سند المورد الموجود أو أكد أن السداد لم يُسجل سابقًا في دفتر المورد.', 400);
                }
                const entry = await tx.warehouseSettlement.create({ data: { warehouseId: order.warehouseId, organizationId: order.branch.organizationId, kind: 'PAYMENT_MATCH', reference: data.reference,
                    sourceId: proposal.id, amount: Math.abs(invoice.paidAmount - purchase.paidAmount), direction: 'NON_CASH', actorId: ctx.user.id,
                    details: { ...data, pharmacyNote: body.note.trim(), proposalId: proposal.id, targetPaid: target, supplierPaymentId, pharmacyPaymentSource: body.pharmacyPaymentSource ?? null } } });
                await tx.warehouseInvoice.update({ where: { id: invoice.id }, data: { paidAmount: target, status: computeInvoiceStatus({ total: invoice.total, paidAmount: target }) } });
                await tx.purchase.update({ where: { id: purchase.id }, data: { paidAmount: target } });
                // Newly reconciled paid amounts may make previously accepted returns
                // refundable. Allocate only the newly available credit, once.
                const returns = await tx.warehouseReturn.findMany({ where: { orderId: id, status: 'ACCEPTED' }, orderBy: [{ acceptedAt: 'asc' }, { id: 'asc' }] });
                let creditToAllocate = Math.max(0, target - invoice.total - returns.reduce((sum, r) => sum + r.creditBalance - r.refundedAmount, 0));
                for (const record of returns) {
                    const increase = Math.min(creditToAllocate, Math.max(0, record.totalAmount - record.creditBalance));
                    if (increase > 0) await tx.warehouseReturn.update({ where: { id: record.id }, data: { creditBalance: { increment: increase } } });
                    creditToAllocate -= increase;
                }
                // This is a countersigned reconciliation, never a second cash receipt.
                await tx.warehouseOrderEvent.create({ data: { orderId: id, type: 'PAYMENT_MATCH_CONFIRMED', actorType: 'PHARMACY', actorName: ctx.user.name ?? ctx.user.email,
                    payload: { proposalId: proposal.id, entryId: entry.id, actorId: ctx.user.id, note: body.note.trim() } } });
                return { entry };
            }
            if (typeof body.purchaseId !== 'string' || !Array.isArray(body.lines) || !body.lines.length) throw new WarehouseOperationError('حدد فاتورة الاستلام وربط البنود والدفعات.', 400);
            await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${body.purchaseId} FOR UPDATE`;
            const purchase = await tx.purchase.findFirst({ where: { id: body.purchaseId, branchId: order.branchId, status: 'COMPLETED', supplier: { warehouseId: order.warehouseId, organizationId: order.branch.organizationId } }, include: { items: true } });
            if (!purchase || (purchase.warehouseOrderId && purchase.warehouseOrderId !== id)) throw new WarehouseOperationError('فاتورة الاستلام غير متطابقة أو مرتبطة بطلب آخر.');
            if (await tx.warehouseReturn.count({ where: { orderId: id } })) throw new WarehouseOperationError('لا يمكن تغيير ربط الاستلام بعد إنشاء مرتجعات.');
            const expected = order.items.filter(i => effectiveLine(i).quantity > 0);
            if (body.lines.length !== expected.length || new Set(body.lines.map((l: any) => l.orderItemId)).size !== expected.length) throw new WarehouseOperationError('اربط كل بند مشحون مرة واحدة.');
            const usedItems = new Set<string>(), usedBatches = new Set<string>();
            for (const line of body.lines) {
                const item = expected.find(i => i.id === line.orderItemId);
                const receipt = purchase.items.find(i => i.id === line.purchaseItemId);
                if (!item || !receipt || receipt.drugId !== item.drugId || receipt.cost <= 0 || usedItems.has(receipt.id)) throw new WarehouseOperationError('بند الاستلام لا يطابق الدواء الأصلي.');
                const quantity = effectiveLine(item).quantity;
                if (!Number.isSafeInteger(line.unitsPerPack) || line.unitsPerPack <= 0 || receipt.quantity !== quantity * line.unitsPerPack || Math.abs(receipt.cost * line.unitsPerPack - effectiveLine(item).unitPrice) > 0.001) throw new WarehouseOperationError('عدد الأشرطة أو سعر وحدة الاستلام لا يطابق الفاتورة.');
                if (item.unitsPerPack && item.unitsPerPack !== line.unitsPerPack) throw new WarehouseOperationError('لا يمكن تغيير تحويل وحدة موثق.');
                usedItems.add(receipt.id);
                if (!Array.isArray(line.batchIds) || !line.batchIds.length || line.batchIds.some((b: string) => typeof b !== 'string' || usedBatches.has(b)) || new Set(line.batchIds).size !== line.batchIds.length) throw new WarehouseOperationError('حدد دفعات الاستلام دون تكرار.');
                const linked = await tx.batch.findMany({ where: { purchaseItemId: receipt.id }, select: { id: true } });
                if (linked.some(batch => !line.batchIds.includes(batch.id))) throw new WarehouseOperationError('لا يمكن إهمال دفعات مرتبطة سابقًا ببند الاستلام.');
                let initialQuantity = 0;
                for (const batchId of line.batchIds) {
                    const batch = await tx.batch.findFirst({ where: { id: batchId, inventory: { branchId: order.branchId, drugId: receipt.receivedDrugId || item.drugId }, supplierId: purchase.supplierId } });
                    if (!batch || (batch.purchaseItemId && batch.purchaseItemId !== receipt.id) || Math.abs(batch.costPrice - receipt.cost) > 0.001) throw new WarehouseOperationError('الدفعة لا تطابق الفرع والمورد والدواء والتكلفة.');
                    initialQuantity += batch.initialQuantity;
                    const changed = await tx.batch.updateMany({ where: { id: batchId, OR: [{ purchaseItemId: null }, { purchaseItemId: receipt.id }] }, data: { purchaseItemId: receipt.id } });
                    if (changed.count !== 1) throw new WarehouseOperationError('تغير ربط الدفعة؛ أعد تحميل البيانات.');
                    usedBatches.add(batchId);
                }
                if (initialQuantity !== receipt.quantity) throw new WarehouseOperationError('مجموع كميات الدفعات الأصلية لا يطابق بند الاستلام.');
                await tx.warehouseOrderItem.update({ where: { id: item.id }, data: { unitsPerPack: line.unitsPerPack } });
            }
            if (purchase.items.some(i => i.cost > 0 && !usedItems.has(i.id)) || Math.abs(purchase.total - order.totalAmount) > 0.001) throw new WarehouseOperationError('فاتورة الاستلام تحتوي بنودًا أو إجمالياً غير مطابق.');
            await tx.purchase.update({ where: { id: purchase.id }, data: { warehouseOrderId: id } });
            const event = await tx.warehouseOrderEvent.create({ data: { orderId: id, type: 'RECEIPT_RECONCILED', actorType: 'PHARMACY', actorName: ctx.user.name ?? ctx.user.email,
                payload: { purchaseId: purchase.id, reference: body.reference.trim(), note: body.note.trim(), actorId: ctx.user.id, lines: body.lines } } });
            return { eventId: event.id };
        }), { maxWait: 20000, timeout: 30000 });
        return NextResponse.json(result);
    } catch (error: any) {
        if (error?.code === 'P2002') return NextResponse.json({ error: 'المستند مرتبط مسبقًا؛ راجع سجل المطابقة.' }, { status: 409 });
        if (error instanceof WarehouseOperationError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('pharmacy reconciliation failed', error);
        return NextResponse.json({ error: 'تعذرت المطابقة' }, { status: 500 });
    }
}
