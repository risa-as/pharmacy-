// Feature 2 من الميزات الثلاث الأخيرة لنظام المذاخر (B2B): تغيير كلمة المرور
// الذاتي. المرحلة 5 (الصقل التجاري) §Part 5: أُضيف نصفٌ خادمي لهذه الصفحة —
// قراءة الملف التجاري الحالي (Warehouse) لتعبئة نموذج التعديل، حراسة
// canChangeSettings لإظهاره، ونسبة التلبية كمؤشر أداء للقراءة فقط (نفس
// fulfilmentRate المستخدَم في GET /api/warehouse-portal/reports/fulfilment)
// كي يرى المذخر ما تحكم عليه الصيدليات به دون فتح تبويب التقارير المنفصل.
import { prisma } from "@/app/lib/prisma";
import { getWarehouseContext } from "@/app/lib/warehouse-context";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasWarehousePermission } from "@/app/lib/warehouse-permissions";
import { getFulfilmentItems, resolveReportDateRange } from "@/app/lib/warehouse-report-data";
import { fulfilmentRate } from "@/app/lib/warehouse-reports";
import OperatingMode from './OperatingMode';
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function WarehouseSettingsPage() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect("/dashboard");

    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    const belongsAndActive = !!actor && actor.isActive !== false && actor.warehouseId === ctx.warehouseId;
    const canEditProfile = belongsAndActive && hasWarehousePermission(actor!, "canChangeSettings");

    const [warehouse, range] = await Promise.all([
        prisma.warehouse.findUnique({
            where: { id: ctx.warehouseId },
            select: { operatingMode: true, name: true, phone: true, salesPhone: true, followupPhone: true, managementPhone: true, address: true, city: true, contactPerson: true, email: true, notes: true },
        }),
        Promise.resolve(resolveReportDateRange(null, null)),
    ]);
    const fulfilmentItems = await getFulfilmentItems(ctx.warehouseId, range);
    const fulfilment = fulfilmentRate(fulfilmentItems);

    return (
        <div className="space-y-5"><OperatingMode initialMode={warehouse?.operatingMode === "ORDER_PORTAL" ? "ORDER_PORTAL" : "FULL"} canChange={canEditProfile && actor?.warehouseUserType === "OWNER"}/><SettingsClient
            canEditProfile={canEditProfile}
            initialProfile={{
                name: warehouse?.name ?? "",
                phone: warehouse?.phone ?? "",
                salesPhone: warehouse?.salesPhone ?? "",
                followupPhone: warehouse?.followupPhone ?? "",
                managementPhone: warehouse?.managementPhone ?? "",
                address: warehouse?.address ?? "",
                city: warehouse?.city ?? "",
                contactPerson: warehouse?.contactPerson ?? "",
                email: warehouse?.email ?? "",
                notes: warehouse?.notes ?? "",
            }}
            fulfilment={fulfilment}
        /></div>
    );
}
