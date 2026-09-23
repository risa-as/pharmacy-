export const dynamic = "force-dynamic";
import SmartOrderClient from "./smart-order-client";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { checkFeatureAccess } from "@/app/lib/saas-guards";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
export default async function SmartOrderPage() {
  const ctx = await getTenantContext();
  if (ctx instanceof NextResponse) redirect("/login");
  if (
    !ctx.userPermissions.canViewInventory ||
    (!ctx.userPermissions.canViewSales &&
      !ctx.userPermissions.canCreatePurchase && !ctx.userPermissions.canCreateWarehouseOrder)
  )
    return (
      <div className="rounded-lg border p-6">
        ليس لديك صلاحية تحليل المخزون والمبيعات.
      </div>
    );
  const branches = await prisma.branch.findMany({
    where: ctx.branchModelWhere,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const canWarehouse = ctx.organizationId
    ? (await checkFeatureAccess(ctx.organizationId, "warehouseManagement"))
        .allowed
    : false;
  return (
    <SmartOrderClient
      branchId={ctx.user.branchId ?? branches[0]?.id ?? ""}
      branches={branches}
      userId={ctx.user.id}
      organizationId={ctx.organizationId ?? ""}
      canCreate={ctx.userPermissions.canCreateWarehouseOrder}
      canWarehouse={canWarehouse}
      canExport={ctx.userPermissions.canExportExcel}
    />
  );
}
