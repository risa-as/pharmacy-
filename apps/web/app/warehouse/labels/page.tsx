// المرحلة 4 من ميزة المذاخر: صفحة طباعة الباركود/ملصقات الأسعار — قراءة الخادم
// (كتالوج هذا المذخر) + عميل تفاعلي للاختيار والطباعة. نفس نمط حراسة
// app/warehouse/catalog/page.tsx حرفياً (هذه الصفحة تقرأ عبر Prisma مباشرة لا
// عبر مسار API، فحراسة الصفحة نفسها هي خط الدفاع الحقيقي — إخفاء التبويب في
// layout.tsx واجهة فقط).
import { prisma } from "@/app/lib/prisma";
import { getWarehouseContext } from "@/app/lib/warehouse-context";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasWarehousePermission } from "@/app/lib/warehouse-permissions";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import LabelsClient from "./LabelsClient";

export const dynamic = "force-dynamic";

export default async function WarehouseLabelsPage() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect("/dashboard");

    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    // من يرى الكتالوج يطبع ملصقاته — لا صلاحية منفصلة لهذه الصفحة (انظر
    // مواصفة هذه المرحلة: "Gate the page on canViewCatalog").
    const canView =
        !!actor &&
        actor.isActive !== false &&
        actor.warehouseId === ctx.warehouseId &&
        hasWarehousePermission(actor, "canViewCatalog");
    if (!canView) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="طباعة الملصقات" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    طباعة الملصقات تتطلب صلاحية "عرض الكتالوج" — راجع مالك المذخر.
                </div>
            </div>
        );
    }

    const items = await prisma.warehouseCatalogItem.findMany({
        where: { warehouseId: ctx.warehouseId },
        select: {
            id: true,
            barcode: true,
            price: true,
            drug: { select: { tradeName: true, scientificName: true } },
        },
        orderBy: { drug: { tradeName: "asc" } },
        take: 1000,
    });

    return (
        <LabelsClient
            initialItems={items.map((i) => ({
                id: i.id,
                barcode: i.barcode,
                tradeName: i.drug.tradeName,
                scientificName: i.drug.scientificName,
                price: i.price,
            }))}
        />
    );
}
