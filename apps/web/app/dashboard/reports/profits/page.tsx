export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  ArrowRight,
  FileText,
  Package,
  Banknote,
  PieChart,
  CalendarDays,
} from "lucide-react";
import Link from "next/link";
import SalesChart from "@/app/ui/dashboard/sales-chart";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import DateRangeFilter from "@/app/ui/reports/date-range-filter";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { requireFeature } from "@/app/lib/page-guards";
import UpgradeRequired from "@/app/ui/plan-enforcement/UpgradeRequired";

function parseDateParam(val: string | string[] | undefined) {
  return typeof val === "string" ? val : undefined;
}

function buildDateRange(
  from?: string,
  to?: string,
  fromTime?: string,
  toTime?: string,
) {
  const IRAQ_OFFSET = 3 * 60 * 60 * 1000;
  const nowIraq = new Date(Date.now() + IRAQ_OFFSET);
  let start: Date, end: Date, label: string;
  if (from && to) {
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    // Parse as Baghdad dates → convert to UTC (full days for DB; time-of-day filtered in JS)
    start = new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0, 0) - IRAQ_OFFSET);
    end = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999) - IRAQ_OFFSET);
    label =
      fromTime || toTime
        ? `${from} — ${to} (${fromTime || "00:00"} → ${toTime || "23:59"})`
        : `${from} — ${to}`;
  } else {
    const todayUtcIraq = Date.UTC(
      nowIraq.getUTCFullYear(),
      nowIraq.getUTCMonth(),
      nowIraq.getUTCDate(),
    );
    end = new Date(todayUtcIraq + 24 * 60 * 60 * 1000 - 1 - IRAQ_OFFSET);
    start = new Date(todayUtcIraq - 6 * 24 * 60 * 60 * 1000 - IRAQ_OFFSET);
    label = "آخر 7 أيام";
  }
  return { start, end, label };
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

export default async function ProfitsReportPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) return null;
  const { tenantBranchWhere, organizationId } = tenantCtx;

  if (organizationId) {
    const upgrade = await requireFeature(organizationId, "advancedReports");
    if (upgrade) return <UpgradeRequired {...upgrade} />;
  }

  const branchId = parseDateParam(searchParams.branch);
  const fromParam = parseDateParam(searchParams.from);
  const toParam = parseDateParam(searchParams.to);
  const fromTimeParam = parseDateParam(searchParams.fromTime);
  const toTimeParam = parseDateParam(searchParams.toTime);
  const {
    start,
    end,
    label: periodLabel,
  } = buildDateRange(fromParam, toParam, fromTimeParam, toTimeParam);

  const branchWhere = branchId
    ? { branchId, ...tenantBranchWhere }
    : { ...tenantBranchWhere };

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  // ── Run ALL queries in parallel ──────────────────────────────────────────
  // COGS uses SaleItem.cost — the actual per-unit cost captured from the batch
  // prices (FEFO) at the moment of sale (see api/sales/route.ts). This is the
  // accurate historical cost, not the current inventory.cost.
  const [
    salesRaw,
    expenses,
    inventoryRaw,
    pendingTotal,
    monthlySales,
    monthlyExpenses,
  ] = await Promise.all([
    // Period sales — revenue + per-item recorded cost
    prisma.sale.findMany({
      where: { createdAt: { gte: start, lte: end }, ...branchWhere },
      select: {
        total: true,
        createdAt: true,
        items: { select: { quantity: true, cost: true } },
      },
    }),
    // Period expenses — only needed fields
    prisma.expense.findMany({
      where: { date: { gte: start, lte: end }, ...branchWhere },
      select: { amount: true, category: true },
    }),
    // Current inventory valuation (cost basis) — for the balance quick-look only
    prisma.inventory.findMany({
      where: branchWhere,
      select: {
        cost: true,
        batches: { select: { quantity: true } },
      },
    }),
    // Pending purchases total — aggregate instead of findMany
    prisma.purchase.aggregate({
      where: { status: "PENDING", ...branchWhere },
      _sum: { total: true },
    }),
    // Last 6 months sales for monthly breakdown (with recorded item cost)
    prisma.sale.findMany({
      where: { createdAt: { gte: sixMonthsAgo }, ...branchWhere },
      select: {
        total: true,
        createdAt: true,
        items: { select: { quantity: true, cost: true } },
      },
    }),
    // Last 6 months expenses
    prisma.expense.findMany({
      where: { date: { gte: sixMonthsAgo }, ...branchWhere },
      select: { amount: true, date: true },
    }),
  ]);

  // Filter period sales by time-of-day if specified
  const sales = filterByTimeOfDay(salesRaw, fromTimeParam, toTimeParam);

  // ── Current inventory value (cost basis) ───────────────────────────────────
  let totalInventoryValue = 0;
  for (const inv of inventoryRaw) {
    const qty = inv.batches.reduce((s: number, b: any) => s + b.quantity, 0);
    totalInventoryValue += inv.cost * qty;
  }

  const totalPendingPurchases = pendingTotal._sum.total ?? 0;

  // ── Calculate Financials (COGS from recorded SaleItem.cost) ───────────────
  let totalRevenue = 0;
  let totalCOGS = 0;
  for (const sale of sales) {
    totalRevenue += sale.total;
    for (const item of sale.items) {
      totalCOGS += item.cost * item.quantity;
    }
  }

  const totalExpenses = expenses.reduce((s: number, e: any) => s + e.amount, 0);
  const grossProfit = totalRevenue - totalCOGS;
  const netProfit = grossProfit - totalExpenses;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const expensesByCategory: Record<string, number> = {};
  for (const e of expenses) {
    expensesByCategory[e.category] =
      (expensesByCategory[e.category] || 0) + e.amount;
  }

  // ── Daily Profit Chart (gross profit = revenue − COGS per day) ────────────
  const days = getDaysBetween(start, end);
  const profitByDay = new Map<string, number>(days.map((d) => [d, 0]));
  for (const sale of sales) {
    const key = new Date(sale.createdAt).toLocaleDateString("en-GB", {
      timeZone: "Asia/Baghdad",
    });
    if (profitByDay.has(key)) {
      let saleCost = 0;
      for (const item of sale.items) {
        saleCost += item.cost * item.quantity;
      }
      profitByDay.set(
        key,
        (profitByDay.get(key) || 0) + (sale.total - saleCost),
      );
    }
  }
  const chartData = Array.from(profitByDay.entries()).map(([day, amount]) => ({
    day,
    amount,
  }));

  // ── Monthly Breakdown (real net profit = revenue − COGS − expenses) ──────
  const monthlyData: {
    month: string;
    revenue: number;
    cogs: number;
    expenses: number;
    netProfit: number;
  }[] = [];
  const monthOf = (date: Date | string) => {
    const dt = new Date(date);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  };
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString("ar-IQ", {
      month: "long",
      year: "numeric",
      timeZone: "Asia/Baghdad",
    });

    let rev = 0;
    let cogs = 0;
    for (const sale of monthlySales) {
      if (monthOf(sale.createdAt) !== monthKey) continue;
      rev += sale.total;
      for (const item of sale.items) {
        cogs += item.cost * item.quantity;
      }
    }

    const exp = monthlyExpenses
      .filter((e: any) => monthOf(e.date) === monthKey)
      .reduce((s: number, e: any) => s + e.amount, 0);

    monthlyData.push({
      month: monthLabel,
      revenue: rev,
      cogs,
      expenses: exp,
      netProfit: rev - cogs - exp,
    });
  }

  const extraParams: Record<string, string | undefined> = branchId
    ? { branch: branchId }
    : {};
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  const statCards = [
    {
      label: "إجمالي الإيرادات (د.ع)",
      value: fmt(totalRevenue),
      sub: null,
      icon: DollarSign,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "إجمالي الربح (د.ع)",
      value: fmt(grossProfit),
      sub: `هامش خام: ${grossMargin.toFixed(1)}%`,
      icon: TrendingUp,
      tone: grossProfit >= 0 ? "text-success" : "text-destructive",
      bg: grossProfit >= 0 ? "bg-success/10" : "bg-destructive/10",
    },
    {
      label: "إجمالي المصروفات (د.ع)",
      value: fmt(totalExpenses),
      sub: null,
      icon: Receipt,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "صافي الربح (د.ع)",
      value: fmt(netProfit),
      sub: `هامش صافي: ${netMargin.toFixed(1)}%`,
      icon: netProfit >= 0 ? TrendingUp : TrendingDown,
      tone: netProfit >= 0 ? "text-success" : "text-destructive",
      bg: netProfit >= 0 ? "bg-success/10" : "bg-destructive/10",
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* الرأس */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/reports"
          className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <ArrowRight className="w-5 h-5 text-muted-foreground" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-success" />
            تقرير الأرباح والخسائر
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            قائمة الدخل التفصيلية — {periodLabel}
          </p>
        </div>
      </div>

      {/* الفلاتر */}
      <div className="space-y-3">
        <DateRangeFilter
          baseUrl="/dashboard/reports/profits"
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
          baseUrl="/dashboard/reports/profits"
        />
      </div>

      {/* بطاقات الملخص */}
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
                <p
                  className={`text-xl font-bold ${card.tone} whitespace-nowrap`}
                  dir="ltr"
                >
                  {card.value}
                </p>
                {card.sub && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {card.sub}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* قائمة الدخل */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-foreground">قائمة الدخل</h2>
          <span className="mr-auto text-xs text-muted-foreground">
            {periodLabel}
          </span>
        </div>
        <div className="p-6 space-y-3">
          <div className="flex justify-between py-2">
            <span className="font-bold text-foreground">إيرادات المبيعات</span>
            <span
              className="font-bold text-primary whitespace-nowrap"
              dir="ltr"
            >
              {fmt(totalRevenue)} د.ع
            </span>
          </div>
          <div className="flex justify-between py-2 text-destructive">
            <span>(−) تكلفة البضاعة المباعة (COGS)</span>
            <span className="whitespace-nowrap" dir="ltr">
              {fmt(totalCOGS)} د.ع
            </span>
          </div>
          <div className="flex justify-between py-2 border-t border-dashed border-border font-bold text-lg">
            <span className="text-foreground">= إجمالي الربح</span>
            <span
              className={`whitespace-nowrap ${grossProfit >= 0 ? "text-success" : "text-destructive"}`}
              dir="ltr"
            >
              {fmt(grossProfit)} د.ع
            </span>
          </div>
          {Object.keys(expensesByCategory).length > 0 && (
            <div className="border-t border-border pt-2 space-y-1">
              {Object.entries(expensesByCategory).map(([cat, amount]: any) => (
                <div
                  key={cat}
                  className="flex justify-between py-1 text-sm text-muted-foreground"
                >
                  <span>(−) {cat}</span>
                  <span className="whitespace-nowrap" dir="ltr">
                    {fmt(amount)} د.ع
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between items-center py-3 border-t-2 border-border">
            <span className="font-bold text-xl text-foreground">
              = صافي الربح
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-bold text-lg whitespace-nowrap ${netProfit >= 0 ? "bg-success/10 text-success border-success/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}
              dir="ltr"
            >
              {netProfit >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              {fmt(netProfit)} د.ع
            </span>
          </div>
        </div>
      </div>

      {/* نظرة سريعة على الميزانية */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-info/10 flex items-center justify-center shrink-0">
            <Package className="w-6 h-6 text-info" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              قيمة المخزون الحالي (بالتكلفة)
            </p>
            <p
              className="text-xl font-bold text-info whitespace-nowrap"
              dir="ltr"
            >
              {fmt(totalInventoryValue)} د.ع
            </p>
          </div>
        </div>
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
            <Banknote className="w-6 h-6 text-warning" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">مشتريات معلقة الدفع</p>
            <p
              className="text-xl font-bold text-warning whitespace-nowrap"
              dir="ltr"
            >
              {fmt(totalPendingPurchases)} د.ع
            </p>
          </div>
        </div>
      </div>

      {/* مخطط الربح اليومي */}
      <SalesChart data={chartData} title="الربح اليومي" colorVar="success" />

      {/* التوزيع الشهري */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-bold text-foreground">التوزيع الشهري</h2>
          <span className="mr-auto text-xs text-muted-foreground">
            آخر 6 أشهر
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3.5 text-right font-medium font-cairo">
                  الشهر
                </th>
                <th className="px-6 py-3.5 text-right font-medium font-cairo">
                  الإيرادات
                </th>
                <th className="px-6 py-3.5 text-right font-medium font-cairo">
                  تكلفة البضاعة
                </th>
                <th className="px-6 py-3.5 text-right font-medium font-cairo">
                  المصروفات
                </th>
                <th className="px-6 py-3.5 text-right font-medium font-cairo">
                  صافي الربح
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {monthlyData.map((m) => (
                <tr
                  key={m.month}
                  className="hover:bg-muted/40 transition-colors"
                >
                  <td className="px-6 py-4 font-semibold text-foreground whitespace-nowrap">
                    {m.month}
                  </td>
                  <td
                    className="px-6 py-4 text-primary whitespace-nowrap"
                    dir="rtl"
                  >
                    {fmt(m.revenue)} د.ع
                  </td>
                  <td
                    className="px-6 py-4 text-destructive whitespace-nowrap"
                    dir="rtl"
                  >
                    {fmt(m.cogs)} د.ع
                  </td>
                  <td
                    className="px-6 py-4 text-warning whitespace-nowrap"
                    dir="rtl"
                  >
                    {fmt(m.expenses)} د.ع
                  </td>
                  <td
                    className={`px-6 py-4 font-bold whitespace-nowrap ${m.netProfit >= 0 ? "text-success" : "text-destructive"}`}
                    dir="rtl"
                  >
                    {fmt(m.netProfit)} د.ع
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* توزيع المصروفات */}
      {Object.keys(expensesByCategory).length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <PieChart className="w-4 h-4 text-warning" />
            <h2 className="font-bold text-foreground">توزيع المصروفات</h2>
            <span className="mr-auto text-xs text-muted-foreground">
              {periodLabel}
            </span>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(expensesByCategory)
              .sort((a, b) => (b[1] as number) - (a[1] as number))
              .map(([cat, amount]: any) => {
                const percent =
                  totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
                return (
                  <div
                    key={cat}
                    className="bg-muted/50 border border-border p-4 rounded-xl"
                  >
                    <div className="text-sm text-muted-foreground mb-1 truncate">
                      {cat}
                    </div>
                    <div
                      className="text-lg font-bold text-foreground whitespace-nowrap"
                      dir="ltr"
                    >
                      {fmt(amount)} د.ع
                    </div>
                    <div className="mt-2 bg-background rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-warning h-2 rounded-full"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div
                      className="text-xs text-muted-foreground mt-1"
                      dir="ltr"
                    >
                      {percent.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
