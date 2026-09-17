// المرحلة 4 من ميزة المذاخر: صفحة «طلبات المذاخر» — متابعة الصيدلي (خادم).
// النطاق: فرع المستخدم؛ أدمن المؤسسة يرى فروع مؤسسته (warehouseOrderScope).
import { getTenantContext } from '@/app/lib/tenant-utils';
import { requireFeature } from '@/app/lib/page-guards';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { warehouseOrderScope } from '@/app/lib/warehouse-access';
import OrdersTrackClient from './OrdersTrackClient';
import { linkedPurchaseId, receiptState } from '@/app/lib/warehouse-order-receipt';

export const dynamic = 'force-dynamic';

export default async function WarehouseOrdersTrackPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');

    const { organizationId } = tenantCtx;
    if (organizationId) {
        const upgrade = await requireFeature(organizationId, 'warehouseManagement');
        if (upgrade) return <UpgradeRequired {...upgrade} />;
    }

    const scope = warehouseOrderScope({
        role: tenantCtx.user.role,
        organizationId: tenantCtx.organizationId,
        branchId: tenantCtx.user.branchId,
    });
    if (!scope) redirect('/dashboard');

    const orders = await prisma.warehouseOrder.findMany({
        where: scope,
        include: {
            warehouse: { select: { name: true } },
            branch: { select: { name: true } },
            items: { include: { drug: { select: { tradeName: true, barcode: true } } } },
            events: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
    });

    // حالة فاتورة الشراء المرتبطة بكل طلب معتمد: هي ما يحدد هل دخلت الأدوية
    // الدفعات فعلاً. الاعتماد وحده لا يُدخل شيئاً للمخزون.
    const purchaseIds = orders.map(linkedPurchaseId).filter((id): id is string => !!id);
    const purchases = purchaseIds.length
        ? await prisma.purchase.findMany({
              where: { id: { in: purchaseIds }, ...tenantCtx.tenantBranchWhere },
              select: { id: true, status: true },
          })
        : [];
    const purchaseStatus = new Map(purchases.map((p) => [p.id, p.status]));
    const withReceipt = orders.map((o) => {
        const purchaseId = linkedPurchaseId(o);
        return {
            ...o,
            purchaseId,
            receiptState: receiptState(o.status, purchaseId, purchaseId ? purchaseStatus.get(purchaseId) ?? null : null),
        };
    });

    return <OrdersTrackClient initialOrders={JSON.parse(JSON.stringify(withReceipt))} />;
}
