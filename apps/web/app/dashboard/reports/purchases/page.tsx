export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import { FileSpreadsheet, Receipt, Calculator, Building2 } from "lucide-react";
import SalesChart from "@/app/ui/dashboard/sales-chart";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

export default async function PurchasesReportPage({
  searchParams,
}: {
  searchParams?: { branch?: string };
}) {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere } = tenantCtx;

  const selectedBranchId = searchParams?.branch;
  const branchWhere = selectedBranchId
    ? { ...tenantBranchWhere, branchId: selectedBranchId }
    : tenantBranchWhere;

  // Last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const purchases = await prisma.purchase.findMany({
    where: {
      ...branchWhere,
      createdAt: { gte: thirtyDaysAgo },
      status: "COMPLETED",
    },
    include: { supplier: true },
    orderBy: { createdAt: "asc" },
  });

  const totalPurchases = purchases.reduce(
    (sum: number, p: any) => sum + p.total,
    0,
  );
  const avgInvoice =
    purchases.length > 0 ? totalPurchases / purchases.length : 0;
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  // Chart Data — daily spending over the last 30 days
  const spendingByDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    spendingByDay.set(
      d.toLocaleDateString("en-GB", { timeZone: "Asia/Baghdad" }),
      0,
    );
  }
  purchases.forEach((p: any) => {
    const key = new Date(p.createdAt).toLocaleDateString("en-GB", {
      timeZone: "Asia/Baghdad",
    });
    spendingByDay.set(key, (spendingByDay.get(key) || 0) + p.total);
  });
  const chartData = Array.from(spendingByDay.entries()).map(
    ([day, amount]: any) => ({
      day: day.slice(0, 5),
      amount,
    }),
  );

  // Top suppliers breakdown
  const bySupplier = new Map<
    string,
    { name: string; total: number; count: number }
  >();
  purchases.forEach((p: any) => {
    const key = p.supplierId || "none";
    const name = p.supplier?.name || "بدون مورد";
    const entry = bySupplier.get(key) || { name, total: 0, count: 0 };
    entry.total += p.total;
    entry.count += 1;
    bySupplier.set(key, entry);
  });
  const topSuppliers = Array.from(bySupplier.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const statCards = [
    {
      label: "إجمالي المشتريات (د.ع)",
      value: fmt(totalPurchases),
      icon: FileSpreadsheet,
      tone: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "عدد الفواتير",
      value: String(purchases.length),
      icon: Receipt,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "متوسط الفاتورة (د.ع)",
      value: fmt(avgInvoice),
      icon: Calculator,
      tone: "text-success",
      bg: "bg-success/10",
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* الرأس */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-info" />
            تقرير المشتريات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            المشتريات المكتملة خلال آخر 30 يوماً
          </p>
        </div>
        <BranchFilter
          currentBranch={selectedBranchId}
          baseUrl="/dashboard/reports/purchases"
        />
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      {/* المخطط */}
      <SalesChart data={chartData} title="اتجاه المشتريات اليومي" />

      {/* أعلى الموردين */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-bold text-foreground">أعلى الموردين إنفاقاً</h2>
          <span className="mr-auto text-xs text-muted-foreground">
            آخر 30 يوم
          </span>
        </div>

        {topSuppliers.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p className="text-sm">لا توجد مشتريات مسجلة في هذه الفترة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المورد
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    عدد الفواتير
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    إجمالي الإنفاق
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    النسبة
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {topSuppliers.map((s, idx) => {
                  const pct =
                    totalPurchases > 0 ? (s.total / totalPurchases) * 100 : 0;
                  return (
                    <tr
                      key={idx}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-info/10 rounded-lg flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4 text-info" />
                          </div>
                          <span className="font-semibold text-foreground">
                            {s.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-right text-sm text-muted-foreground bg-muted rounded-md px-2.5 py-1">
                          {s.count} فاتورة
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 font-bold text-foreground text-right"
                        dir="ltr"
                      >
                        {fmt(s.total)} د.ع
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 max-w-[120px] h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-info rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span
                            className="text-xs text-muted-foreground tabular-nums"
                            dir="ltr"
                          >
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
