import { Prisma } from '@prisma/client';
'use server';

import { prisma } from '@/app/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { logAudit } from '@/app/lib/audit';

export async function getLowStockInventory(branchId?: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return [];
    const { tenantBranchWhere } = tenantCtx;

    // 1. Fetch inventory based on branchId (if provided) or tenantBranchWhere
    const finalWhere = branchId ? { ...tenantBranchWhere, branchId } : { ...tenantBranchWhere };

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
            suggestedQty: Math.max(0, inv.maxStock - currentStock),
            branchId: inv.branchId,
            branchName: inv.branch.name
        };
    }).filter((item: any) => item.currentStock < item.minStock);

    // 4. Exclude items already in PENDING purchases
    const pendingFinalWhere = branchId ? { ...tenantBranchWhere, branchId, status: 'PENDING' } : { ...tenantBranchWhere, status: 'PENDING' };
    const pendingPurchases = await prisma.purchase.findMany({
        where: pendingFinalWhere,
        include: { items: true }
    });

    const pendingDrugIds = new Set<string>();
    pendingPurchases.forEach((p: any) => {
        p.items.forEach((i: any) => pendingDrugIds.add(i.drugId));
    });

    return lowStockItems.filter((item: any) => !pendingDrugIds.has(item.drugId));
}

export async function createSmartPurchase(branchId: string, supplierId: string, items: any[]) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return { success: false, error: 'Unauthorized Session' };
        if (!tenantCtx.userPermissions.canCreatePurchase) {
            return { success: false, error: 'ليس لديك صلاحية لإنشاء طلبات الشراء.' };
        }
        const { tenantBranchWhere } = tenantCtx;

        // Optionally enforce that branchId matches `tenantBranchWhere` if this is not admin...

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
    const { tenantWhere } = tenantCtx;

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
        finalWhere = { ...finalWhere, branchId };
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
        where: { id, branch: { organizationId: tenantCtx.organizationId || undefined } },
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

    return {
        ...purchase,
        items: purchase.items.map((item: any) => ({
            ...item,
            drugName: drugMap.get(item.drugId) || 'Unknown Drug'
        }))
    };
}

export async function deletePurchase(purchaseId: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { success: false, error: 'غير مصرح' };

    const purchase = await prisma.purchase.findFirst({
        where: { id: purchaseId, branch: { organizationId: tenantCtx.organizationId || undefined } },
    });

    if (!purchase) return { success: false, error: 'الطلب غير موجود' };
    if (purchase.status === 'COMPLETED' || purchase.status === 'RECEIVED') {
        return { success: false, error: 'لا يمكن حذف الطلبات المكتملة' };
    }

    await prisma.purchaseItem.deleteMany({ where: { purchaseId } });
    await prisma.purchase.delete({ where: { id: purchaseId } });

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

    const purchase = await prisma.purchase.findFirst({
        where: { id: purchaseId, branch: { organizationId: tenantCtx.organizationId || undefined } },
    });

    if (!purchase) return { success: false, error: 'الطلب غير موجود' };
    if (purchase.status !== 'PENDING') return { success: false, error: 'يمكن إلغاء الطلبات المعلقة فقط' };

    await prisma.purchase.update({
        where: { id: purchaseId },
        data: { status: 'CANCELLED' },
    });

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
    if (tenantCtx instanceof NextResponse) throw new Error("غير مصرح");
    // 1. Get Purchase and verify ownership
    const purchase = await prisma.purchase.findFirst({
        where: { id: purchaseId, branch: { organizationId: tenantCtx.organizationId || undefined } },
        include: { items: true, supplier: true }
    });

    if (!purchase) throw new Error("لم يتم العثور على طلب الشراء");
    if (purchase.status !== 'PENDING') throw new Error("تمت معالجة هذا الطلب مسبقاً");

    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // 2. Process each item
        for (const receivedItem of items) {
            const purchaseItem = purchase.items.find((i: any) => i.id === receivedItem.itemId);
            if (!purchaseItem) continue;

            // Find Inventory for this branch & drug
            const inventory = await tx.inventory.findFirst({
                where: {
                    branchId: purchase.branchId,
                    drugId: purchaseItem.drugId
                }
            });

            if (!inventory) {
                // Should not happen if Smart Order created it, but maybe manual order for new drug?
                // If not found, create Inventory?
                // Let's assume it exists for now or throw.
                throw new Error(`لم يتم العثور على المخزون للدواء ${purchaseItem.drugId}`);
            }

            // Create Batch
            await tx.batch.create({
                data: {
                    inventoryId: inventory.id,
                    quantity: receivedItem.quantity,
                    expiryDate: receivedItem.expiryDate,
                    batchNumber: receivedItem.batchNumber,
                    costPrice: purchaseItem.cost
                }
            });

            // Update Inventory Cost (Last Cost Strategy)
            await tx.inventory.update({
                where: { id: inventory.id },
                data: {
                    cost: purchaseItem.cost,
                    updatedAt: new Date()
                }
            });
        }

        // 3. Handle payment tracking
        const paidAmount = isPaid ? purchase.total : 0;

        if (isPaid) {
            await tx.expense.create({
                data: {
                    branchId: purchase.branchId,
                    amount: purchase.total,
                    category: 'مشتريات بضاعة',
                    description: `فاتورة شراء #${purchase.invoiceNumber || purchase.id.slice(0, 8)} من: ${purchase.supplier.name}`,
                    date: new Date()
                }
            });
        }

        // 4. Update supplier balance (unpaid portion)
        const unpaidAmount = purchase.total - paidAmount;
        if (unpaidAmount > 0) {
            await tx.supplier.update({
                where: { id: purchase.supplierId },
                data: { balance: { increment: unpaidAmount } }
            });
        }

        // 5. Update Purchase Status
        return await tx.purchase.update({
            where: { id: purchaseId },
            data: {
                status: 'COMPLETED',
                paidAmount,
                updatedAt: new Date()
            }
        });
    });
}
