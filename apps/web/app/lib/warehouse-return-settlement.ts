import { Prisma } from '@prisma/client';
import { effectiveLine } from './warehouse-quote';
import { validateReturnQuantity } from './warehouse-returns';
import { WarehouseOperationError } from './warehouse-operation';

export type StockAllocation = { batchId: string; quantity: number };
export function stockAllocations(value: unknown): StockAllocation[] {
    if (!Array.isArray(value)) return [];
    if (!value.every(a => a && typeof a.batchId === 'string' && Number.isSafeInteger(a.quantity) && a.quantity > 0)) {
        throw new WarehouseOperationError('سجل دفعات المرتجع غير صالح؛ يلزم تدقيقه.');
    }
    return value as StockAllocation[];
}

/** Reserve the exact received stock immediately, in the same transaction as
 * the request. A pending return can no longer be sold or returned again. */
export async function requestWarehouseReturn(tx: Prisma.TransactionClient, orderId: string,
    scope: Prisma.WarehouseOrderWhereInput, body: any, actorName: string | null) {
    await tx.$queryRaw`SELECT id FROM "WarehouseOrder" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.warehouseOrder.findFirst({ where: { AND: [{ id: orderId }, scope] },
        include: { items: { include: { drug: true } }, branch: true } });
    if (!order) throw new WarehouseOperationError('الطلب غير موجود في نطاقك.', 404);
    if (!['SHIPPED', 'DELIVERED'].includes(order.status)) throw new WarehouseOperationError('الإرجاع متاح بعد الشحن فقط.', 400);
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 500) throw new WarehouseOperationError('حدد أصناف الإرجاع.', 400);
    const purchase = await tx.purchase.findUnique({ where: { warehouseOrderId: order.id }, include: { items: true } });
    if (!purchase || purchase.branchId !== order.branchId || purchase.status !== 'COMPLETED') {
        throw new WarehouseOperationError('يجب استلام فاتورة الشراء وربط دفعاتها بالطلب قبل الإرجاع. الطلبات القديمة تحتاج تسوية موثقة لدفعات الاستلام.', 409);
    }
    await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${purchase.id} FOR UPDATE`;
    const previous = await tx.warehouseReturn.findMany({ where: { orderId, status: { in: ['PENDING', 'ACCEPTED'] } }, include: { items: true } });
    if (previous.some(record => record.status === 'PENDING')) throw new WarehouseOperationError('يوجد طلب إرجاع قيد المراجعة لهذا الطلب؛ تابع الطلب الحالي قبل إنشاء إرجاع آخر.');
    const receiptBatches = await tx.batch.findMany({ where: {
        purchaseItemId: { in: purchase.items.filter(item => item.cost > 0).map(item => item.id) },
        inventory: { branchId: order.branchId }, supplierId: purchase.supplierId,
    }, select: { id: true, purchaseItemId: true, quantity: true, inventory: { select: { drugId: true } } }, orderBy: { id: 'asc' } });
    const seen = new Set<string>();
    const items: Array<{drugId: string; barcode: string; quantity: number; unitPrice: number; pharmacyAllocations: StockAllocation[]}> = [];
    for (const raw of body.items) {
        const barcode = typeof raw?.barcode === 'string' ? raw.barcode.trim() : '';
        if (!barcode || seen.has(barcode)) throw new WarehouseOperationError('باركود مفقود أو مكرر.', 400);
        seen.add(barcode);
        const lines = order.items.filter(i => i.drug.barcode === barcode && effectiveLine(i).quantity > 0);
        // A barcode must have a single immutable price and conversion; ambiguous legacy lines need reconciliation.
        if (lines.length !== 1 || !lines[0].unitsPerPack) throw new WarehouseOperationError('لا توجد وحدة استلام موثقة لهذا الصنف؛ يلزم تدقيق الفاتورة الأصلية.');
        const line = lines[0], shipped = effectiveLine(line);
        const check = validateReturnQuantity({ shippedQuantity: shipped.quantity,
            alreadyAcceptedQuantity: previous.flatMap(r => r.items).filter(i => i.barcode === barcode).reduce((sum, i) => sum + i.quantity, 0),
            requestedQuantity: raw.quantity });
        if (!check.ok) throw new WarehouseOperationError(check.error, 400);
        let remaining = raw.quantity * line.unitsPerPack!;
        const receiptItems = purchase.items.filter(i => i.drugId === line.drugId && i.cost > 0);
        const receiptIds = new Set(receiptItems.map(item => item.id));
        const batches = receiptBatches.filter(batch => {
            const receipt = receiptItems.find(item => item.id === batch.purchaseItemId);
            return receipt && receiptIds.has(receipt.id) && batch.inventory.drugId === (receipt.receivedDrugId || receipt.drugId);
        });
        if (!batches.length) throw new WarehouseOperationError(`دفعات استلام «${line.drug.tradeName}» غير مربوطة بالفاتورة الأصلية. راجع ربط دفعات الاستلام من تفاصيل الطلب؛ وجود رصيد عام لا يكفي لإثبات مصدره.`);
        const available = batches.reduce((sum, batch) => sum + Math.max(0, batch.quantity), 0);
        if (available < remaining) throw new WarehouseOperationError(`رصيد دفعات «${line.drug.tradeName}» المرتبطة لا يكفي: المطلوب ${remaining} من وحدات المخزون، والمتاح ${available} (كل وحدة طلب = ${line.unitsPerPack} من وحدات المخزون).`);
        const allocations: StockAllocation[] = [];
        for (const batch of batches) {
            const quantity = Math.min(remaining, Math.max(0, batch.quantity));
            if (!remaining) break;
            if (!quantity) continue;
            allocations.push({ batchId: batch.id, quantity });
            remaining -= quantity;
        }
        if (remaining) throw new WarehouseOperationError('الكمية المتاحة في دفعات الاستلام الأصلية لا تكفي للإرجاع.');
        items.push({ drugId: line.drugId, barcode, quantity: raw.quantity, unitPrice: shipped.unitPrice, pharmacyAllocations: allocations });
    }
    // One conditional stock write for the entire request; a short result rolls
    // the transaction back, including any rows changed before a competing sale.
    const allocations = items.flatMap(item => item.pharmacyAllocations);
    const changed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "Batch" AS batch
        SET quantity = batch.quantity - allocation.quantity, "updatedAt" = NOW()
        FROM (VALUES ${Prisma.join(allocations.map(a => Prisma.sql`(${a.batchId}::text, ${a.quantity}::integer)`))}) AS allocation(id, quantity)
        WHERE batch.id = allocation.id AND batch.quantity >= allocation.quantity
        RETURNING batch.id
    `);
    if (changed.length !== allocations.length) throw new WarehouseOperationError('تغير مخزون دفعات الاستلام؛ أعد المحاولة بنفس البيانات.');
    const created = await tx.warehouseReturn.create({ data: { warehouseId: order.warehouseId, orderId,
        organizationId: order.branch.organizationId, purchaseId: purchase.id, actorName,
        reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 2000) || null : null,
        totalAmount: items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0), items: { create: items } }, include: { items: true } });
    await tx.warehouseOrderEvent.create({ data: { orderId, actorType: 'PHARMACY', actorName, type: 'RETURN_REQUESTED',
        payload: { returnId: created.id, totalAmount: created.totalAmount, stockReserved: true, purchaseId: purchase.id } } });
    return { return: created };
}

export async function restorePharmacyReservation(tx: Prisma.TransactionClient, items: { pharmacyAllocations: unknown }[]) {
    for (const item of items) for (const allocation of stockAllocations(item.pharmacyAllocations)) {
        const batch = await tx.batch.findUnique({ where: { id: allocation.batchId } });
        if (!batch || batch.expiryDate <= new Date()) throw new WarehouseOperationError('دفعة المرتجع مفقودة أو منتهية الصلاحية؛ لا يمكن إعادتها للبيع.');
        await tx.batch.update({ where: { id: allocation.batchId }, data: { quantity: { increment: allocation.quantity } } });
    }
}
