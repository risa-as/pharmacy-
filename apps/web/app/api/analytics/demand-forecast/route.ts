export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { getPlanningData } from "@/app/lib/smart-purchasing-data";
import {
  baghdadDate,
  dateStart,
  DAY,
  planRow,
  validatePlanningOptions,
} from "@/app/lib/smart-purchasing";
export async function GET(req: Request) {
  const ctx = await getTenantContext();
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.userPermissions.canViewReports)
    return NextResponse.json(
      { error: "ليس لديك صلاحية عرض التقارير" },
      { status: 403 },
    );
  try {
    const p = new URL(req.url).searchParams,
      days = Number(p.get("days") ?? 30);
    const options = {
      coverageDays: days,
      leadDays: 0,
      safetyDays: 0,
      fromArrival: false,
    };
    validatePlanningOptions(options);
    const end = dateStart(baghdadDate());
    const data = await getPlanningData(
      ctx,
      p.get("branchId") || ctx.user.branchId,
      baghdadDate(new Date(end.getTime() - 90 * DAY)),
      baghdadDate(new Date(end.getTime() - DAY)),
    );
    const forecasts = data.rows
      .map((row) => {
        const r = planRow(row, options, data.today);
        return {
          drugId: r.drugId,
          branchId: r.branchId,
          drugName: r.drugName,
          barcode: r.barcode,
          totalSold90Days: r.netSales,
          dailyAverage: Number(r.averageDailySales.toFixed(2)),
          predictedDemand: Math.ceil(r.averageDailySales * days),
          currentStock: r.currentStock,
          daysUntilStockout:
            r.coverage === null ? null : Math.floor(r.coverage),
          suggestedOrder: r.suggestedQty,
          confidence: null,
          quality: r.noDemand
            ? "حركة غير كافية"
            : r.qualityReasons.length
              ? "تحتاج مراجعة"
              : "متوسط تاريخي",
          urgency: r.out ? "critical" : r.insufficient ? "warning" : "normal",
        };
      })
      .sort((a, b) => {
        const rank: Record<string, number> = {
          critical: 0,
          warning: 1,
          normal: 2,
        };
        return rank[a.urgency] - rank[b.urgency];
      });
    return NextResponse.json({
      forecasts,
      metadata: {
        branchId: p.get("branchId") || ctx.user.branchId,
        forecastDays: days,
        dataWindow: 90,
        algorithm: "inventory_coverage_v1",
        generatedAt: data.generatedAt,
      },
      notice: data.notice,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "تعذر حساب التوقع؛ تحقق من نطاق الفرع والمدة" },
      { status: 400 },
    );
  }
}
