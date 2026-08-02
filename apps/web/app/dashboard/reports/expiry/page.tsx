export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Package,
  ArrowRight,
  Info,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import ExpiryPeriodFilter from "@/app/ui/reports/expiry-period-filter";

export default async function ExpiryReportPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const branchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;
  const totalDays =
    typeof searchParams.days === "string"
      ? Math.max(1, parseInt(searchParams.days) || 30)
      : 30;
  const criticalDays = Math.ceil(totalDays / 2); // النصف الأول = حرجة
  const warningDays = totalDays; // النصف الثاني حتى نهاية الفترة = تحذيرية

  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere } = tenantCtx;

  const now = new Date();
  const inCriticalDays = new Date();
  inCriticalDays.setDate(inCriticalDays.getDate() + criticalDays);
  const inWarningDays = new Date();
  inWarningDays.setDate(inWarningDays.getDate() + warningDays);

  // legacy aliases
  const in30Days = inCriticalDays;
  const in90Days = inWarningDays;

  // Fetch all batches with their drug info, filtered by branch
  const batches = await prisma.batch.findMany({
    where: {
      quantity: { gt: 0 },
      inventory: {
        ...tenantBranchWhere,
        ...(branchId ? { branchId } : {}),
      },
    },
    include: {
      inventory: {
        include: {
          drug: { select: { tradeName: true, barcode: true } },
          branch: { select: { name: true } },
        },
      },
    },
    orderBy: { expiryDate: "asc" },
  });

  // Categorize
  const expired: typeof batches = [];
  const critical: typeof batches = [];
  const warning: typeof batches = [];
  const safe: typeof batches = [];

  batches.forEach((batch: any) => {
    const expiry = new Date(batch.expiryDate);
    if (expiry < now) expired.push(batch);
    else if (expiry < in30Days) critical.push(batch);
    else if (expiry < in90Days) warning.push(batch);
    else safe.push(batch);
  });

  const expiredValue = expired.reduce(
    (s: any, b: any) => s + b.quantity * b.inventory.cost,
    0,
  );
  const criticalValue = critical.reduce(
    (s: any, b: any) => s + b.quantity * b.inventory.cost,
    0,
  );

  const warningValue = warning.reduce(
    (s: any, b: any) => s + b.quantity * b.inventory.cost,
    0,
  );
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  const categories = [
    {
      title: "منتهية الصلاحية",
      icon: XCircle,
      items: expired,
      tone: "text-destructive",
      bg: "bg-destructive/10",
      value: expiredValue,
    },
    {
      title: `حرجة (أقل من ${criticalDays} يوم)`,
      icon: AlertTriangle,
      items: critical,
      tone: "text-warning",
      bg: "bg-warning/10",
      value: criticalValue,
    },
    {
      title: `تحذيرية (${criticalDays}-${warningDays} يوم)`,
      icon: Clock,
      items: warning,
      tone: "text-warning",
      bg: "bg-warning/10",
      value: warningValue,
    },
    {
      title: `آمنة (أكثر من ${warningDays} يوم)`,
      icon: CheckCircle,
      items: safe,
      tone: "text-success",
      bg: "bg-success/10",
      value: null as number | null,
    },
  ];

  function getDaysRemaining(expiryDate: Date) {
    const diff = new Date(expiryDate).getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

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
              <AlertTriangle className="w-6 h-6 text-warning" />
              تقرير انتهاء الصلاحية
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              تصنيف الدفعات حسب خطورة قرب انتهاء صلاحيتها
            </p>
          </div>
        </div>
        <Link
          href={`/dashboard/inventory/expired-damaged${branchId ? `?branch=${branchId}` : ""}`}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <Trash2 className="w-4 h-4 text-destructive" />
          إدارة وشطب الدفعات
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
        </Link>
      </div>

      {/* الفلاتر */}
      <div className="space-y-3">
        <BranchFilter
          currentBranch={branchId}
          baseUrl="/dashboard/reports/expiry"
        />
        <ExpiryPeriodFilter currentDays={totalDays} />
      </div>

      {/* بطاقات الملخص */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <div key={cat.title} className="glass-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <div
                  className={`w-10 h-10 rounded-xl ${cat.bg} flex items-center justify-center shrink-0`}
                >
                  <Icon className={`w-5 h-5 ${cat.tone}`} />
                </div>
                <span className="text-sm font-bold text-muted-foreground">
                  {cat.title}
                </span>
              </div>
              <div
                className={`text-2xl font-bold ${cat.items.length > 0 ? cat.tone : "text-foreground"}`}
              >
                {cat.items.length}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  دفعة
                </span>
              </div>
              {cat.value !== null && cat.value > 0 && (
                <div className="text-xs text-muted-foreground mt-1" dir="ltr">
                  القيمة: {fmt(cat.value)} د.ع
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* جداول الفئات الخطرة (منتهية + حرجة + تحذيرية) */}
      {categories.slice(0, 3).map((cat) => {
        if (cat.items.length === 0) return null;
        const Icon = cat.icon;
        return (
          <div key={cat.title} className="glass-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <Icon className={`w-4 h-4 ${cat.tone}`} />
              <h2 className="font-bold text-foreground">{cat.title}</h2>
              <span
                className={`mr-auto text-xs rounded-full px-2.5 py-0.5 font-bold ${cat.bg} ${cat.tone}`}
              >
                {cat.items.length} دفعة
              </span>
            </div>
            <div className="overflow-x-auto">
              {/*
                table-fixed is load-bearing: under the default auto layout the
                drug name's `truncate` (white-space: nowrap) makes the column's
                intrinsic width the full name, so one long name stretched the
                table far past the viewport. Fixed layout caps each column at the
                width below and lets the content wrap/clamp instead.

                The name is not the only offender here — barcodes reach 90 chars
                and sync-generated batch numbers 45, so both are clamped too.
              */}
              <table className="w-full table-fixed min-w-[960px] text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                  <tr>
                    <th className="w-[6%] px-3 py-3.5 text-right font-medium font-cairo">
                      #
                    </th>
                    <th className="w-[26%] px-4 py-3.5 text-right font-medium font-cairo">
                      الدواء
                    </th>
                    <th className="w-[11%] px-4 py-3.5 text-right font-medium font-cairo">
                      الفرع
                    </th>
                    <th className="w-[15%] px-4 py-3.5 text-right font-medium font-cairo">
                      رقم الدفعة
                    </th>
                    <th className="w-[7%] px-4 py-3.5 text-right font-medium font-cairo">
                      الكمية
                    </th>
                    <th className="w-[14%] px-4 py-3.5 text-right font-medium font-cairo">
                      تاريخ الانتهاء
                    </th>
                    <th className="w-[21%] px-4 py-3.5 text-right font-medium font-cairo">
                      المتبقي
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {cat.items.map((batch: any, index: number) => {
                    const days = getDaysRemaining(batch.expiryDate);
                    return (
                      <tr
                        key={batch.id}
                        className="hover:bg-muted/40 transition-colors"
                      >
                        {/* Numbered per category table, so each restarts at 1. */}
                        <td className="px-3 py-4 font-mono text-muted-foreground">
                          {index + 1}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cat.bg}`}
                            >
                              <Package className={`w-4 h-4 ${cat.tone}`} />
                            </div>
                            <div className="min-w-0">
                              {/* Wraps to a second line rather than widening the
                                  column; full name stays available on hover. */}
                              <p
                                className="font-semibold text-foreground break-words line-clamp-2"
                                title={batch.inventory.drug.tradeName}
                              >
                                {batch.inventory.drug.tradeName}
                              </p>
                              {batch.inventory.drug.barcode && (
                                <p
                                  className="text-xs text-muted-foreground truncate"
                                  dir="ltr"
                                  title={batch.inventory.drug.barcode}
                                >
                                  {batch.inventory.drug.barcode}
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
                            title={batch.inventory.branch.name}
                          >
                            {batch.inventory.branch.name}
                          </div>
                        </td>
                        <td
                          className="px-4 py-4 font-mono text-xs text-muted-foreground"
                          dir="rtl"
                        >
                          {/* break-all: sync-generated numbers have no spaces
                              to break at, so they'd overflow a fixed cell. */}
                          <div
                            className="break-all line-clamp-2"
                            title={batch.batchNumber}
                          >
                            {batch.batchNumber}
                          </div>
                        </td>
                        <td className="px-4 py-4 font-bold text-foreground">
                          {batch.quantity}
                        </td>
                        <td
                          className="px-4 py-4 text-muted-foreground"
                          dir="rtl"
                        >
                          {new Date(batch.expiryDate).toLocaleDateString(
                            "ar-IQ",
                            { timeZone: "Asia/Baghdad" },
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold whitespace-nowrap ${
                              days < 0
                                ? "bg-destructive/10 text-destructive border-destructive/20"
                                : "bg-warning/10 text-warning border-warning/20"
                            }`}
                          >
                            {days < 0
                              ? `منتهٍ منذ ${Math.abs(days)} يوم`
                              : `${days} يوم`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {batches.length === 0 && (
        <div className="glass-card py-16 text-center">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-muted-foreground opacity-50" />
          </div>
          <p className="text-foreground font-medium">
            لا توجد دفعات مسجلة في المخزون
          </p>
        </div>
      )}

      {/* ملاحظة */}
      <div className="glass-card border-info/30 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-info shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          يعرض هذا التقرير الدفعات ذات الكمية الأكبر من صفر فقط. الأدوية
          المنتهية يجب سحبها من الرفوف فوراً وشطبها من صفحة الإدارة.
        </p>
      </div>
    </div>
  );
}
