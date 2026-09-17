// المندوبون (مذاخر B2B): صفحة «المندوبون» — نفس نمط حراسة الصفحة في
// app/warehouse/reports/page.tsx وapp/warehouse/stock/page.tsx حرفياً: استعلام
// حي عن الفاعل من قاعدة البيانات (لا من الجلسة)، ثم hasWarehousePermission.
// كل البيانات الفعلية (قائمة المندوبين، بضاعة كل سيارة، مبيعاته، تحصيلاته)
// تُجلَب من العميل التفاعلي عبر مسارات GET /api/warehouse-portal/reps* — هذه
// الصفحة تقرر فقط من يرى ماذا ومن يملك أي إجراء.
import { prisma } from "@/app/lib/prisma";
import { getWarehouseContext } from "@/app/lib/warehouse-context";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasWarehousePermission } from "@/app/lib/warehouse-permissions";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import RepsClient from "./RepsClient";

export const dynamic = "force-dynamic";

export default async function WarehouseRepsPage() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect("/dashboard");

    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    const belongsAndActive = !!actor && actor.isActive !== false && actor.warehouseId === ctx.warehouseId;
    const canView = belongsAndActive && hasWarehousePermission(actor!, "canViewReps");

    if (!canView) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="المندوبون" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    عرض المندوبين يتطلب صلاحية "عرض المندوبين" — راجع مالك المذخر.
                </div>
            </div>
        );
    }

    const canManageReps = hasWarehousePermission(actor!, "canManageReps");
    const canSellField = hasWarehousePermission(actor!, "canSellField");

    return <RepsClient canManageReps={canManageReps} canSellField={canSellField} />;
}
