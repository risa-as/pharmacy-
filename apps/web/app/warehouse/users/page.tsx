// Feature 1 من الميزات الثلاث الأخيرة لنظام المذاخر (B2B): صفحة إدارة حسابات
// المذخر — لمن يملك صلاحية canManageUsers فقط (Phase 3: الأدوار والصلاحيات
// — افتراضياً OWNER فقط، لكن يمكن منحها بتخصيص فردي). يستعلم هذا المكوّن
// الخادمي عن الفاعل من قاعدة البيانات (وليس من الجلسة — warehouseUserType/
// permissions ليسا فيها، انظر warehouse-context.ts) قبل حتى جلب قائمة
// المستخدمين، بحيث تتفق الصفحة مع مسار الـ API (الذي يرفض من لا يملك
// canManageUsers بـ 403) بدل عرض القائمة لمن لا يملك الصلاحية ثم رفض أفعاله فقط.
import { prisma } from "@/app/lib/prisma";
import { getWarehouseContext } from "@/app/lib/warehouse-context";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasWarehousePermission } from "@/app/lib/warehouse-permissions";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function WarehouseUsersPage() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect("/dashboard");

    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });

    // نفس القاعدة التي يطبّقها app/api/warehouse-portal/users/route.ts
    // (requireWarehousePermission): فعّال، warehouseId المُستعلَم يطابق
    // السياق كخط دفاع إضافي، ويملك صلاحية canManageUsers فعلياً — كي لا
    // تختلف الصفحة عن الـ API في تعريف "من يُدير".
    const canManage =
        !!actor &&
        actor.isActive !== false &&
        actor.warehouseId === ctx.warehouseId &&
        hasWarehousePermission(actor, 'canManageUsers');

    if (!canManage) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="المستخدمون" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    إدارة حسابات المذخر تتطلب صلاحية "إدارة المستخدمين" — راجع مالك المذخر.
                </div>
            </div>
        );
    }

    const users = await prisma.user.findMany({
        where: { warehouseId: ctx.warehouseId },
        select: {
            id: true,
            email: true,
            name: true,
            warehouseUserType: true,
            permissions: true,
            isActive: true,
            createdAt: true,
        },
        orderBy: { createdAt: "asc" },
    });

    return (
        <UsersClient
            initialUsers={users.map((u) => ({
                id: u.id,
                email: u.email,
                name: u.name,
                warehouseUserType: u.warehouseUserType,
                permissions: u.permissions,
                isActive: u.isActive,
            }))}
            currentUserId={ctx.user.id}
        />
    );
}
