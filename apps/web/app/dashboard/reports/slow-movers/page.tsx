export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import {
  AlertOctagon,
  DollarSign,
  Package,
  TrendingDown,
  ArrowRight,
  Info,
  Snowflake,
} from "lucide-react";
import Link from "next/link";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

export default async function SlowMoversPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const period =
    typeof searchParams.period === "string"
      ? parseInt(searchParams.period)
      : 90;
  const branchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;

  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere, tenantWhere } = tenantCtx;

  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - period);

  const saleWhere = branchId
    ? { sale: { createdAt: { gte: thresholdDate }, branchId, ...tenantWhere } }
    : { sale: { createdAt: { gte: thresholdDate }, ...tenantBranchWhere } };

  // 1. Find drug IDs that HAVE been sold during the period
  const soldDrugIds = await prisma.saleItem
    .findMany({
      where: saleWhere,
      select: { drugId: true },
      distinct: ["drugId"],
    })
    .then((items: any[]) => items.map((i: any) => i.drugId));

  // 2. Find drugs NOT sold, but WITH stock > 0
  const inventoryFilter = branchId
    ? {
        some: {
          branchId,
          ...tenantWhere,
          batches: { some: { quantity: { gt: 0 } } },
        },
      }
    : {
        some: {
          ...tenantBranchWhere,
          batches: { some: { quantity: { gt: 0 } } },
        },
      };

  const stagnantDrugs = await prisma.globalDrug.findMany({
    where: {
      id: { notIn: soldDrugIds },
      inventories: inventoryFilter,
    },
    include: {
      inventories: {
        where: branchId
          ? { branchId, ...tenantWhere }
          : { ...tenantBranchWhere },
        include: { batches: true, branch: { select: { name: true } } },
      },
      saleItems: {
        orderBy: { sale: { createdAt: "desc" } },
        take: 1,
        include: { sale: { select: { createdAt: true } } },
      },
    },
    take: 100,
  });

  const now = new Date();

  const items = stagnantDrugs
    .map((drug: any) => {
      const totalStock = drug.inventories.reduce(
        (acc: any, inv: any) =>
          acc + inv.batches.reduce((bAcc: any, b: any) => bAcc + b.quantity, 0),
        0,
      );

      const avgCost =
        drug.inventories.length > 0
          ? drug.inventories.reduce((s: any, inv: any) => s + inv.cost, 0) /
            drug.inventories.length
          : 0;

      const valueAtRisk = avgCost * totalStock;

      const lastSale = drug.saleItems[0]?.sale.createdAt || null;
      const referenceDate = lastSale || drug.createdAt;
      const daysSinceLastSale = Math.ceil(
        Math.abs(now.getTime() - new Date(referenceDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      const branches = drug.inventories
        .filter((inv: any) => inv.batches.some((b: any) => b.quantity > 0))
        .map((inv: any) => inv.branch.name);

      return {
        id: drug.id,
        name: drug.tradeName,
        barcode: drug.barcode,
        stock: totalStock,
        valueAtRisk,
        lastSaleDate: lastSale,
        daysSinceLastSale,
        branches,
        neverSold: !lastSale,
      };
    })
    .filter((i: any) => i.stock > 0)
    .sort((a: any, b: any) => b.valueAtRisk - a.valueAtRisk);

  const totalValueAtRisk = items.reduce(
    (s: any, i: any) => s + i.valueAtRisk,
    0,
  );
  const neverSoldCount = items.filter((i: any) => i.neverSold).length;

  const periods = [
    { label: "30 يوم", value: 30 },
    { label: "60 يوم", value: 60 },
    { label: "90 يوم", value: 90 },
    { label: "180 يوم", value: 180 },
  ];

  const buildPeriodUrl = (p: number) => {
    const params = new URLSearchParams();
    params.set("period", String(p));
    if (branchId) params.set("branch", branchId);
    return `/dashboard/reports/slow-movers?${params.toString()}`;
  };

  const extraParams = `period=${period}`;
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  const statCards = [
    {
      label: "قيمة المخزون المجمّد (د.ع)",
      value: fmt(totalValueAtRisk),
      icon: DollarSign,
      tone: "text-destructive",
      bg: "bg-destructive/10",
    },
    {
      label: "عدد الأصناف الراكدة",
      value: String(items.length),
      icon: Package,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "لم تُبَع أبداً",
      value: String(neverSoldCount),
      icon: TrendingDown,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
  ];

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
              <AlertOctagon className="w-6 h-6 text-destructive" />
              الأدوية الراكدة
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              أصناف لم تُبَع خلال الفترة وقيمة المخزون المجمّد فيها
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
        baseUrl="/dashboard/reports/slow-movers"
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
            <div className="w-16 h-16 bg-success/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-success" />
            </div>
            <p className="text-foreground font-medium">لا توجد أصناف راكدة</p>
            <p className="text-sm text-muted-foreground mt-1">
              جميع الأدوية تُباع بانتظام
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الدواء
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الفروع
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المخزون
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    القيمة المجمّدة
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    آخر بيع
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    مدة الركود
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {items.map((item: any) => (
                  <tr
                    key={item.id}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-destructive/10 rounded-lg flex items-center justify-center shrink-0">
                          <Snowflake className="w-4 h-4 text-destructive" />
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
                    <td className="px-6 py-4 text-muted-foreground text-xs max-w-[200px] truncate">
                      {item.branches.join("، ")}
                    </td>
                    <td className="px-6 py-4 font-bold text-foreground">
                      {item.stock}
                    </td>
                    <td
                      className="px-6 py-4 font-bold text-destructive whitespace-nowrap"
                      dir="rtl"
                    >
                      {fmt(item.valueAtRisk)} د.ع
                    </td>
                    <td className="px-6 py-4 text-sm whitespace-nowrap">
                      {item.neverSold ? (
                        <span className="text-warning font-bold">
                          لم تُبَع مطلقاً
                        </span>
                      ) : (
                        <span className="text-muted-foreground" dir="ltr">
                          {new Date(item.lastSaleDate!).toLocaleDateString(
                            "ar-IQ",
                            { timeZone: "Asia/Baghdad" },
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold whitespace-nowrap ${
                          item.daysSinceLastSale > 180
                            ? "bg-destructive/10 text-destructive border-destructive/20"
                            : "bg-warning/10 text-warning border-warning/20"
                        }`}
                      >
                        {item.daysSinceLastSale} يوم
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ملاحظة */}
      <div className="glass-card border-info/30 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-info shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          الأدوية الراكدة هي التي لم تُبَع خلال آخر {period} يوماً ولديها مخزون
          أكبر من صفر. ننصح بعمل عروض عليها أو إرجاعها للمورد لتحرير رأس المال
          المجمّد.
        </p>
      </div>
    </div>
  );
}
