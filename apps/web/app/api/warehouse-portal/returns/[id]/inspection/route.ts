export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { WarehouseOperationError } from '@/app/lib/warehouse-operation';
import { stockAllocations } from '@/app/lib/warehouse-return-settlement';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;
    const gate = await requireWarehousePermission(ctx, 'canViewOrders');
    if (!gate.ok) return gate.response;
    const { id } = await props.params;
    const record = await prisma.warehouseReturn.findFirst({ where: { id, warehouseId: ctx.warehouseId } });
    if (!record) return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
    const moves = await prisma.warehouseStockMove.findMany({ where: { orderId: record.orderId, type: 'SHIPMENT',
        catalogItem: { warehouseId: ctx.warehouseId } }, include: { batch: true, catalogItem: { select: { barcode: true } } } });
    return NextResponse.json({ batches: moves.filter(m => m.batch).map(m => ({ id: m.batch!.id,
        barcode: m.catalogItem.barcode, batchNumber: m.batch!.batchNumber, expiryDate: m.batch!.expiryDate, quantity: Math.abs(m.quantity) })) });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;
    try {
        const { id } = await props.params;
        const body = await req.json();
        const gate = await requireWarehousePermission(ctx, body.action === 'DISPOSED' ? 'canWriteOffStock' : 'canAdjustStock');
        if (!gate.ok) return gate.response;
        const portalReturn = await prisma.warehouseReturn.findFirst({where:{id,warehouseId:ctx.warehouseId},select:{orderId:true}});
        const shipment = portalReturn ? await prisma.warehouseOrder.findFirst({where:{id:portalReturn.orderId,warehouseId:ctx.warehouseId},select:{shipmentMode:true}}) : null;
        if(shipment?.shipmentMode==='ORDER_PORTAL') return NextResponse.json({error:'شحنة من بوابة الطلبات: سجل الإرجاع والتسوية هنا، وافحص البضاعة وسجل مخزونها في نظام المذخر الخارجي.'},{status:409});
        if (!['RELEASED', 'DISPOSED'].includes(body.action) || typeof body.note !== 'string' || body.note.trim().length < 5) {
            throw new WarehouseOperationError('حدد نتيجة الفحص واكتب ملاحظات الفحص (خمسة أحرف على الأقل).', 400);
        }
        const record = await prisma.warehouseReturn.findFirst({ where: { id, warehouseId: ctx.warehouseId, status: 'ACCEPTED' } });
        if (!record) throw new WarehouseOperationError('المرتجع المقبول غير موجود.', 404);
        const requests = body.items === undefined ? [body] : body.items;
        if (!Array.isArray(requests) || !requests.length || requests.length > 500 || requests.some(row => !row || typeof row.itemId !== 'string') || new Set(requests.map(row => row.itemId)).size !== requests.length) {
            throw new WarehouseOperationError('حدد أصنافًا غير مكررة للفحص.', 400);
        }
        const items = await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "WarehouseOrder" WHERE id = ${record.orderId} FOR UPDATE`;
            const results = [];
            for (const entry of requests) {
            const item = await tx.warehouseReturnItem.findFirst({ where: { id: entry.itemId, returnId: id } });
            if (!item) throw new WarehouseOperationError('الصنف غير موجود في المرتجع.', 404);
            const allocations = body.action === 'RELEASED' ? stockAllocations(entry.allocations) : [];
            if (item.disposition !== 'QUARANTINE') {
                if (item.disposition === body.action && JSON.stringify(stockAllocations(item.warehouseAllocations)) === JSON.stringify(allocations) && item.inspectionNote === body.note.trim()) { results.push(item); continue; }
                throw new WarehouseOperationError('سبق تسجيل نتيجة فحص مختلفة.');
            }
            if (body.action === 'RELEASED') {
                if (!allocations.length || new Set(allocations.map(a => a.batchId)).size !== allocations.length || allocations.reduce((n,a) => n+a.quantity,0) !== item.quantity) {
                    throw new WarehouseOperationError('وزع كامل كمية المرتجع على الدفعات الأصلية دون تكرار.', 400);
                }
                const pharmacyLots = await tx.batch.findMany({ where: { id: { in: stockAllocations(item.pharmacyAllocations).map(a => a.batchId) } } });
                const earlier = await tx.warehouseReturnItem.findMany({ where: { disposition: 'RELEASED', returnRecord: { orderId: record.orderId, warehouseId: ctx.warehouseId, status: 'ACCEPTED' } } });
                const sourceLine = await tx.warehouseOrderItem.findFirst({ where: { warehouseOrderId: record.orderId, drugId: item.drugId } });
                if (!sourceLine?.unitsPerPack) throw new WarehouseOperationError('وحدة الاستلام الأصلية غير موثقة.');
                const selectedBatches = await tx.warehouseBatch.findMany({ where: { id: { in: allocations.map(a => a.batchId) }, catalogItem: { warehouseId: ctx.warehouseId, barcode: item.barcode } } });
                for (const a of allocations) {
                    const batch = selectedBatches.find(b => b.id === a.batchId);
                    if (!batch || batch.expiryDate <= new Date() || !pharmacyLots.some(p => p.batchNumber === batch.batchNumber && p.expiryDate.toISOString().slice(0,10) === batch.expiryDate.toISOString().slice(0,10))) {
                        throw new WarehouseOperationError('الدفعة غير صالحة للبيع أو لا تطابق رقم وصلاحية دفعة الصيدلية الأصلية.');
                    }
                    const shipped = await tx.warehouseStockMove.aggregate({ where: { batchId: batch.id, orderId: record.orderId, type: 'SHIPMENT' }, _sum: { quantity: true } });
                    const originalMoves = await tx.warehouseStockMove.findMany({ where: { batchId: batch.id, orderId: record.orderId, type: 'SHIPMENT' } });
                    const unitCost = originalMoves.every(m => m.unitCost !== null) ? originalMoves.reduce((sum, m) => sum + Math.abs(m.quantity) * m.unitCost!, 0) / Math.abs(shipped._sum.quantity || 1) : null;
                    const matchingIds = new Set(pharmacyLots.filter(p => p.batchNumber === batch.batchNumber && p.expiryDate.toISOString().slice(0,10) === batch.expiryDate.toISOString().slice(0,10)).map(p => p.id));
                    const matchingQuantity = stockAllocations(item.pharmacyAllocations).filter(a => matchingIds.has(a.batchId)).reduce((sum,a) => sum+a.quantity,0);
                    const sameLotIds = new Set(selectedBatches.filter(b => b.batchNumber === batch.batchNumber && b.expiryDate.toISOString().slice(0,10) === batch.expiryDate.toISOString().slice(0,10)).map(b => b.id));
                    const sameLotQuantity = allocations.filter(a => sameLotIds.has(a.batchId)).reduce((sum,a) => sum+a.quantity,0);
                    if (sameLotQuantity * sourceLine.unitsPerPack > matchingQuantity) throw new WarehouseOperationError('الكمية لا تطابق دفعة الصيدلية المحجوزة.');
                    const released = earlier.flatMap(i => stockAllocations(i.warehouseAllocations)).filter(x => x.batchId === batch.id).reduce((n,x) => n+x.quantity,0);
                    if (a.quantity + released > Math.abs(shipped._sum.quantity ?? 0)) throw new WarehouseOperationError('الكمية تتجاوز ما خرج من هذه الدفعة في الطلب الأصلي.');
                    await tx.warehouseBatch.update({ where: { id: batch.id }, data: { quantity: { increment: a.quantity } } });
                    await tx.warehouseStockMove.create({ data: { catalogItemId: batch.catalogItemId, batchId: batch.id,
                        type: 'RETURN', quantity: a.quantity, unitCost, orderId: record.orderId, actorName: ctx.user.name ?? ctx.user.email,
                        reason: `مرتجع ${id} — فحص: ${body.note.trim()}` } });
                }
            }
            results.push(await tx.warehouseReturnItem.update({ where: { id: item.id }, data: { disposition: body.action,
                inspectionNote: body.note.trim(), inspectedBy: ctx.user.id, inspectedAt: new Date(), warehouseAllocations: allocations } }));
            }
            return results;
        }, { maxWait: 20000, timeout: 30000 });
        return NextResponse.json({ item: items[0], items });
    } catch (error) {
        if (error instanceof WarehouseOperationError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('return inspection failed', error);
        return NextResponse.json({ error: 'تعذر حفظ الفحص.' }, { status: 500 });
    }
}
