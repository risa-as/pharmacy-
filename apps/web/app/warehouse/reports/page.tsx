// المرحلة 4 من نظام المذاخر B2B (التقارير والأداء): صفحة «التقارير» —
// نفس نمط حراسة الصفحة في app/warehouse/stock/page.tsx وapp/warehouse/accounts/page.tsx
// حرفياً: استعلام حي عن الفاعل من قاعدة البيانات (لا من الجلسة)، ثم
// hasWarehousePermission. كل الاستعلامات الفعلية للبيانات تتم عبر مسارات
// GET /api/warehouse-portal/reports/* من العميل التفاعلي — هذه الصفحة تقرر
// فقط من يرى ماذا.
import { prisma } from "@/app/lib/prisma";
import { getWarehouseContext } from "@/app/lib/warehouse-context";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasWarehousePermission } from "@/app/lib/warehouse-permissions";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import ReportsClient from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function WarehouseReportsPage() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect("/dashboard");

    // Phase 3 (الأدوار والصلاحيات): هذه الصفحة تُقرِّر عرض أقسام كاملة
    // (الهوامش، العملاء) بناءً على صلاحيات دقيقة — إخفاء التبويب في
    // layout.tsx واجهة فقط، فلا بد من نفس الاستعلام الحي هنا كخط الدفاع
    // الحقيقي، تماماً كما في stock/page.tsx وaccounts/page.tsx.
    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    const belongsAndActive = !!actor && actor.isActive !== false && actor.warehouseId === ctx.warehouseId;
    const canView = belongsAndActive && hasWarehousePermission(actor!, "canViewReports");

    if (!canView) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="التقارير" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    عرض التقارير يتطلب صلاحية "عرض التقارير" — راجع مالك المذخر.
                </div>
            </div>
        );
    }

    // مُمرَّرة كخاصيتين مُحسومتين من الخادم (لا كتحقّق داخل العميل) — القسمان
    // يُخفيان بالكامل عند غيابهما، وليسا مجرد مموَّهين بصرياً (CSS)، تماماً
    // كإخفاء زر تسجيل الدفعة بحسب canRecordPayment في app/warehouse/accounts/page.tsx.
    const canViewFinance = belongsAndActive && hasWarehousePermission(actor!, "canViewFinance");
    const canViewCustomers = belongsAndActive && hasWarehousePermission(actor!, "canViewCustomers");
    // مشتريات المذخر وذممه الدائنة: قسم "الذمم الدائنة" يتطلب canViewFinance
    // **و** canViewPurchases معاً — نفس شرط AND المطبَّق في بوابة
    // GET /api/warehouse-portal/reports/payables، محسوباً هنا كخاصية واحدة
    // جاهزة (لا تكرار للشرط داخل ReportsClient).
    const canViewPayables = canViewFinance && hasWarehousePermission(actor!, "canViewPurchases");
    // المندوبون: قسم "المندوبون" يتطلب canViewReports **و** canViewReps معاً —
    // نفس شرط AND المطبَّق فعلياً في بوابة GET /api/warehouse-portal/reports/reps.
    const canViewReps = belongsAndActive && hasWarehousePermission(actor!, "canViewReps");

    return (
        <ReportsClient
            canViewFinance={canViewFinance}
            canViewCustomers={canViewCustomers}
            canViewPayables={canViewPayables}
            canViewReps={canViewReps}
        />
    );
}
