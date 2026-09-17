// مشتريات المذخر وذممه الدائنة: صفحة «المشتريات» — قراءة الخادم الأولية
// (موردون + فواتير شراء + ملخّص الذمم الدائنة) ثم عميل تفاعلي لإدارة
// الموردين، تسجيل فواتير شراء جديدة (تُنشئ المخزون مباشرة)، وتسجيل دفعات
// للموردين. نفس بنية app/warehouse/accounts/page.tsx حرفياً بالاتجاه المعاكس.
import { prisma } from "@/app/lib/prisma";
import { getWarehouseContext } from "@/app/lib/warehouse-context";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasWarehousePermission } from "@/app/lib/warehouse-permissions";
import { agingBucket, summarizeReceivables } from "@/app/lib/warehouse-accounts";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import PurchasesClient from "./PurchasesClient";

export const dynamic = "force-dynamic";

export default async function WarehousePurchasesPage() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect("/dashboard");

    // نفس نمط الاستعلام الحي عن الفاعل في accounts/customers/reports —
    // warehouseUserType/permissions ليسا في الجلسة، وهذه الصفحة تقرأ عبر
    // Prisma مباشرة لا عبر الـ API، فبوابة الـ API وحدها لا تكفي حماية.
    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    const belongsAndActive = !!actor && actor.isActive !== false && actor.warehouseId === ctx.warehouseId;
    const canView = belongsAndActive && hasWarehousePermission(actor!, "canViewPurchases");

    if (!canView) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="المشتريات" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    عرض المشتريات يتطلب صلاحية "عرض المشتريات" — راجع مالك المذخر.
                </div>
            </div>
        );
    }

    const canCreatePurchase = hasWarehousePermission(actor!, "canCreatePurchase");
    const canPaySupplier = hasWarehousePermission(actor!, "canPaySupplier");

    const [suppliers, purchases, openPurchasesForSummary] = await Promise.all([
        prisma.warehouseSupplier.findMany({
            where: { warehouseId: ctx.warehouseId },
            orderBy: { name: "asc" },
        }),
        prisma.warehousePurchase.findMany({
            where: { warehouseId: ctx.warehouseId },
            include: {
                supplier: { select: { name: true } },
                _count: { select: { payments: true, items: true } },
            },
            orderBy: { issuedAt: "desc" },
            take: 300,
        }),
        // نفس نمط accounts/page.tsx: الملخّص (البطاقات + شريط التقادم) يُحسب
        // من استعلام غير مقصوص كي لا يقلّ الرقم المعروض زوراً عند تجاوز مذخر
        // 300 فاتورة شراء.
        prisma.warehousePurchase.findMany({
            where: { warehouseId: ctx.warehouseId, status: { in: ["UNPAID", "PARTIAL"] } },
            select: { total: true, paidAmount: true, status: true, dueAt: true },
        }),
    ]);

    const now = new Date();
    const supplierRows = suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        contactPerson: s.contactPerson,
        notes: s.notes,
        isActive: s.isActive,
    }));

    const purchaseRows = purchases.map((p) => ({
        id: p.id,
        supplierId: p.supplierId,
        supplierName: p.supplier.name,
        invoiceNumber: p.invoiceNumber,
        total: p.total,
        paidAmount: p.paidAmount,
        remaining: Math.max(p.total - p.paidAmount, 0),
        status: p.status,
        issuedAt: p.issuedAt.toISOString(),
        dueAt: p.dueAt ? p.dueAt.toISOString() : null,
        aging: agingBucket(p.dueAt, now),
        itemsCount: p._count.items,
        paymentsCount: p._count.payments,
    }));

    const summary = summarizeReceivables(openPurchasesForSummary, now);

    return (
        <PurchasesClient
            initialSuppliers={supplierRows}
            initialPurchases={purchaseRows}
            initialSummary={summary}
            canCreatePurchase={canCreatePurchase}
            canPaySupplier={canPaySupplier}
        />
    );
}
