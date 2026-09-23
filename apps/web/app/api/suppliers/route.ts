export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { checkFeatureAccess } from "@/app/lib/saas-guards";

export async function GET(req: NextRequest) {
  try {
    let organizationId: string | undefined;
    if (req.headers.has("x-sync-token")) {
      const { validateSyncUser } = await import("@/app/lib/sync-auth");
      const { getUserPermissions } = await import("@/app/lib/permissions");
      const identity = await validateSyncUser(req);
      if (identity instanceof NextResponse) return identity;
      const current = await prisma.user.findUnique({
        where: { id: identity.id },
        select: {
          role: true,
          isActive: true,
          permissions: true,
          branch: { select: { organizationId: true } },
        },
      });
      if (!current?.isActive || !getUserPermissions(current).canViewSuppliers)
        return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
      organizationId = current.branch?.organizationId;
      if (!organizationId && current.role !== "SUPER_ADMIN")
        return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    } else {
      const tenantCtx = await getTenantContext();
      if (tenantCtx instanceof NextResponse) return tenantCtx;
      if (!tenantCtx.userPermissions.canViewSuppliers)
        return NextResponse.json(
          { error: "ليس لديك صلاحية عرض الموردين." },
          { status: 403 },
        );
      organizationId = tenantCtx.organizationId;
      if (!organizationId && tenantCtx.user.role !== "SUPER_ADMIN")
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fix #6: Feature Gate check AFTER resolving organizationId, but
    // BEFORE any data query — prevent access even for Desktop app callers.
    if (organizationId) {
      const access = await checkFeatureAccess(
        organizationId,
        "supplierManagement",
      );
      if (!access.allowed) {
        return NextResponse.json(
          {
            error: "هذه الميزة متاحة في الباقة الاحترافية فقط.",
            code: "FEATURE_NOT_IN_PLAN",
            requiredPlan: "PROFESSIONAL",
          },
          { status: 403 },
        );
      }
    }

    const suppliers = await prisma.supplier.findMany({
      where: organizationId ? { organizationId } : {},
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    });

    const response = NextResponse.json(suppliers);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("Suppliers API Error:", error);
    return NextResponse.json(
      { message: "Failed to fetch suppliers" },
      { status: 500 },
    );
  }
}
