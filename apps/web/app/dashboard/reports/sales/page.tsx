export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import {
  TrendingUp,
  Calendar,
  ArrowRight,
  DollarSign,
  Receipt,
  Calculator,
  Store,
} from "lucide-react";
import Link from "next/link";
import SalesChart from "@/app/ui/dashboard/sales-chart";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import DateRangeFilter from "@/app/ui/reports/date-range-filter";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import {
  ExportPDFButton,
  ExportExcelButton,
} from "@/app/ui/reports/export-buttons";

function parseDateParam(val: string | string[] | undefined) {
  return typeof val === "string" ? val : undefined;
}

function buildDateRange(from?: string, to?: string) {
  const IRAQ_OFFSET = 3 * 60 * 60 * 1000;
  const nowIraq = new Date(Date.now() + IRAQ_OFFSET);
  let start: Date, end: Date;
  if (from && to) {
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    start = new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0, 0) - IRAQ_OFFSET);
    end = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999) - IRAQ_OFFSET);
  } else {
    const todayUtcIraq = Date.UTC(
      nowIraq.getUTCFullYear(),
      nowIraq.getUTCMonth(),
      nowIraq.getUTCDate(),
    );
    end = new Date(todayUtcIraq + 24 * 60 * 60 * 1000 - 1 - IRAQ_OFFSET);
    start = new Date(todayUtcIraq - 6 * 24 * 60 * 60 * 1000 - IRAQ_OFFSET);
  }
  return { start, end };
}

function filterByTimeOfDay<T extends { createdAt: Date | string }>(
  items: T[],
  fromTime?: string,
  toTime?: string,
): T[] {
  if (!fromTime && !toTime) return items;
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const fromMin = fromTime ? toMinutes(fromTime) : 0;
  const toMin = toTime ? toMinutes(toTime) : 23 * 60 + 59;
  const crossesMidnight = fromMin > toMin;
  const IRAQ_OFFSET_MS = 3 * 60 * 60 * 1000;
  return items.filter((item) => {
    const d = new Date(item.createdAt);
    const iraqTime = new Date(d.getTime() + IRAQ_OFFSET_MS);
    const min = iraqTime.getUTCHours() * 60 + iraqTime.getUTCMinutes();
    // e.g. 21:00 → 09:00: match if min >= 1260 OR min <= 540
    return crossesMidnight
      ? min >= fromMin || min <= toMin
      : min >= fromMin && min <= toMin;
  });
}

function getDaysBetween(start: Date, end: Date) {
  const days: string[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (cur <= endDay) {
    days.push(cur.toLocaleDateString("en-GB", { timeZone: "Asia/Baghdad" }));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) return null;
  const { tenantBranchWhere } = tenantCtx;

  const branchId = parseDateParam(searchParams.branch);
  const fromParam = parseDateParam(searchParams.from);
  const toParam = parseDateParam(searchParams.to);
  const fromTimeParam = parseDateParam(searchParams.fromTime);
  const toTimeParam = parseDateParam(searchParams.toTime);

  const branchWhere = branchId
    ? { branchId, ...tenantBranchWhere }
    : { ...tenantBranchWhere };
  const { start, end } = buildDateRange(fromParam, toParam);

  const salesRaw = await prisma.sale.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      ...branchWhere,
    },
    include: {
      items: true,
      branch: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Filter by time-of-day if specified (post-process — DB stores full days)
  const sales = filterByTimeOfDay(salesRaw, fromTimeParam, toTimeParam);

  // Chart — group by day
  const days = getDaysBetween(start, end);
  const salesByDay = new Map<string, number>(days.map((d) => [d, 0]));
  sales.forEach((sale: any) => {
    const key = new Date(sale.createdAt).toLocaleDateString("en-GB", {
      timeZone: "Asia/Baghdad",
    });
    if (salesByDay.has(key))
      salesByDay.set(key, (salesByDay.get(key) || 0) + sale.total);
  });
  const chartData = Array.from(salesByDay.entries()).map(([day, amount]) => ({
    day,
    amount,
  }));

  // Stats
  const totalSales = sales.reduce((acc: number, s: any) => acc + s.total, 0);
  const averageSale = sales.length > 0 ? totalSales / sales.length : 0;
  const topBranches = new Map<string, number>();
  sales.forEach((sale: any) => {
    const name = sale.branch?.name || "غير محدد";
    topBranches.set(name, (topBranches.get(name) || 0) + sale.total);
  });

  const extraParams: Record<string, string | undefined> = branchId
    ? { branch: branchId }
    : {};

  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  const statCards = [
    {
      label: "عدد المبيعات",
      value: String(sales.length),
      icon: Receipt,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "إجمالي المبيعات (د.ع)",
      value: fmt(totalSales),
      icon: DollarSign,
      tone: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "متوسط الفاتورة (د.ع)",
      value: fmt(averageSale),
      icon: Calculator,
      tone: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "الفروع النشطة",
      value: String(topBranches.size),
      icon: Store,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
  ];

  return (
    <div className="space-y-6" dir="rtl" suppressHydrationWarning>
      {/* الرأس */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/reports"
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <ArrowRight className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-primary" />
              تقرير المبيعات
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              تحليل المبيعات حسب الفترة والفرع
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <ExportExcelButton
            filename="sales-report"
            headers={["الفرع", "عدد الأصناف", "المبلغ", "التاريخ"]}
            data={sales.map((s: any) => [
              s.branch?.name || "غير محدد",
              s.items.length,
              s.total.toFixed(2),
              new Date(s.createdAt).toLocaleString("ar-IQ", {
                timeZone: "Asia/Baghdad",
              }),
            ])}
          />
          <ExportPDFButton />
        </div>
      </div>

      {/* الفلاتر */}
      <div className="space-y-3">
        <DateRangeFilter
          baseUrl="/dashboard/reports/sales"
          currentFrom={fromParam}
          currentTo={toParam}
          currentFromTime={fromTimeParam}
          currentToTime={toTimeParam}
          extraParams={extraParams}
          showTimeFilter
          defaultPreset="last7"
        />
        <BranchFilter
          currentBranch={branchId}
          baseUrl="/dashboard/reports/sales"
        />
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="glass-card p-5 flex items-center gap-4"
            >
              <div
                className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}
              >
                <Icon className={`w-6 h-6 ${card.tone}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground truncate">
                  {card.label}
                </p>
                <p className={`text-2xl font-bold ${card.tone}`} dir="ltr">
                  {card.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* المخطط + المبيعات حسب الفرع */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SalesChart data={chartData} title="المبيعات اليومية" />

        <div className="glass-card p-6">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-success" />
            المبيعات حسب الفرع
          </h3>
          <div className="space-y-3">
            {Array.from(topBranches.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([branch, amount], index) => (
                <div
                  key={branch}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${index === 0 ? "bg-warning/20 text-warning" : index === 1 ? "bg-muted-foreground/20 text-muted-foreground" : "bg-primary/10 text-primary"}`}
                    >
                      {index + 1}
                    </span>
                    <span className="font-medium text-foreground truncate">
                      {branch}
                    </span>
                  </div>
                  <span className="font-bold text-success shrink-0" dir="ltr">
                    {fmt(amount)} د.ع
                  </span>
                </div>
              ))}
            {topBranches.size === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                لا توجد مبيعات
              </div>
            )}
          </div>
        </div>
      </div>

      {/* جدول المبيعات */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-bold text-foreground">آخر المبيعات</h3>
          {sales.length > 50 && (
            <span className="mr-auto text-xs text-muted-foreground">
              أحدث 50 من {sales.length}
            </span>
          )}
        </div>
        {sales.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">
              لا توجد مبيعات في هذه الفترة
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              جرّب فترة زمنية أخرى
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الفرع
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    عدد الأصناف
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المبلغ
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    التاريخ والساعة
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {sales
                  .slice()
                  .reverse()
                  .slice(0, 50)
                  .map((sale: any) => (
                    <tr
                      key={sale.id}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-6 py-4 text-muted-foreground">
                        {sale.branch?.name || "غير محدد"}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center text-sm text-muted-foreground bg-muted rounded-md px-2.5 py-1">
                          {sale.items.length} صنف
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 font-bold text-success text-right"
                        dir="ltr"
                      >
                        {fmt(sale.total)} د.ع
                      </td>
                      <td
                        className="px-6 py-4 text-muted-foreground text-sm  text-right"
                        dir="ltr"
                        suppressHydrationWarning
                      >
                        <div>
                          {new Date(sale.createdAt).toLocaleDateString(
                            "ar-IQ",
                            { timeZone: "Asia/Baghdad" },
                          )}
                        </div>
                        <div className="text-xs opacity-70">
                          {new Date(sale.createdAt).toLocaleTimeString(
                            "ar-IQ",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Baghdad",
                            },
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
