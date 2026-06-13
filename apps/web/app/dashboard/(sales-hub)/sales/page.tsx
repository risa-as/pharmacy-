export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  ShoppingCart,
  TrendingUp,
  Package,
  Receipt,
  Calculator,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import SalesTable from "@/app/ui/dashboard/sales/sales-table";

import { getCompanySettings } from "@/app/lib/actions/settings";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import DateRangeFilter from "@/app/ui/reports/date-range-filter";
import SalesSearch from "@/app/ui/dashboard/sales/sales-search";

function buildDateRange(from: string, to: string) {
  const IRAQ_OFFSET = 3 * 60 * 60 * 1000;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0, 0) - IRAQ_OFFSET);
  const end = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999) - IRAQ_OFFSET);
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
    return crossesMidnight
      ? min >= fromMin || min <= toMin
      : min >= fromMin && min <= toMin;
  });
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  const { tenantBranchWhere } = tenantCtx;
  // تعديل الفاتورة متاح للمدير فقط
  const canEditSale =
    tenantCtx.user.role === "ADMIN" || tenantCtx.user.role === "SUPER_ADMIN";
  const branchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;

  const settings = await getCompanySettings();
  const PAGE_SIZE = 100;
  const page =
    typeof searchParams.page === "string"
      ? Math.max(1, parseInt(searchParams.page) || 1)
      : 1;
  const search =
    typeof searchParams.search === "string"
      ? searchParams.search.trim()
      : undefined;
  const fromParam =
    typeof searchParams.from === "string" ? searchParams.from : undefined;
  const toParam =
    typeof searchParams.to === "string" ? searchParams.to : undefined;
  const fromTimeParam =
    typeof searchParams.fromTime === "string"
      ? searchParams.fromTime
      : undefined;
  const toTimeParam =
    typeof searchParams.toTime === "string" ? searchParams.toTime : undefined;

  // فلتر الفترة الزمنية (يُطبّق فقط عند اختيار المستخدم لتاريخ)
  const dateWhere: Prisma.SaleWhereInput = {};
  if (fromParam && toParam) {
    const { start, end } = buildDateRange(fromParam, toParam);
    dateWhere.createdAt = { gte: start, lte: end };
  }

  // بناء شرط البحث
  const searchWhere: Prisma.SaleWhereInput = {};
  if (search) {
    const orConditions: Prisma.SaleWhereInput[] = [
      {
        items: {
          some: {
            drug: {
              OR: [
                { tradeName: { contains: search, mode: "insensitive" } },
                { scientificName: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        },
      },
    ];
    if (!isNaN(Number(search))) {
      orConditions.push({ invoiceNumber: Number(search) });
    }
    searchWhere.OR = orConditions;
  }

  const baseWhere = branchId
    ? { ...tenantBranchWhere, branchId }
    : tenantBranchWhere;
  const finalWhere = { ...baseWhere, ...searchWhere, ...dateWhere };

  // جلب المبيعات
  const [salesRaw, totalCount, statsRaw] = await Promise.all([
    prisma.sale.findMany({
      where: finalWhere,
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { drug: true } },
        branch: true,
        user: true,
        returns: { include: { items: { include: { drug: true } } } },
      },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.sale.count({
      where: finalWhere,
    }),
    // استعلام خفيف لإحصائيات كامل الفترة المفلترة (لا يتأثر بترقيم الصفحات)
    prisma.sale.findMany({
      where: finalWhere,
      select: {
        total: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    }),
  ]);
  // فلتر نطاق الساعات (يُطبّق بعد الجلب لأن قاعدة البيانات تخزّن أيّاماً كاملة)
  const sales = filterByTimeOfDay(salesRaw, fromTimeParam, toTimeParam);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // معاملات الفلاتر للحفاظ عليها عبر روابط الفرع والترقيم
  const filterParams = new URLSearchParams();
  if (branchId) filterParams.set("branch", branchId);
  if (fromParam) filterParams.set("from", fromParam);
  if (toParam) filterParams.set("to", toParam);
  if (fromTimeParam) filterParams.set("fromTime", fromTimeParam);
  if (toTimeParam) filterParams.set("toTime", toTimeParam);
  if (search) filterParams.set("search", search);
  const branchExtraParams = filterParams.toString();
  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams(filterParams);
    params.set("page", String(p));
    return `/dashboard/sales?${params.toString()}`;
  };

  // إحصائيات الفترة المفلترة — محسوبة من كامل النتائج بعد تطبيق فلتر الساعة
  const statsFiltered = filterByTimeOfDay(statsRaw, fromTimeParam, toTimeParam);
  const periodCount = statsFiltered.length;
  const periodTotal = statsFiltered.reduce((acc, s) => acc + s.total, 0);
  const periodItems = statsFiltered.reduce((acc, s) => acc + s._count.items, 0);
  const periodAvg = periodCount > 0 ? periodTotal / periodCount : 0;
  const hasDateFilter = !!(fromParam && toParam);
  const periodLabel = hasDateFilter ? "الفترة المحددة" : "كل المبيعات";
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  const statCards = [
    {
      label: "إجمالي المبيعات (د.ع)",
      value: fmt(periodTotal),
      sub: periodLabel,
      icon: TrendingUp,
      tone: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "عدد العمليات",
      value: periodCount.toLocaleString("en-US"),
      sub: "عملية بيع",
      icon: ShoppingCart,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "الأصناف المباعة",
      value: periodItems.toLocaleString("en-US"),
      sub: "صنف مباع",
      icon: Package,
      tone: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "متوسط الفاتورة (د.ع)",
      value: fmt(periodAvg),
      sub: "لكل عملية",
      icon: Calculator,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* الرأس */}
      <div>
        <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-primary" />
          المبيعات
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          سجل فواتير البيع مع الفلترة والبحث
        </p>
      </div>

      {/* الفلاتر */}
      <div className="space-y-3">
        <DateRangeFilter
          baseUrl="/dashboard/sales"
          currentFrom={fromParam}
          currentTo={toParam}
          currentFromTime={fromTimeParam}
          currentToTime={toTimeParam}
          extraParams={branchId ? { branch: branchId } : {}}
          showTimeFilter
        />
        <BranchFilter
          currentBranch={branchId}
          baseUrl="/dashboard/sales"
          extraParams={branchExtraParams}
        />
      </div>

      {/* بطاقات الإحصائيات — تعكس الفترة المختارة */}
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
                <p className="text-xs text-muted-foreground truncate">
                  {card.sub}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* جدول المبيعات */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Title */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Receipt className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="font-bold text-foreground font-cairo leading-tight">
                  سجل المبيعات
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {search
                    ? `${totalCount.toLocaleString()} نتيجة بحث`
                    : `${totalCount.toLocaleString()} فاتورة${totalPages > 1 ? ` — صفحة ${page} من ${totalPages}` : ""}`}
                </p>
              </div>
            </div>
            {/* Search */}
            <Suspense
              fallback={
                <div className="h-10 w-full sm:w-80 rounded-lg bg-muted/80 animate-pulse" />
              }
            >
              <SalesSearch />
            </Suspense>
          </div>
        </div>

        {sales.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>لا توجد مبيعات مسجلة</p>
          </div>
        ) : (
          <SalesTable sales={sales} settings={settings} canEdit={canEditSale} />
        )}

        {/* Pagination */}
        {totalPages > 1 && !search && (
          <div className="flex items-center justify-center gap-2 p-4 border-t border-border">
            {page > 1 && (
              <Link
                href={buildPageUrl(page - 1)}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
              >
                السابق
              </Link>
            )}
            <span className="text-sm text-muted-foreground px-2">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={buildPageUrl(page + 1)}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
              >
                التالي
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
