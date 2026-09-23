'use server';
import { resolvePurchaseIdentity } from '@/app/lib/purchase-drug-identity';
import { pharmacyDrugScope } from '@/app/lib/drug-scope';
import { getPlanningData } from '@/app/lib/smart-purchasing-data';
import { planRow } from '@/app/lib/smart-purchasing';
import { Prisma } from '@prisma/client';

import { prisma } from '@/app/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { logAudit } from '@/app/lib/audit';
import { receivePurchaseStock } from '@/app/lib/purchase-receipt';
import { computeShippedBatchPrefill, type ShippedBatchPrefill } from '@/app/lib/shipped-batch-prefill';

export async function getSmartPurchasingData(branchId?: string, from?: string, to?: string) {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) throw new Error('تعذر التحقق من الجلسة');
    return getPlanningData(ctx, branchId, from, to);
}

export async function getLowStockInventory(branchId?: string) {
    const data = await getSmartPurchasingData(branchId);
    return data.rows.map(row => planRow(row, { coverageDays: 15, leadDays: 0, safetyDays: 0, fromArrival: false }, data.today)).filter(row => row.action);
}

/** Revalidate the handoff on the server; browser storage is never authoritative. */
export async function prepareSmartOrderDraft(branchId: string, input: { drugId: string; quantity: number; unitsPerPack: number }[]) {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse || !ctx.userPermissions.canCreatePurchase) throw new Error('ليس لديك صلاحية إنشاء الطلب');
    if (!Array.isArray(input) || !input.length || input.length > 500 || input.some(l=>!l || typeof l.drugId !== 'string' || !Number.isSafeInteger(l.quantity) || l.quantity < 1 || l.quantity > 1000000 || !Number.isSafeInteger(l.unitsPerPack) || l.unitsPerPack < 1) || new Set(input.map(l=>l.drugId)).size !== input.length) throw new Error('مسودة غير صالحة');
    if (!await prisma.branch.findFirst({where:{AND:[ctx.branchModelWhere,{id:branchId}]},select:{id:true}})) throw new Error('الفرع خارج النطاق');
    const inventory = await prisma.inventory.findMany({where:{branchId,drugId:{in:input.map(l=>l.drugId)},drug:{isActive:true,...pharmacyDrugScope(ctx.organizationId)}},include:{drug:true,batches:{where:{quantity:{gt:0},expiryDate:{gte:new Date()}},select:{quantity:true}}}});
    if(inventory.length!==input.length)throw new Error('تغيرت الأصناف المتاحة؛ حدّث تحليل الشراء');
    const candidates = await prisma.globalDrug.findMany({where:{...pharmacyDrugScope(ctx.organizationId),barcode:{in:inventory.map(i=>i.drug.barcode)}},select:{id:true,barcode:true,tradeName:true,scientificName:true,organizationId:true}});
    return input.map(line=>{
        const inv=inventory.find(i=>i.drugId===line.drugId)!;
        if(!inv.drug.unitsPerPackConfirmedAt || inv.drug.unitsPerPack!==line.unitsPerPack) throw new Error('تغيرت التعبئة أو لم تؤكد؛ حدّث تحليل الشراء قبل المراجعة');
        const identity=resolvePurchaseIdentity(inv.drug,candidates);
        return {drugId:inv.drugId,globalDrugId:identity.globalDrugId,tradeName:inv.drug.tradeName,scientificName:inv.drug.scientificName,barcode:inv.drug.barcode,currentStock:inv.batches.reduce((s,b)=>s+b.quantity,0),inInventory:true,
            orderability:identity.reason,orderabilityReason:identity.reason==='AMBIGUOUS_BARCODE'?'مطابقة الباركود تحتاج مراجعة':identity.reason==='NO_BARCODE'?'الباركود غير متوفر':null,
            quantity:line.quantity,unitsPerPack:line.unitsPerPack,comparison:null,selectedSupplierId:null,manuallyChosen:false,chosenPriceAtSelection:null,manualWarehouseId:null,manualWarehouseName:null};
    });
}

export async function createSmartPurchase(branchId: string, supplierId: string, items: any[]) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return { success: false, error: 'Unauthorized Session' };
        if (!tenantCtx.userPermissions.canCreatePurchase) {
            return { success: false, error: 'ليس لديك صلاحية لإنشاء طلبات الشراء.' };
        }
        const { tenantBranchWhere } = tenantCtx;


        const branch = await prisma.branch.findFirst({ where: { AND: [tenantCtx.branchModelWhere, { id: branchId }] } });
        if (!branch) return { success: false, error: 'الفرع لا ينتمي إلى نطاقك.' };
        const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organizationId: branch.organizationId } });
        if (!supplier) return { success: false, error: 'المورد لا ينتمي إلى مؤسسة الفرع.' };
        if (!Array.isArray(items) || !items.length || items.length > 500 ||
            items.some((i) => !i || typeof i.drugId !== 'string' || !Number.isSafeInteger(i.quantity) || i.quantity <= 0 ||
                typeof i.cost !== 'number' || !Number.isFinite(i.cost) || i.cost < 0)) {
            return { success: false, error: 'بنود الشراء غير صالحة.' };
        }
        const drugIds = Array.from(new Set(items.map((i) => i.drugId)));
        const count = await prisma.globalDrug.count({
            where: { id: { in: drugIds }, OR: [{ organizationId: null, warehouseId: null }, { organizationId: branch.organizationId }] },
        });
        if (count !== drugIds.length) return { success: false, error: 'صنف غير متاح لمؤسسة الفرع.' };

        const total = items.reduce((sum: any, item: any) => sum + (item.quantity * item.cost), 0);

        const purchase = await prisma.purchase.create({
            data: {
                branchId,
                supplierId,
                total,
                status: 'PENDING',
                items: {
                    create: items.map((item: any) => ({
                        drugId: item.drugId,
                        quantity: item.quantity,
                        cost: item.cost
                    }))
                }
            }
        });

        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'CREATE',
            entity: 'PURCHASE',
            entityId: purchase.id,
            details: JSON.stringify({ supplierId, branchId, total, itemCount: items.length }),
            branchId,
        });

        revalidatePath('/dashboard/purchases');
        return { success: true, purchaseId: purchase.id };
    } catch (error) {
        console.error('Smart Purchase Error:', error);
        return { success: false, error: 'فشل في إنشاء طلب الشراء. يرجى المحاولة مرة أخرى.' };
    }
}

export async function getSuppliers() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse || !tenantCtx.userPermissions.canViewSuppliers) return [];
    if (!tenantCtx.organizationId && tenantCtx.user.role !== 'SUPER_ADMIN') return [];
    const tenantWhere = tenantCtx.user.role === 'SUPER_ADMIN' ? {} : { organizationId: tenantCtx.organizationId };

    return await prisma.supplier.findMany({
        where: tenantWhere,
        orderBy: { name: 'asc' }
    });
}

export async function getPurchases(branchId?: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse || !tenantCtx.userPermissions.canViewSuppliers) return [];
    const { tenantBranchWhere } = tenantCtx;

    let finalWhere = { ...tenantBranchWhere };
    if (branchId) {
        finalWhere = { AND: [tenantBranchWhere, { branchId }] };
    }

    const purchases = await prisma.purchase.findMany({
        where: finalWhere,
        include: {
            supplier: true,
            branch: true,
            _count: { select: { items: true } }
        },
        orderBy: { createdAt: 'desc' }
    });
    const legacy = purchases.filter(p=>p.supplier.warehouseId&&!p.warehouseOrderId);
    const links = legacy.length ? await prisma.warehouseOrderEvent.findMany({where:{type:'APPROVED',order:tenantBranchWhere,OR:legacy.map(p=>({payload:{path:['purchaseId'],equals:p.id}}))},select:{orderId:true,payload:true}}) : [];
    const linked = new Map(links.map(e=>[(e.payload as any)?.purchaseId,e.orderId]));
    return purchases.map(p=>({...p,warehouseOrderId:p.warehouseOrderId||linked.get(p.id)||null}));

}

export async function getPurchaseDetails(id: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse || !tenantCtx.userPermissions.canViewSuppliers) return null;

    const purchase = await prisma.purchase.findFirst({
        where: { id, ...tenantCtx.tenantBranchWhere },
        include: {
            supplier: true,
            items: true
        }
    });

    if (!purchase) return null;

    // Fetch drug names efficiently
    const drugIds = purchase.items.map((i: any) => i.drugId);
    const drugs = await prisma.globalDrug.findMany({
        where: { id: { in: drugIds } },
        select: { id: true, tradeName: true }
    });
    const drugMap = new Map<string, any>(drugs.map((d: any) => [d.id, d.tradeName]));

    // فاتورة صادرة من طلب مذخر على المنصة: المذخر يعرف الدفعة/تاريخ الانتهاء
    // الحقيقيين مما شحنه فعلاً (WarehouseStockMove)، فنقترحهما على الصيدلاني
    // بدل أن يعيد كتابتهما يدوياً من فاتورة ورقية — انظر
    // app/lib/shipped-batch-prefill.ts لقاعدة التجميع ولماذا نمتنع عن الاقتراح
    // حين تتعدد الدفعات المصدر لنفس الدواء (تخصيص FEFO عبر أكثر من دفعة).
    //
    // البوابة الرخيصة: purchase.supplier.warehouseId (مُحمَّل أصلاً ضمن include
    // supplier أعلاه — بلا استعلام إضافي) يُميّز "مورد مرآة" لمذخر. المسار
    // الوحيد في الكود الذي يكتب حدث APPROVED الحامل purchaseId (app/api/
    // warehouses/orders/[id]/route.ts) يضبط Purchase.supplierId دائماً على
    // هذا المورد المرآة — سواء أُعيد استخدامه أو أُنشئ للتو، وكلاهما بـ
    // warehouseId غير فارغ بالتصميم. فحين تغيب هذه القيمة (فاتورة مورّد عادية،
    // الحالة الغالبة) لا يُنفَّذ أي استعلام إضافي إطلاقاً — لا حتى بحث حدث
    // APPROVED. صيدلية قد تختار يدوياً موردها المرآة لفاتورة عادية غير مرتبطة
    // فعلاً بطلب: البحث أدناه يعمل ولا يجد حدثاً مطابقاً، فتبقى النتيجة بلا
    // اقتراح بأمان — الفحص هنا تفاؤلي (تصفية تكلفة) لا شرط صحة.
    let prefillByDrug = new Map<string, ShippedBatchPrefill>();
    if (purchase.supplier?.warehouseId) {
        const linkedOrder = await prisma.warehouseOrderEvent.findFirst({
            where: { type: 'APPROVED', payload: { path: ['purchaseId'], equals: id } },
            select: { orderId: true },
        });
        const shippedOrderId = purchase.warehouseOrderId || linkedOrder?.orderId;
        if (shippedOrderId) {
            const shipment = await prisma.warehouseOrder.findUnique({where:{id:shippedOrderId},select:{shipmentMode:true,externalShipment:true}});
            if(shipment?.shipmentMode === 'ORDER_PORTAL' && Array.isArray(shipment.externalShipment)) prefillByDrug = computeShippedBatchPrefill(shipment.externalShipment as any);
            const moves = await prisma.warehouseStockMove.findMany({
                where: { orderId: shippedOrderId, type: 'SHIPMENT', batchId: { not: null } },
                select: {
                    catalogItemId: true,
                    quantity: true,
                    batch: { select: { batchNumber: true, expiryDate: true } },
                },
            });
            if (moves.length > 0) {
                const catalogItemIds = Array.from(new Set(moves.map((m: any) => m.catalogItemId)));
                const catalogItems = await prisma.warehouseCatalogItem.findMany({
                    where: { id: { in: catalogItemIds } },
                    select: { id: true, drugId: true },
                });
                const catalogDrugMap = new Map<string, string>(catalogItems.map((c: any) => [c.id, c.drugId]));
                const rows = moves
                    // onDelete: SetNull على batchId يضمن أن batch يغيب فقط حين تُحذف
                    // الدفعة فعلاً — لا يُفترض حصوله هنا، لكن الحارس دفاعي بلا كلفة.
                    .filter((m: any) => m.batch)
                    .map((m: any) => ({
                        drugId: catalogDrugMap.get(m.catalogItemId) ?? '',
                        batchNumber: m.batch.batchNumber,
                        expiryDate: m.batch.expiryDate,
                        quantity: m.quantity,
                    }))
                    .filter((r: any) => r.drugId);
                prefillByDrug = computeShippedBatchPrefill(rows);
            }
        }
    }

    return {
        ...purchase,
        items: purchase.items.map((item: any) => ({
            ...item,
            drugName: drugMap.get(item.drugId) || 'Unknown Drug',
            shippedPrefill: prefillByDrug.get(item.drugId) ?? null,
        }))
    };
}

export async function deletePurchase(purchaseId: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { success: false, error: 'غير مصرح' };
    if (!tenantCtx.userPermissions.canCreatePurchase) return { success: false, error: 'ليس لديك صلاحية إدارة المشتريات.' };

    const purchase = await prisma.purchase.findFirst({
        where: { id: purchaseId, ...tenantCtx.tenantBranchWhere },
    });

    if (!purchase) return { success: false, error: 'الطلب غير موجود' };
    if (purchase.status === 'COMPLETED' || purchase.status === 'RECEIVED') {
        return { success: false, error: 'لا يمكن حذف الطلبات المكتملة' };
    }

    await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Purchase" WHERE "id" = ${purchaseId} FOR UPDATE`;
        const current = await tx.purchase.findFirst({ where: { id: purchaseId, ...tenantCtx.tenantBranchWhere } });
        if (!current || !['PENDING', 'CANCELLED'].includes(current.status)) throw new Error('تغيرت حالة الطلب؛ لا يمكن حذفه.');
        const linked = await tx.warehouseOrderEvent.findFirst({ where: { type: 'APPROVED', payload: { path: ['purchaseId'], equals: purchaseId } } });
        if (linked) throw new Error('فاتورة مرتبطة بطلب مذخر؛ استخدم إلغاء الطلب من صفحة المذاخر.');
        await tx.purchaseItem.deleteMany({ where: { purchaseId } });
        await tx.purchase.delete({ where: { id: purchaseId } });
    });

    await logAudit({
        userId: tenantCtx.user.id,
        userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
        action: 'DELETE',
        entity: 'PURCHASE',
        entityId: purchaseId,
        details: JSON.stringify({ status: purchase.status }),
        branchId: purchase.branchId,
    });

    revalidatePath('/dashboard/purchases');
    return { success: true };
}

export async function cancelPurchase(purchaseId: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { success: false, error: 'غير مصرح' };
    if (!tenantCtx.userPermissions.canCreatePurchase) return { success: false, error: 'ليس لديك صلاحية إدارة المشتريات.' };

    const purchase = await prisma.purchase.findFirst({
        where: { id: purchaseId, ...tenantCtx.tenantBranchWhere },
    });

    if (!purchase) return { success: false, error: 'الطلب غير موجود' };
    if (purchase.status !== 'PENDING') return { success: false, error: 'يمكن إلغاء الطلبات المعلقة فقط' };

    const linked = await prisma.warehouseOrderEvent.findFirst({ where: { type: 'APPROVED', payload: { path: ['purchaseId'], equals: purchaseId } } });
    if (linked) return { success: false, error: 'ألغِ طلب المذخر المرتبط أولاً من صفحة طلبات المذاخر.' };
    const changed = await prisma.purchase.updateMany({
        where: { id: purchaseId, status: 'PENDING', ...tenantCtx.tenantBranchWhere },
        data: { status: 'CANCELLED' },
    });
    if (changed.count !== 1) return { success: false, error: 'تغيرت حالة الطلب أثناء المعالجة.' };

    await logAudit({
        userId: tenantCtx.user.id,
        userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
        action: 'UPDATE',
        entity: 'PURCHASE',
        entityId: purchaseId,
        details: JSON.stringify({ status: 'CANCELLED' }),
        branchId: purchase.branchId,
    });

    revalidatePath('/dashboard/purchases');
    revalidatePath(`/dashboard/purchases/${purchaseId}`);
    return { success: true };
}

export async function receivePurchase(purchaseId: string, items: { itemId: string, quantity: number, expiryDate: Date, batchNumber: string }[], isPaid: boolean = false) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) throw new Error('غير مصرح');
    if (!tenantCtx.userPermissions.canReceivePurchase) throw new Error('ليس لديك صلاحية استلام المشتريات.');
    if (typeof isPaid !== 'boolean') throw new Error('حالة الدفع غير صالحة.');
    const result = await receivePurchaseStock(prisma, purchaseId, tenantCtx.tenantBranchWhere, items, isPaid, tenantCtx.user);
    revalidatePath('/dashboard/purchases');
    revalidatePath(`/dashboard/purchases/${purchaseId}`);
    return result;
}
