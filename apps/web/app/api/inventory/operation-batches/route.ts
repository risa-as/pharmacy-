import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";
export async function GET(req: Request) {
  const ctx = await getTenantContext();
  if (ctx instanceof NextResponse) return ctx;
  if (
    !ctx.userPermissions.canDoStocktake &&
    !ctx.userPermissions.canTransferStock
  )
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  const p = new URL(req.url).searchParams;
  const branchId = p.get("branchId") || ctx.user.branchId;
  const search = p.get("search")?.trim() || "";
  const exactBarcode = p.get("match") === "barcode";
  if (
    !branchId ||
    !(await prisma.branch.findFirst({
      where: { AND: [ctx.branchModelWhere, { id: branchId }] },
    }))
  )
    return NextResponse.json({ error: "الفرع خارج نطاقك" }, { status: 403 });
  const page = Math.max(
    1,
    Math.min(100000, Math.floor(Number(p.get("page"))) || 1),
  );
  const where = {
    inventory: {
      branchId,
      ...(search
        ? {
            drug: exactBarcode
              ? { barcode: search }
              : {
                  OR: [
                    {
                      tradeName: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                    { barcode: { contains: search } },
                  ],
                },
          }
        : {}),
    },
  };
  const [items, total] = await Promise.all([
    prisma.batch.findMany({
      where,
      include: {
        inventory: {
          include: { drug: { select: { tradeName: true, barcode: true } } },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 40,
      skip: (page - 1) * 40,
    }),
    prisma.batch.count({ where }),
  ]);
  return NextResponse.json({ items, total, page, hasMore: page * 40 < total });
}
