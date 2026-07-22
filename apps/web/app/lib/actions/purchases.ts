'use server';

import { prisma } from '@/app/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { logAudit } from '@/app/lib/audit';

// ─── جلب الأدوية المتاحة للشراء ───────────────────────────────────────────

export async function getDrugsForPurchase() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return [];

    // جلب معرّفات فروع المؤسسة
    const orgBranchIds = tenantCtx.organizationId
        ? await prisma.branch
              .findMany({ where: { organizationId: tenantCtx.organizationId }, select: { id: true } })
              .then((bs: any[]) => bs.map((b: any) => b.id))
        : [];

    // الأدوية الموجودة في مخزون فروع المؤسسة + الأدوية المرتبطة بالمؤسسة مباشرة
    const drugs = await prisma.globalDrug.findMany({
        where: {
            OR: [
                ...(tenantCtx.organizationId ? [{ organizationId: tenantCtx.organizationId }] : []),
                ...(orgBranchIds.length > 0
                    ? [{ inventories: { some: { branchId: { in: orgBranchIds } } } }]
                    : []),
            ],
        },
        select: { id: true, tradeName: true, barcode: true, scientificName: true },
        orderBy: { tradeName: 'asc' },
    });
    return drugs;
}

// ─── توليد رقم فاتورة تلقائي ──────────────────────────────────────────────

export async function generateInvoiceNumber(): Promise<string> {
    const count = await prisma.purchase.count();
    const date = new Date();
    const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    return `PO-${ymd}-${String(count + 1).padStart(4, '0')}`;
}

// ─── قائمة فواتير مورد معين ───────────────────────────────────────────────

export async function getPurchasesBySupplier(supplierId: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return [];

    const orgBranchIds = await prisma.branch
        .findMany({
            where: { organizationId: tenantCtx.organizationId || '' },
            select: { id: true },
        })
        .then((bs: any[]) => bs.map((b: any) => b.id));

    const purchases = await prisma.purchase.findMany({
        where: { supplierId, branchId: { in: orgBranchIds } },
        include: {
            branch: { select: { name: true } },
            _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
    });
    return purchases;
}

// ─── تفاصيل فاتورة واحدة ─────────────────────────────────────────────────

export async function getPurchaseById(purchaseId: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;

    const purchase = await prisma.purchase.findUnique({
        where: { id: purchaseId },
        include: {
            supplier: { select: { id: true, name: true, phone: true, address: true } },
            branch: { select: { name: true } },
            items: {
                include: {
                    drug: {
                        select: { tradeName: true, barcode: true, scientificName: true },
                    },
                },
            },
        },
    });
    return purchase;
}

// ─── إنشاء فاتورة شراء جديدة + تحديث المخزون ────────────────────────────

export async function createPurchase(data: {
    supplierId: string;
    branchId: string;
    invoiceNumber?: string;
    items: Array<{
        drugId: string;
        quantity: number;
        cost: number;
        expiryDate?: string;
        batchNumber?: string;
    }>;
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { success: false, error: 'غير مصرح' };
    if (!tenantCtx.userPermissions.canCreatePurchase) {
        return { success: false, error: 'ليس لديك صلاحية لإنشاء فواتير الشراء.' };
    }

    try {
        const { supplierId, branchId, invoiceNumber, items } = data;

        if (!items || items.length === 0)
            return { success: false, error: 'يجب إضافة صنف واحد على الأقل' };

        // التحقق من أن المورد ينتمي للمؤسسة
        const supplier = await prisma.supplier.findUnique({
            where: { id: supplierId, organizationId: tenantCtx.organizationId || undefined },
        });
        if (!supplier) return { success: false, error: 'المورد غير موجود' };

        const total = items.reduce((sum, item) => sum + item.cost * item.quantity, 0);

        let purchaseId = '';

        await prisma.$transaction(async (tx: any) => {
            // 1. إنشاء الفاتورة
            const purchase = await tx.purchase.create({
                data: {
                    supplierId,
                    branchId,
                    total,
                    paidAmount: 0,
                    status: 'COMPLETED',
                    invoiceNumber: invoiceNumber || null,
                    items: {
                        create: items.map((item) => ({
                            drugId: item.drugId,
                            quantity: item.quantity,
                            cost: item.cost,
                            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
                            batchNumber: item.batchNumber || `BATCH-${Date.now()}`,
                        })),
                    },
                },
            });
            purchaseId = purchase.id;

            // 2. تحديث المخزون وإضافة دفعات
            for (const item of items) {
                let inventory = await tx.inventory.findUnique({
                    where: { drugId_branchId: { drugId: item.drugId, branchId } },
                });

                if (!inventory) {
                    inventory = await tx.inventory.create({
                        data: {
                            drugId: item.drugId,
                            branchId,
                            price: 0,
                            cost: item.cost,
                        },
                    });
                } else {
                    await tx.inventory.update({
                        where: { id: inventory.id },
                        data: { cost: item.cost },
                    });
                }

                const defaultExpiry = new Date();
                defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 2);

                await tx.batch.create({
                    data: {
                        inventoryId: inventory.id,
                        quantity: item.quantity,
                        initialQuantity: item.quantity,
                        costPrice: item.cost,
                        batchNumber:
                            item.batchNumber ||
                            `B-${Date.now()}-${item.drugId.slice(0, 4).toUpperCase()}`,
                        expiryDate: item.expiryDate ? new Date(item.expiryDate) : defaultExpiry,
                        supplierId,
                    },
                });
            }

            // 3. تحديث رصيد المورد
            await tx.supplier.update({
                where: { id: supplierId },
                data: { balance: { increment: total } },
            });
        });

        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'CREATE',
            entity: 'PURCHASE' as any,
            details: JSON.stringify({ supplierId, total, itemCount: items.length, purchaseId }),
            branchId,
        });

        revalidatePath(`/dashboard/suppliers/${supplierId}`);
        revalidatePath(`/dashboard/suppliers/${supplierId}/purchases`);
        revalidatePath('/dashboard/suppliers');
        revalidatePath('/dashboard/inventory');

        return { success: true, purchaseId };
    } catch (error) {
        console.error('Create Purchase Error:', error);
        return { success: false, error: 'فشل في إنشاء فاتورة الشراء' };
    }
}
