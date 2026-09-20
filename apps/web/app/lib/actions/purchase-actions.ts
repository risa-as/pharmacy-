'use server';
import { Prisma } from '@prisma/client';

import { prisma } from '@/app/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { logAudit } from '@/app/lib/audit';
import { receivePurchaseStock } from '@/app/lib/purchase-receipt';
import { computeShippedBatchPrefill, type ShippedBatchPrefill } from '@/app/lib/shipped-batch-prefill';

// Smart-reorder tuning (matches /api/smart-order).
const VELOCITY_WINDOW_DAYS = 30; // sales look-back window
const LEAD_TIME_DAYS = 14;       // typical supplier lead time in Iraq
const SAFETY_STOCK_DAYS = 7;     // safety buffer

export async function getLowStockInventory(branchId?: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return [];
    const { tenantBranchWhere } = tenantCtx;

    // 1. Fetch inventory based on branchId (if provided) or tenantBranchWhere
    const finalWhere = { AND: [tenantBranchWhere, ...(branchId ? [{ branchId }] : [])] };

    const inventories = await prisma.inventory.findMany({
        where: finalWhere,
        include: {
            batches: true,
            branch: true,
        }
    });

    // 2. Fetch all Global Drugs to map names
    const drugIds = inventories.map((i: any) => i.drugId);
    const drugs = await prisma.globalDrug.findMany({
        where: { id: { in: drugIds } }
    });
    const drugMap = new Map<string, any>(drugs.map((d: any) => [d.id, d]));

    // 3. Filter for Low Stock
    const lowStockItems = inventories.map((inv: any) => {
        const currentStock = inv.batches.reduce((sum: number, b: any) => sum + b.quantity, 0);
        const drug = drugMap.get(inv.drugId);

        return {
            inventoryId: inv.id,
            drugId: inv.drugId,
            drugName: drug?.tradeName || 'Unknown',
            barcode: drug?.barcode,
            currentStock,
            minStock: inv.minStock,
            maxStock: inv.maxStock,
            cost: inv.cost,
            branchId: inv.branchId,
            branchName: inv.branch.name
        };
    }).filter((item: any) => item.currentStock < item.minStock);

    // 4. Exclude items already in PENDING purchases
    const pendingFinalWhere = { AND: [tenantBranchWhere, { status: 'PENDING' }, ...(branchId ? [{ branchId }] : [])] };
    const pendingPurchases = await prisma.purchase.findMany({
        where: pendingFinalWhere,
        include: { items: true }
    });

    const pendingDrugIds = new Set<string>();
    pendingPurchases.forEach((p: any) => {
        p.items.forEach((i: any) => pendingDrugIds.add(i.drugId));
    });

    const filtered = lowStockItems.filter((item: any) => !pendingDrugIds.has(item.drugId));
    if (filtered.length === 0) return [];

    // 5. Compute sales velocity per (drug, branch) so the suggested quantity is
    //    demand-driven (avg daily sales × lead+safety) instead of a flat top-up.
    //    Items with no recent sales fall back to "fill to max stock".
    const neededDrugIds = filtered.map((i: any) => i.drugId);
    const velocityStart = new Date();
    velocityStart.setDate(velocityStart.getDate() - VELOCITY_WINDOW_DAYS);

    const recentSaleItems = await prisma.saleItem.findMany({
        where: {
            drugId: { in: neededDrugIds },
            sale: { AND: [tenantBranchWhere, { createdAt: { gte: velocityStart } }, ...(branchId ? [{ branchId }] : [])] },
        },
        select: { drugId: true, quantity: true, sale: { select: { branchId: true } } },
    });

    const soldByKey = new Map<string, number>();
    for (const it of recentSaleItems) {
        const key = `${it.drugId}:${(it as any).sale?.branchId ?? ''}`;
        soldByKey.set(key, (soldByKey.get(key) || 0) + it.quantity);
    }

    return filtered
        .map((item: any) => {
            const totalSold = soldByKey.get(`${item.drugId}:${item.branchId}`) || 0;
            const averageDailySales = totalSold / VELOCITY_WINDOW_DAYS;
            const velocityQty = Math.ceil(averageDailySales * (LEAD_TIME_DAYS + SAFETY_STOCK_DAYS));
            const fallbackQty = Math.max(0, item.maxStock - item.currentStock);
            return {
                ...item,
                suggestedQty: Math.max(1, averageDailySales > 0 ? velocityQty : fallbackQty),
                averageDailySales: Math.round(averageDailySales * 100) / 100,
                totalSoldLast30Days: totalSold,
            };
        })
        .sort((a: any, b: any) => a.currentStock - b.currentStock);
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
    if (tenantCtx instanceof NextResponse) return [];
    if (!tenantCtx.organizationId && tenantCtx.user.role !== 'SUPER_ADMIN') return [];
    const tenantWhere = tenantCtx.user.role === 'SUPER_ADMIN' ? {} : { organizationId: tenantCtx.organizationId };

    return await prisma.supplier.findMany({
        where: tenantWhere,
        orderBy: { name: 'asc' }
    });
}

export async function getPurchases(branchId?: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return []; // Fallback empty array instead of exposing errors in TS
    const { tenantBranchWhere } = tenantCtx;

    let finalWhere = { ...tenantBranchWhere };
    if (branchId) {
        finalWhere = { AND: [tenantBranchWhere, { branchId }] };
    }

    return await prisma.purchase.findMany({
        where: finalWhere,
        include: {
            supplier: true,
            branch: true,
            _count: { select: { items: true } }
        },
        orderBy: { createdAt: 'desc' }
    });
}

export async function getPurchaseDetails(id: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;

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
        if (linkedOrder) {
            const moves = await prisma.warehouseStockMove.findMany({
                where: { orderId: linkedOrder.orderId, type: 'SHIPMENT', batchId: { not: null } },
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
    if (!tenantCtx.userPermissions.canCreatePurchase) throw new Error('ليس لديك صلاحية استلام المشتريات.');
    if (typeof isPaid !== 'boolean') throw new Error('حالة الدفع غير صالحة.');
    const result = await receivePurchaseStock(prisma, purchaseId, tenantCtx.tenantBranchWhere, items, isPaid, tenantCtx.user);
    revalidatePath('/dashboard/purchases');
    revalidatePath(`/dashboard/purchases/${purchaseId}`);
    return result;
}
