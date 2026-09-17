// Phase 2 (الحسابات والعملاء) من نظام المذاخر B2B: صفحة «العملاء» — قراءة
// الخادم الأولية (نفس استعلام GET /api/warehouse-portal/customers) ثم عميل
// تفاعلي لتعديل الشروط وعرض كشف حساب كل صيدلية.
//
// Phase 3 (الأدوار والصلاحيات): canViewCustomers للوصول للصفحة أصلاً (هذه
// الصفحة تقرأ عبر Prisma مباشرة، لا عبر الـ API — إخفاء التبويب في
// layout.tsx واجهة فقط، فالبوابة الفعلية هنا)، وcanEditCustomerTerms لإظهار
// أدوات تعديل الشروط (كان مقصوراً على OWNER عبر canManageWarehouseUsers —
// الآن أي دور يملك الصلاحية فعلياً، افتراضياً OWNER وMANAGER).
import { prisma } from "@/app/lib/prisma";
import { getWarehouseContext } from "@/app/lib/warehouse-context";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasWarehousePermission } from "@/app/lib/warehouse-permissions";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import CustomersClient from "./CustomersClient";

export const dynamic = "force-dynamic";

export default async function WarehouseCustomersPage() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect("/dashboard");

    // نفس نمط app/warehouse/users/page.tsx: warehouseUserType/permissions
    // ليسا في الجلسة، فيُستعلَم عن الفاعل من قاعدة البيانات.
    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    const belongsAndActive = !!actor && actor.isActive !== false && actor.warehouseId === ctx.warehouseId;
    const canView = belongsAndActive && hasWarehousePermission(actor!, 'canViewCustomers');
    // اسم الـ prop على CustomersClient بقي isOwner لتقليل نطاق التعديل على
    // مكوّن كبير غير مُختبَر هنا — القيمة الفعلية الآن صلاحية canEditCustomerTerms
    // الحقيقية، وليست تحديداً "هل الفاعل OWNER؟".
    const isOwner = belongsAndActive && hasWarehousePermission(actor!, 'canEditCustomerTerms');

    if (!canView) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="العملاء" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    عرض العملاء يتطلب صلاحية "عرض العملاء" — راجع مالك المذخر.
                </div>
            </div>
        );
    }

    const [orders, customers, outstandingGroups] = await Promise.all([
        prisma.warehouseOrder.findMany({
            where: { warehouseId: ctx.warehouseId, status: { not: "DRAFT" } },
            select: {
                createdAt: true,
                branch: { select: { organizationId: true, organization: { select: { name: true } } } },
            },
        }),
        prisma.warehouseCustomer.findMany({
            where: { warehouseId: ctx.warehouseId },
            include: { organization: { select: { name: true } } },
        }),
        prisma.warehouseInvoice.groupBy({
            by: ["organizationId"],
            where: { warehouseId: ctx.warehouseId, status: { in: ["UNPAID", "PARTIAL"] } },
            _sum: { total: true, paidAmount: true },
        }),
    ]);

    type OrgAgg = { organizationId: string; name: string; orderCount: number; lastOrderDate: Date | null };
    const byOrg = new Map<string, OrgAgg>();
    for (const o of orders) {
        const orgId = o.branch.organizationId;
        const existing = byOrg.get(orgId);
        if (existing) {
            existing.orderCount += 1;
            if (existing.lastOrderDate === null || o.createdAt > existing.lastOrderDate) existing.lastOrderDate = o.createdAt;
        } else {
            byOrg.set(orgId, {
                organizationId: orgId,
                name: o.branch.organization?.name ?? orgId,
                orderCount: 1,
                lastOrderDate: o.createdAt,
            });
        }
    }

    // المرحلة 5 §Part 1: عميل شروطه مُتَّفَق عليها مسبقاً (POST قبل أي طلب) لا
    // يظهر في byOrg (المبني من WarehouseOrder فقط) — يُضاف هنا كي لا يختفي من
    // الجدول بمجرد إنشاء علاقته التجارية قبل أول طلب له.
    for (const c of customers) {
        if (!byOrg.has(c.organizationId)) {
            byOrg.set(c.organizationId, {
                organizationId: c.organizationId,
                name: c.organization?.name ?? c.organizationId,
                orderCount: 0,
                lastOrderDate: null,
            });
        }
    }

    const customerByOrg = new Map(customers.map((c) => [c.organizationId, c]));
    const outstandingByOrg = new Map(
        outstandingGroups.map((g) => [g.organizationId, (g._sum.total ?? 0) - (g._sum.paidAmount ?? 0)])
    );

    const rows = Array.from(byOrg.values())
        .map((org) => {
            const customer = customerByOrg.get(org.organizationId) ?? null;
            return {
                customerId: customer?.id ?? null,
                organizationId: org.organizationId,
                name: org.name,
                orderCount: org.orderCount,
                lastOrderDate: org.lastOrderDate ? org.lastOrderDate.toISOString() : null,
                creditLimit: customer?.creditLimit ?? 0,
                paymentTermDays: customer?.paymentTermDays ?? 0,
                priceTier: customer?.priceTier ?? null,
                isBlocked: customer?.isBlocked ?? false,
                notes: customer?.notes ?? null,
                outstanding: outstandingByOrg.get(org.organizationId) ?? 0,
            };
        })
        .sort((a, b) => (b.lastOrderDate ? new Date(b.lastOrderDate).getTime() : 0) - (a.lastOrderDate ? new Date(a.lastOrderDate).getTime() : 0));

    return <CustomersClient initialCustomers={rows} isOwner={isOwner} />;
}
