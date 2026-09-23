// المرحلة ب من ميزة تتبّع مخزون المذخر: صفحة «المخزون» — قراءة الخادم الأولية
// (نفس استعلام GET /api/warehouse-portal/stock ونفس دوال warehouse-stock.ts)
// ثم عميل تفاعلي للفلاتر وتوسيع الدفعات وعمليات الاستلام/التعديل/الإتلاف.
import { loadWarehouseStock } from '@/app/lib/warehouse-stock-data';
import { prisma } from "@/app/lib/prisma";
import { getWarehouseContext } from "@/app/lib/warehouse-context";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasWarehousePermission } from "@/app/lib/warehouse-permissions";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import StockClient from "./StockClient";

export const dynamic = "force-dynamic";

export default async function WarehouseStockPage() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect("/dashboard");

    // Phase 3 (الأدوار والصلاحيات): هذه الصفحة تقرأ عبر Prisma مباشرة (لا عبر
    // GET /api/warehouse-portal/stock)، فبوابة الـ API وحدها لا تكفي لمنع من
    // لا يملك canViewStock (مثل ACCOUNTANT) من الوصول لهذه البيانات بفتح
    // الرابط مباشرة — إخفاء التبويب في layout.tsx واجهة فقط.
    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    const canView =
        !!actor && actor.isActive !== false && actor.warehouseId === ctx.warehouseId && hasWarehousePermission(actor, 'canViewStock');
    if (!canView) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="المخزون" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    عرض المخزون يتطلب صلاحية "عرض المخزون" — راجع مالك المذخر.
                </div>
            </div>
        );
    }

    const result = await loadWarehouseStock(ctx.warehouseId, hasWarehousePermission(actor!, 'canViewFinance'));
    return <StockClient initialItems={JSON.parse(JSON.stringify(result.items))} />;
}
