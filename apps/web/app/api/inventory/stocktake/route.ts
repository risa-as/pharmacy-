export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";

export async function GET(req: NextRequest) {
  try {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    if (!tenantCtx.userPermissions.canDoStocktake)
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId") || tenantCtx.user.branchId;

    if (!branchId) {
      return NextResponse.json(
        { error: "Branch ID required" },
        { status: 400 },
      );
    }

    const stocktakes = await prisma.stocktake.findMany({
      where: { AND: [tenantCtx.tenantBranchWhere, { branchId }] },
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ stocktakes });
  } catch (error: any) {
    console.error("GET Stocktakes error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    if (!tenantCtx.userPermissions.canDoStocktake)
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    if (!tenantCtx.userPermissions.canDoStocktake) {
      return NextResponse.json(
        { error: "ليس لديك صلاحية لإجراء عمليات الجرد." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const branchId = body.branchId || tenantCtx.user.branchId;

    if (!branchId) {
      return NextResponse.json(
        { error: "Branch ID required" },
        { status: 400 },
      );
    }

    if (
      !(await prisma.branch.findFirst({
        where: { AND: [tenantCtx.branchModelWhere, { id: branchId }] },
      }))
    )
      return NextResponse.json({ error: "الفرع خارج نطاقك" }, { status: 403 });
    const stocktake = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${branchId} FOR UPDATE`;
      const pending = await tx.stocktake.findFirst({
        where: { branchId, status: { in: ["PENDING", "REVIEW"] } },
      });
      if (pending) return pending;
      return tx.stocktake.create({
        data: {
          branchId,
          userId: tenantCtx.user.id,
          status: "PENDING",
          notes: typeof body.notes === "string" ? body.notes : null,
        },
      });
    });
    revalidatePath("/dashboard/inventory/stocktakes");
    revalidatePath(`/dashboard/inventory/stocktakes/${stocktake.id}`);
    return NextResponse.json({ success: true, stocktake });
  } catch (error: any) {
    console.error("POST Stocktake error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
