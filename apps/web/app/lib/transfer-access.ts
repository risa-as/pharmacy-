import { NextResponse } from "next/server";
import { getTenantContext } from "./tenant-utils";
import { checkFeatureAccess } from "./saas-guards";
export async function transferAccess() {
  const ctx = await getTenantContext();
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.userPermissions.canTransferStock)
    return NextResponse.json(
      { error: "ليس لديك صلاحية التحويل" },
      { status: 403 },
    );
  if (
    ctx.organizationId &&
    !(await checkFeatureAccess(ctx.organizationId, "interBranchTransfers"))
      .allowed
  )
    return NextResponse.json(
      { error: "التحويل غير متاح في الباقة" },
      { status: 403 },
    );
  return ctx;
}
