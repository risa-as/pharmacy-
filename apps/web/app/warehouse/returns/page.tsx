// المرحلة 5 (الصقل التجاري) §Part 4: صفحة «الإرجاعات» — طلبات إرجاع الصيدليات
// على طلبات مذاخر مُسلَّمة/قيد التسليم. القبول/الرفض المالي الحقيقي يتم عبر
// PATCH /api/warehouse-portal/returns/[id] (canQuoteOrders) لا هنا.
import { prisma } from "@/app/lib/prisma";
import { getWarehouseContext } from "@/app/lib/warehouse-context";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasWarehousePermission } from "@/app/lib/warehouse-permissions";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import ReturnsClient from "./ReturnsClient";

export const dynamic = "force-dynamic";

export default async function WarehouseReturnsPage() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect("/dashboard");

    // نفس نمط app/warehouse/orders/page.tsx: قراءة مباشرة عبر Prisma، فبوابة
    // الصفحة نفسها (لا فقط إخفاء التبويب في layout.tsx) هي الحماية الفعلية.
    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    const canView =
        !!actor && actor.isActive !== false && actor.warehouseId === ctx.warehouseId && hasWarehousePermission(actor, 'canViewOrders');
    if (!canView) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="الإرجاعات" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    عرض الإرجاعات يتطلب صلاحية "عرض الطلبات" — راجع مالك المذخر.
                </div>
            </div>
        );
    }
    const canDecide = hasWarehousePermission(actor!, 'canQuoteOrders');

    const returns = await prisma.warehouseReturn.findMany({
        where: { warehouseId: ctx.warehouseId },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 50,
    });

    const shipmentOrders = await prisma.warehouseOrder.findMany({where:{id:{in:returns.map(r=>r.orderId)},warehouseId:ctx.warehouseId},select:{id:true,shipmentMode:true}});
    const shipmentModes = new Map(shipmentOrders.map(o=>[o.id,o.shipmentMode]));
    const orgIds = Array.from(new Set(returns.map((r) => r.organizationId)));
    const orgs = orgIds.length
        ? await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
        : [];
    const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));
    const drugIds = Array.from(new Set(returns.flatMap(row => row.items.map(item => item.drugId))));
    const drugs = drugIds.length ? await prisma.globalDrug.findMany({ where: { id: { in: drugIds } }, select: { id: true, tradeName: true } }) : [];
    const drugNames = new Map(drugs.map(drug => [drug.id, drug.tradeName]));

    const initialReturns = returns.map((r) => ({
        id: r.id,
        shipmentMode: shipmentModes.get(r.orderId) ?? null,
        creditNoteNumber: r.creditNoteNumber,
        orderId: r.orderId,
        organizationName: orgNameById.get(r.organizationId) ?? r.organizationId,
        reason: r.reason,
        totalAmount: r.totalAmount,
        status: r.status,
        creditBalance: hasWarehousePermission(actor!, 'canViewFinance') ? r.creditBalance : null,
        refundedAmount: hasWarehousePermission(actor!, 'canViewFinance') ? r.refundedAmount : null,
        actorName: r.actorName,
        createdAt: r.createdAt.toISOString(),
        items: r.items.map((it) => ({ id: it.id, drugName: drugNames.get(it.drugId) ?? null, barcode: it.barcode, quantity: it.quantity, unitPrice: it.unitPrice, disposition: it.disposition })),
    }));

    return <ReturnsClient initialReturns={initialReturns} canDecide={canDecide}
        canRelease={hasWarehousePermission(actor!, 'canAdjustStock')} canDispose={hasWarehousePermission(actor!, 'canWriteOffStock')}
        canRefund={hasWarehousePermission(actor!, 'canRecordPayment')} />;
}
