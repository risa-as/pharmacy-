export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import {
  TrendingUp,
  Award,
  Package,
  DollarSign,
  ArrowRight,
  ShoppingBag,
  Crown,
} from "lucide-react";
import Link from "next/link";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

export default async function TopSellersPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const period =
    typeof searchParams.period === "string"
      ? parseInt(searchParams.period)
      : 30;
  const branchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;

  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere, tenantWhere } = tenantCtx;

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - period);

  const saleWhere = branchId
    ? { sale: { createdAt: { gte: sinceDate }, branchId, ...tenantWhere } }
    : { sale: { createdAt: { gte: sinceDate }, ...tenantBranchWhere } };

  // 1. Group SaleItems by drugId, ordered by quantity
  const grouped = await prisma.saleItem.groupBy({
    by: ["drugId"],
    where: saleWhere,
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 30,
  });

  // 2. Get total quantities sold to calculate share %
  const totalQuantitySold = grouped.reduce(
    (s: any, g: any) => s + (g._sum.quantity || 0),
    0,
  );

  // 3. Populate drug names and revenue
  const items = await Promise.all(
    grouped.map(async (g: any, idx: any) => {
      const drug = await prisma.globalDrug.findUnique({
        where: { id: g.drugId },
        select: { tradeName: true, barcode: true },
      });

      const saleItems = await prisma.saleItem.findMany({
        where: {
          drugId: g.drugId,
          ...saleWhere,
        },
        select: { quantity: true, price: true },
      });

      const totalRevenue = saleItems.reduce(
        (acc: any, si: any) => acc + si.quantity * si.price,
        0,
      );

      const qty = g._sum.quantity || 0;
      const share = totalQuantitySold > 0 ? (qty / totalQuantitySold) * 100 : 0;

      return {
        rank: idx + 1,
        name: drug?.tradeName || "غير معروف",
        barcode: drug?.barcode || "",
        quantity: qty,
        revenue: totalRevenue,
        share,
      };
    }),
  );

  const totalRevenue = items.reduce((s: any, i: any) => s + i.revenue, 0);
  const periods = [
    { label: "7 أيام", value: 7 },
    { label: "30 يوم", value: 30 },
    { label: "90 يوم", value: 90 },
    { label: "سنة", value: 365 },
  ];

  const buildPeriodUrl = (p: number) => {
    const params = new URLSearchParams();
    params.set("period", String(p));
    if (branchId) params.set("branch", branchId);
    return `/dashboard/reports/top-sellers?${params.toString()}`;
  };

  const extraParams = `period=${period}`;
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  const statCards = [
    {
      label: "الأصناف المباعة",
      value: `${items.length}`,
      icon: Package,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "إجمالي العبوات المباعة",
      value: fmt(totalQuantitySold),
      icon: ShoppingBag,
      tone: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "إجمالي الإيرادات (د.ع)",
      value: fmt(totalRevenue),
      icon: DollarSign,
      tone: "text-success",
      bg: "bg-success/10",
    },
  ];

  const rankStyle = (rank: number) =>
    rank === 1
      ? "bg-warning/15 text-warning"
      : rank === 2
        ? "bg-muted-foreground/15 text-muted-foreground"
        : rank === 3
          ? "bg-info/15 text-info"
          : "bg-muted text-muted-foreground";

  return (
    <div className="space-y-6" dir="rtl">
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
              <Award className="w-6 h-6 text-success" />
              أكثر الأدوية مبيعاً
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              ترتيب الأصناف حسب الكمية المباعة والإيرادات
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {periods.map((p: any) => (
            <a
              key={p.value}
              href={buildPeriodUrl(p.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                period === p.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {p.label}
            </a>
          ))}
        </div>
      </div>

      {/* فلتر الفرع */}
      <BranchFilter
        currentBranch={branchId}
        baseUrl="/dashboard/reports/top-sellers"
        extraParams={extraParams}
      />

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

      {/* الجدول */}
      <div className="glass-card overflow-hidden">
        {items.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">
              لا توجد مبيعات في هذه الفترة
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              جرّب فترة زمنية أطول
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3.5 text-center font-medium font-cairo w-16">
                    #
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الدواء
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الكمية المباعة
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الإيرادات
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الحصة
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {items.map((item: any) => (
                  <tr
                    key={item.rank}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <span
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${rankStyle(item.rank)}`}
                        >
                          {item.rank === 1 ? (
                            <Crown className="w-4 h-4" />
                          ) : (
                            item.rank
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-success/10 rounded-lg flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-success" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">
                            {item.name}
                          </p>
                          {item.barcode && (
                            <p
                              className="text-xs text-muted-foreground"
                              dir="ltr"
                            >
                              {item.barcode}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className="font-bold text-primary whitespace-nowrap"
                        dir="ltr"
                      >
                        {fmt(item.quantity)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        عبوة
                      </span>
                    </td>
                    <td
                      className="px-6 py-4 font-bold text-success text-right whitespace-nowrap"
                      dir="ltr"
                    >
                      {fmt(item.revenue)} د.ع
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-2 max-w-[120px] overflow-hidden">
                          <div
                            className="bg-success h-2 rounded-full"
                            style={{ width: `${Math.min(item.share, 100)}%` }}
                          />
                        </div>
                        <span
                          className="text-xs font-bold text-muted-foreground tabular-nums"
                          dir="ltr"
                        >
                          {item.share.toFixed(1)}%
                        </span>
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
