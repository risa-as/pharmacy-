import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { validateSyncUser } from "@/app/lib/sync-auth";
import { prisma } from "@/app/lib/prisma";
import { getUserPermissions } from "@/app/lib/permissions";
import { checkFeatureAccess } from "@/app/lib/saas-guards";
export const dynamic = "force-dynamic";
/** A device license alone must never authorize an employee's stock operations. */
export async function POST(req: Request) {
  if (!req.headers.get("x-sync-token"))
    return NextResponse.json(
      { error: "سجّل الدخول عبر الإنترنت بحساب الموظف أولاً" },
      { status: 401 },
    );
  const identity = await validateSyncUser(req);
  if (identity instanceof NextResponse) return identity;
  const user = await prisma.user.findUnique({
    where: { id: identity.id },
    include: { branch: true },
  });
  if (
    !user?.isActive ||
    !user.branch ||
    !["ADMIN", "MANAGER", "PHARMACIST", "CASHIER"].includes(user.role) ||
    user.branchId !== identity.branchId ||
    user.branch.organizationId !== identity.organizationId ||
    user.role !== identity.role
  )
    return NextResponse.json(
      { error: "تغير الحساب أو الفرع؛ يرجى تسجيل الدخول مجدداً" },
      { status: 403 },
    );
  const secret = process.env.AUTH_SECRET;
  if (!secret)
    return NextResponse.json({ error: "تعذر إعداد الجلسة" }, { status: 503 });
  const token = await new SignJWT({
    userId: user.id,
    role: user.role,
    branchId: user.branchId,
    organizationId: user.branch.organizationId,
    desktopOperations: true,
    // Checked by getTenantContext's Bearer path (a missing value counts as 0).
    sessionVersion: user.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
  const warehouse = (
    await checkFeatureAccess(user.branch.organizationId, "warehouseManagement")
  ).allowed;
  return NextResponse.json(
    {
      token,
      userId: user.id,
      permissions: getUserPermissions(user),
      features: { warehouseManagement: warehouse, interBranchTransfers: (await checkFeatureAccess(user.branch.organizationId, "interBranchTransfers")).allowed },
      role: user.role,
      branchId: user.branchId,
      branchName: user.branch.name,
      branchCount: await prisma.branch.count({where:{organizationId:user.branch.organizationId}}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
