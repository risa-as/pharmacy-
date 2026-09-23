import { NextResponse } from "next/server";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { checkFeatureAccess } from "@/app/lib/saas-guards";
export const dynamic = "force-dynamic";
export async function GET() {
  const ctx = await getTenantContext();
  if (ctx instanceof NextResponse) return ctx;
  const features: Record<string, boolean> = {};
  for (const name of [
    "warehouseManagement",
    "interBranchTransfers",
    "supplierManagement",
  ] as const)
    features[name] = ctx.organizationId
      ? (await checkFeatureAccess(ctx.organizationId, name)).allowed
      : ctx.user.role === "SUPER_ADMIN";
  return NextResponse.json(
    {
      permissions: ctx.userPermissions,
      features,
      branchId: ctx.user.branchId,
      role: ctx.user.role,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
