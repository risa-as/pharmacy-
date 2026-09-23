export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { getPlanningData } from "@/app/lib/smart-purchasing-data";
import { planRow, validatePlanningOptions } from "@/app/lib/smart-purchasing";
export async function GET(req: Request) {
  const ctx = await getTenantContext();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const p = new URL(req.url).searchParams;
    const options = {
      coverageDays: Number(p.get("coverageDays") ?? 15),
      leadDays: Number(p.get("leadDays") ?? 0),
      safetyDays: Number(p.get("safetyDays") ?? 0),
      fromArrival: p.get("fromArrival") === "true",
    };
    validatePlanningOptions(options);
    const data = await getPlanningData(
      ctx,
      p.get("branchId") || undefined,
      p.get("from") || undefined,
      p.get("to") || undefined,
    );
    const rows = data.rows.map((row) => planRow(row, options, data.today));
    if (p.get("format") === "planning")
      return NextResponse.json({ ...data, rows });
    return NextResponse.json(
      rows
        .filter((r) => r.action)
        .map((r) => ({
          ...r,
          id: r.inventoryId,
          drug: {
            tradeName: r.drugName,
            scientificName: r.scientificName,
            barcode: r.barcode,
          },
          branch: { name: r.branchName },
          currentQuantity: r.currentStock,
          suggestedReorderQuantity: r.suggestedQty,
          ...(r.coverage !== null
            ? { daysUntilStockout: Math.floor(r.coverage) }
            : {}),
        })),
    );
  } catch (error) {
    console.error("Smart purchasing", error);
    return NextResponse.json(
      { error: "تعذر حساب الاحتياج؛ تحقق من الفرع والفترة وأيام التغطية" },
      { status: 400 },
    );
  }
}
