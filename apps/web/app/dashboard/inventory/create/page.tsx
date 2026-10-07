export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import CreateInventoryForm from "@/app/ui/inventory/create-form";
import { Package } from "lucide-react";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export default async function CreateInventoryPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect("/login");
    if (!tenantCtx.userPermissions.canAddDrug) redirect("/dashboard/inventory");
    const { branchModelWhere, organizationId } = tenantCtx;

    // الأدوية لا تُحمَّل هنا: المنتقي يبحث في الخادم أثناء الكتابة
    // (/api/inventory/drug-options) بدل إرسال الكتالوج كاملاً إلى المتصفح.
    const [branches, org] = await Promise.all([
        prisma.branch.findMany({ where: branchModelWhere, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        organizationId
            ? prisma.organization.findUnique({ where: { id: organizationId }, select: { minProfitMargin: true } })
            : null,
    ]);

    return (
        <main className="mx-auto max-w-2xl">
            <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <Package className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">إضافة للمخزون</h1>
                    <p className="text-sm text-muted-foreground">أضف دواءً من كتالوج المنصة إلى مخزون الفرع مع سعره وحدوده</p>
                </div>
            </div>

            <CreateInventoryForm branches={branches} minMargin={org?.minProfitMargin ?? 5} />
        </main>
    );
}
