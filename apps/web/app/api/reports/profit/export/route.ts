export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { guardFeature } from "@/app/lib/api-guards";
import { buildDateRange, filterByTimeOfDay } from "@/app/lib/report-period";
import { buildProfitWorkbook } from "@/app/lib/profit-workbook";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    const { tenantBranchWhere, organizationId } = tenantCtx;

    // Same gate as the report page (Pro+).
    if (organizationId) {
      const denied = await guardFeature("advancedReports", "PROFESSIONAL");
      if (denied) return denied;
    }

    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branch") || undefined;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const fromTime = searchParams.get("fromTime") || undefined;
    const toTime = searchParams.get("toTime") || undefined;

    const { start, end, label } = buildDateRange(from, to, fromTime, toTime);
    const branchWhere = branchId
      ? { branchId, ...tenantBranchWhere }
      : { ...tenantBranchWhere };

    // ── Queries (mirror the report page) ─────────────────────────────────────
    const [salesRaw, returnsRaw, expenses] = await Promise.all([
      prisma.sale.findMany({
        where: { createdAt: { gte: start, lte: end }, ...branchWhere },
        select: {
          id: true,
          invoiceNumber: true,
          createdAt: true,
          total: true,
          discount: true,
          branchId: true,
          items: {
            select: {
              quantity: true,
              price: true,
              cost: true,
              drug: { select: { tradeName: true, scientificName: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.saleReturn.findMany({
        where: { createdAt: { gte: start, lte: end }, ...branchWhere },
        select: {
          id: true,
          returnNumber: true,
          createdAt: true,
          total: true,
          branchId: true,
          items: {
            select: {
              quantity: true,
              price: true,
              drugId: true,
              drug: { select: { tradeName: true } },
            },
          },
          sale: {
            select: {
              invoiceNumber: true,
              items: { select: { drugId: true, cost: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.expense.findMany({
        where: { date: { gte: start, lte: end }, ...branchWhere },
        select: {
          amount: true,
          category: true,
          description: true,
          date: true,
          branchId: true,
        },
        orderBy: { date: "asc" },
      }),
    ]);

    // Apply the same time-of-day filter the page uses.
    const sales = filterByTimeOfDay(salesRaw, fromTime, toTime);
    const returns = filterByTimeOfDay(returnsRaw, fromTime, toTime);

    // Branch name lookup for the referenced branches.
    const branchIds = Array.from(
      new Set([
        ...sales.map((s) => s.branchId),
        ...returns.map((r) => r.branchId),
        ...expenses.map((e) => e.branchId),
      ]),
    );
    const branches = branchIds.length
      ? await prisma.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, name: true },
        })
      : [];
    const branchName = new Map(branches.map((b) => [b.id, b.name]));

    const buffer = buildProfitWorkbook({
      orgName: "",
      branchName,
      periodLabel: label,
      sales,
      returns,
      expenses,
    });

    const safeLabel = (from && to ? `${from}_${to}` : label).replace(/[^\w\-.]+/g, "-");
    const filenameAscii = `profit-report-${safeLabel}.xlsx`;
    const filenameUtf8 = encodeURIComponent(`تقرير-الأرباح-${from && to ? `${from}_${to}` : "الفترة"}.xlsx`);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameAscii}"; filename*=UTF-8''${filenameUtf8}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("Profit export error:", error);
    return NextResponse.json(
      { error: error?.message || "Export failed" },
      { status: 500 },
    );
  }
}
