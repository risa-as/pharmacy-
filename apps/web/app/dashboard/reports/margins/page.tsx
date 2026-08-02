export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Package,
  ArrowRight,
  Percent,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

export default async function MarginsReportPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const sortBy =
    typeof searchParams.sort === "string" ? searchParams.sort : "margin_asc";
  const branchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;

  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere } = tenantCtx;

  const inventory = await prisma.inventory.findMany({
    where: branchId
      ? { branchId, ...tenantBranchWhere }
      : { ...tenantBranchWhere },
    include: {
      drug: { select: { tradeName: true, barcode: true } },
      branch: { select: { name: true } },
      batches: { select: { quantity: true } },
    },
  });

  const items = inventory
    .map((inv: any) => {
      const stock = inv.batches.reduce((s: any, b: any) => s + b.quantity, 0);
      const marginPercent =
        inv.price > 0 ? ((inv.price - inv.cost) / inv.price) * 100 : 0;
      const profitPerUnit = inv.price - inv.cost;

      return {
        id: inv.id,
        name: inv.drug.tradeName,
        barcode: inv.drug.barcode,
        branch: inv.branch.name,
        price: inv.price,
        cost: inv.cost,
        marginPercent,
        profitPerUnit,
        stock,
        totalPotentialProfit: profitPerUnit * stock,
      };
    })
    .filter((i: any) => i.stock > 0);

  // Sort
  if (sortBy === "margin_asc")
    items.sort((a: any, b: any) => a.marginPercent - b.marginPercent);
  else if (sortBy === "margin_desc")
    items.sort((a: any, b: any) => b.marginPercent - a.marginPercent);
  else if (sortBy === "profit_desc")
    items.sort(
      (a: any, b: any) => b.totalPotentialProfit - a.totalPotentialProfit,
    );
  else if (sortBy === "stock_desc")
    items.sort((a: any, b: any) => b.stock - a.stock);

  // Pagination. Sorting and the stats below intentionally run over the FULL set
  // first — margin/stock are computed in JS (not DB columns), so paging at the
  // query level would sort only within a page and skew every stat card.
  const PAGE_SIZE = 1000;
  const requestedPage =
    typeof searchParams.page === "string" ? parseInt(searchParams.page, 10) : 1;
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(
    Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1),
    totalPages,
  );
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = items.slice(pageStart, pageStart + PAGE_SIZE);

  // Stats
  const avgMargin =
    items.length > 0
      ? items.reduce((s: any, i: any) => s + i.marginPercent, 0) / items.length
      : 0;
  const lowMarginCount = items.filter((i: any) => i.marginPercent < 10).length;
  const highMarginCount = items.filter((i: any) => i.marginPercent > 30).length;
  const bestItem =
    items.length > 0
      ? [...items].sort(
          (a: any, b: any) => b.marginPercent - a.marginPercent,
        )[0]
      : null;
  const worstItem =
    items.length > 0
      ? [...items].sort(
          (a: any, b: any) => a.marginPercent - b.marginPercent,
        )[0]
      : null;

  const sortOptions = [
    { label: "أقل هامش أولاً", value: "margin_asc" },
    { label: "أعلى هامش أولاً", value: "margin_desc" },
    { label: "أعلى ربح محتمل", value: "profit_desc" },
    { label: "أكبر مخزون", value: "stock_desc" },
  ];

  // Changing the sort drops `page`, so a re-sort always lands on page 1.
  const buildSortUrl = (sort: string) => {
    const params = new URLSearchParams();
    params.set("sort", sort);
    if (branchId) params.set("branch", branchId);
    return `/dashboard/reports/margins?${params.toString()}`;
  };

  const buildPageUrl = (page: number) => {
    const params = new URLSearchParams();
    params.set("sort", sortBy);
    if (branchId) params.set("branch", branchId);
    params.set("page", String(page));
    return `/dashboard/reports/margins?${params.toString()}`;
  };

  const extraParams = `sort=${sortBy}`;
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  const statCards = [
    {
      label: "متوسط هامش الربح",
      value: `${avgMargin.toFixed(1)}%`,
      icon: Percent,
      tone:
        avgMargin >= 20
          ? "text-success"
          : avgMargin >= 10
            ? "text-warning"
            : "text-destructive",
      bg:
        avgMargin >= 20
          ? "bg-success/10"
          : avgMargin >= 10
            ? "bg-warning/10"
            : "bg-destructive/10",
    },
    {
      label: "هامش منخفض (<10%)",
      value: String(lowMarginCount),
      icon: AlertTriangle,
      tone: "text-destructive",
      bg: "bg-destructive/10",
    },
    {
      label: "هامش مرتفع (>30%)",
      value: String(highMarginCount),
      icon: TrendingUp,
      tone: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "إجمالي الأصناف",
      value: String(items.length),
      icon: Package,
      tone: "text-primary",
      bg: "bg-primary/10",
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
            <DollarSign className="w-6 h-6 text-success" />
            هامش الربح لكل دواء
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تحليل ربحية كل صنف والربح المحتمل من المخزون
          </p>
        </div>
      </div>

      {/* الفلاتر والترتيب */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <BranchFilter
          currentBranch={branchId}
          baseUrl="/dashboard/reports/margins"
          extraParams={extraParams}
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="flex items-center gap-1 text-sm text-muted-foreground font-medium ml-1">
            <ArrowUpDown className="w-4 h-4" /> ترتيب:
          </span>
          {sortOptions.map((opt: any) => (
            <a
              key={opt.value}
              href={buildSortUrl(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                sortBy === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {opt.label}
            </a>
          ))}
        </div>
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

      {/* أفضل / أسوأ هامش */}
      {bestItem && worstItem && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="glass-card border-success/30 p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6 text-success" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-success">
                أفضل هامش ربح
              </div>
              <div className="text-lg font-bold text-foreground truncate">
                {bestItem.name}
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="font-bold text-success">
                  {bestItem.marginPercent.toFixed(1)}%
                </span>{" "}
                — ربح {fmt(bestItem.profitPerUnit)} د.ع/عبوة
              </div>
            </div>
          </div>
          <div className="glass-card border-destructive/30 p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <TrendingDown className="w-6 h-6 text-destructive" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-destructive">
                أقل هامش ربح
              </div>
              <div className="text-lg font-bold text-foreground truncate">
                {worstItem.name}
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="font-bold text-destructive">
                  {worstItem.marginPercent.toFixed(1)}%
                </span>{" "}
                — ربح {fmt(worstItem.profitPerUnit)} د.ع/عبوة
              </div>
            </div>
          </div>
        </div>
      )}

      {/* الجدول */}
      <div className="glass-card overflow-hidden">
        {items.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">
              لا توجد أصناف في المخزون
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              أضف مخزوناً لرؤية تحليل الهوامش
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/*
              table-fixed is load-bearing: with the default auto layout the drug
              name's `truncate` (white-space: nowrap) makes the column's intrinsic
              width the full name, so one long name stretched the table far past
              the viewport. Fixed layout caps each column at the width below and
              lets the name wrap/clamp instead. min-w keeps numbers readable on
              narrow screens, where the wrapper scrolls as before.

              Numeric cells wrap rather than nowrap: a few rows carry corrupt
              11-digit values that would overflow a fixed cell, and truncating
              money with an ellipsis would hide the figure instead of showing it.
            */}
            <table className="w-full table-fixed min-w-[1080px] text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="w-[6%] px-3 py-3.5 text-right font-medium font-cairo">
                    #
                  </th>
                  <th className="w-[22%] px-4 py-3.5 text-right font-medium font-cairo">
                    الدواء
                  </th>
                  <th className="w-[10%] px-4 py-3.5 text-right font-medium font-cairo">
                    الفرع
                  </th>
                  <th className="w-[10%] px-4 py-3.5 text-right font-medium font-cairo">
                    سعر البيع
                  </th>
                  <th className="w-[10%] px-4 py-3.5 text-right font-medium font-cairo">
                    سعر التكلفة
                  </th>
                  <th className="w-[10%] px-4 py-3.5 text-right font-medium font-cairo">
                    الربح/عبوة
                  </th>
                  <th className="w-[9%] px-4 py-3.5 text-right font-medium font-cairo">
                    الهامش
                  </th>
                  <th className="w-[7%] px-4 py-3.5 text-right font-medium font-cairo">
                    المخزون
                  </th>
                  <th className="w-[16%] px-4 py-3.5 text-right font-medium font-cairo">
                    الربح المحتمل
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {pageItems.map((item: any, index: number) => (
                  <tr
                    key={item.id}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    {/* Continues across pages rather than restarting at 1.
                        Unformatted: an ordinal takes no thousands separator, and
                        the comma would overflow this column at min width. */}
                    <td className="px-3 py-4 font-mono text-muted-foreground">
                      {pageStart + index + 1}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-success/10 rounded-lg flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-success" />
                        </div>
                        <div className="min-w-0">
                          {/* Wraps to a second line rather than widening the
                              column; full name stays available on hover. */}
                          <p
                            className="font-semibold text-foreground break-words line-clamp-2"
                            title={item.name}
                          >
                            {item.name}
                          </p>
                          {item.barcode && (
                            <p
                              className="text-xs text-muted-foreground truncate"
                              dir="ltr"
                              title={item.barcode}
                            >
                              {item.barcode}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {/* Clamp on an inner element: line-clamp sets
                          display:-webkit-box, which would break table-cell. */}
                      <div
                        className="break-words line-clamp-2"
                        title={item.branch}
                      >
                        {item.branch}
                      </div>
                    </td>
                    <td
                      className="px-4 py-4 text-muted-foreground break-words"
                      dir="rtl"
                    >
                      {fmt(item.price)} د.ع
                    </td>
                    <td
                      className="px-4 py-4 text-muted-foreground break-words"
                      dir="rtl"
                    >
                      {fmt(item.cost)} د.ع
                    </td>
                    <td
                      className={`px-4 py-4 font-bold break-words ${item.profitPerUnit >= 0 ? "text-success" : "text-destructive"}`}
                      dir="rtl"
                    >
                      {fmt(item.profitPerUnit)} د.ع
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold ${
                          item.marginPercent < 10
                            ? "bg-destructive/10 text-destructive border-destructive/20"
                            : item.marginPercent < 20
                              ? "bg-warning/10 text-warning border-warning/20"
                              : "bg-success/10 text-success border-success/20"
                        }`}
                      >
                        {item.marginPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td
                      className="px-4 py-4 text-foreground font-medium"
                      dir="rtl"
                    >
                      {item.stock}
                    </td>
                    <td
                      className="px-4 py-4 font-bold text-success break-words"
                      dir="rtl"
                    >
                      {fmt(item.totalPotentialProfit)} د.ع
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              إظهار{" "}
              <span className="font-medium font-mono text-foreground">
                {(pageStart + 1).toLocaleString("en-US")}
              </span>{" "}
              –{" "}
              <span className="font-medium font-mono text-foreground">
                {Math.min(pageStart + PAGE_SIZE, items.length).toLocaleString(
                  "en-US",
                )}
              </span>{" "}
              من{" "}
              <span className="font-medium font-mono text-foreground">
                {items.length.toLocaleString("en-US")}
              </span>{" "}
              صنف
            </p>
            <div className="flex items-center gap-2">
              <a
                href={buildPageUrl(currentPage - 1)}
                aria-disabled={currentPage <= 1}
                className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card transition-colors ${
                  currentPage <= 1
                    ? "pointer-events-none opacity-40"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                <ChevronRight className="h-4 w-4" />
              </a>
              <span className="text-sm font-medium text-foreground px-2">
                صفحة {currentPage} من {totalPages}
              </span>
              <a
                href={buildPageUrl(currentPage + 1)}
                aria-disabled={currentPage >= totalPages}
                className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card transition-colors ${
                  currentPage >= totalPages
                    ? "pointer-events-none opacity-40"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                <ChevronLeft className="h-4 w-4" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
