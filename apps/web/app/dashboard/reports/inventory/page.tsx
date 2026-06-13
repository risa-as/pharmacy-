export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import {
  Package,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Tag,
  Banknote,
  TrendingUp,
  CalendarX,
} from "lucide-react";
import Link from "next/link";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { ExportExcelButton } from "@/app/ui/reports/export-buttons";
import InventoryFilters from "@/app/ui/inventory/inventory-filters";

export default async function InventoryReportPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const branchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;
  const query =
    typeof searchParams.query === "string" ? searchParams.query : "";
  const status =
    typeof searchParams.status === "string" ? searchParams.status : "";

  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) return null;
  const { tenantBranchWhere } = tenantCtx;

  const searchWhere = query
    ? {
        drug: {
          OR: [
            { tradeName: { contains: query, mode: "insensitive" as const } },
            {
              scientificName: { contains: query, mode: "insensitive" as const },
            },
            { barcode: { contains: query } },
          ],
        },
      }
    : {};

  const inventory = await prisma.inventory.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      ...tenantBranchWhere,
      ...searchWhere,
    },
    include: {
      branch: true,
      batches: true,
      drug: true,
    },
    orderBy: { drug: { tradeName: "asc" } },
  });

  // Helper to calculate total quantity from batches
  const calculateQuantity = (item: any) => {
    return item.batches.reduce(
      (sum: number, batch: any) => sum + batch.quantity,
      0,
    );
  };

  // Calculate stats on ALL results (before status filter)
  const allWithQuantity = inventory.map((item: any) => ({
    ...item,
    currentQuantity: calculateQuantity(item),
  }));

  const counts = {
    total: allWithQuantity.length,
    shortage: allWithQuantity.filter((i: any) => i.currentQuantity === 0)
      .length,
    low: allWithQuantity.filter(
      (i: any) => i.currentQuantity > 0 && i.currentQuantity < i.minStock,
    ).length,
    good: allWithQuantity.filter(
      (i: any) =>
        i.currentQuantity >= i.minStock && i.currentQuantity <= i.maxStock,
    ).length,
    surplus: allWithQuantity.filter((i: any) => i.currentQuantity > i.maxStock)
      .length,
  };

  // Apply status filter
  let inventoryWithQuantity = allWithQuantity;
  if (status === "shortage")
    inventoryWithQuantity = allWithQuantity.filter(
      (i: any) => i.currentQuantity === 0,
    );
  else if (status === "low")
    inventoryWithQuantity = allWithQuantity.filter(
      (i: any) => i.currentQuantity > 0 && i.currentQuantity < i.minStock,
    );
  else if (status === "good")
    inventoryWithQuantity = allWithQuantity.filter(
      (i: any) =>
        i.currentQuantity >= i.minStock && i.currentQuantity <= i.maxStock,
    );
  else if (status === "surplus")
    inventoryWithQuantity = allWithQuantity.filter(
      (i: any) => i.currentQuantity > i.maxStock,
    );

  const lowStock = counts.low;
  const outOfStock = allWithQuantity.filter(
    (i: any) => i.currentQuantity === 0,
  ).length;
  const healthyStock = counts.good;
  const surplusStock = counts.surplus;
  const totalSaleValue = inventoryWithQuantity.reduce(
    (acc: any, item: any) => acc + item.currentQuantity * item.price,
    0,
  );
  const totalCostValue = inventoryWithQuantity.reduce(
    (acc: any, item: any) => acc + item.currentQuantity * item.cost,
    0,
  );

  // Expiry breakdown (in-stock batches only) — matches the expired-damaged page.
  // Separate already-expired from truly expiring-soon so labels are accurate.
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  let expiringCount = 0; // not yet expired, expires within 30 days
  let expiredCount = 0; // already expired
  for (const item of inventory) {
    for (const batch of item.batches as any[]) {
      if (batch.quantity <= 0) continue;
      const exp = new Date(batch.expiryDate);
      if (exp < now) expiredCount++;
      else if (exp <= thirtyDaysFromNow) expiringCount++;
    }
  }

  const expectedProfit = totalSaleValue - totalCostValue;
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  const statCards = [
    {
      label: "إجمالي الأصناف",
      value: String(counts.total),
      icon: Package,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "قيمة المخزون - بيع (د.ع)",
      value: fmt(totalSaleValue),
      icon: Tag,
      tone: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "قيمة المخزون - شراء (د.ع)",
      value: fmt(totalCostValue),
      icon: Banknote,
      tone: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "الربح المتوقع (د.ع)",
      value: fmt(expectedProfit),
      icon: TrendingUp,
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
              <Package className="w-6 h-6 text-success" />
              تقرير المخزون
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              حالة الأصناف وقيمة المخزون المالية
            </p>
          </div>
        </div>
        <ExportExcelButton
          filename="inventory-report"
          headers={[
            "الصنف",
            "الفرع",
            "الكمية",
            "الحد الأدنى",
            "الحد الأقصى",
            "سعر البيع",
            "سعر الشراء",
            "الحالة",
          ]}
          data={inventoryWithQuantity.map((item: any) => [
            item.drug.tradeName,
            item.branch?.name ?? "—",
            item.currentQuantity,
            item.minStock,
            item.maxStock,
            (item.price ?? 0).toFixed(2),
            (item.cost ?? 0).toFixed(2),
            item.currentQuantity === 0
              ? "نفاد"
              : item.currentQuantity < item.minStock
                ? "منخفض"
                : item.currentQuantity > item.maxStock
                  ? "فائض"
                  : "جيد",
          ])}
        />
      </div>

      {/* فلتر الفرع */}
      <BranchFilter
        currentBranch={branchId}
        baseUrl="/dashboard/reports/inventory"
      />

      {/* البطاقات المالية */}
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

      {/* تنبيهات */}
      {(lowStock > 0 || expiringCount > 0 || expiredCount > 0) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lowStock > 0 && (
            <Link
              href={`/dashboard/inventory/shortages${branchId ? `?branch=${branchId}` : ""}`}
              className="glass-card border-warning/30 p-4 flex items-center gap-4 hover:bg-warning/5 hover:border-warning/50 transition-colors group"
            >
              <div className="w-12 h-12 bg-warning/10 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-warning" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-foreground">
                  {lowStock} صنف بمخزون منخفض
                </div>
                <div className="text-sm text-muted-foreground">
                  يحتاج إلى إعادة طلب · اضغط للإدارة
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-warning transition-colors shrink-0" />
            </Link>
          )}
          {expiringCount > 0 && (
            <Link
              href={`/dashboard/inventory/expired-damaged${branchId ? `?branch=${branchId}` : ""}`}
              className="glass-card border-warning/30 p-4 flex items-center gap-4 hover:bg-warning/5 hover:border-warning/50 transition-colors group"
            >
              <div className="w-12 h-12 bg-warning/10 rounded-xl flex items-center justify-center shrink-0">
                <CalendarX className="w-6 h-6 text-warning" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-foreground">
                  {expiringCount} دفعة تنتهي قريباً
                </div>
                <div className="text-sm text-muted-foreground">
                  خلال 30 يوم · اضغط للإدارة
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-warning transition-colors shrink-0" />
            </Link>
          )}
          {expiredCount > 0 && (
            <Link
              href={`/dashboard/inventory/expired-damaged${branchId ? `?branch=${branchId}` : ""}`}
              className="glass-card border-destructive/30 p-4 flex items-center gap-4 hover:bg-destructive/5 hover:border-destructive/50 transition-colors group"
            >
              <div className="w-12 h-12 bg-destructive/10 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-foreground">
                  {expiredCount} دفعة منتهية الصلاحية
                </div>
                <div className="text-sm text-muted-foreground">
                  يجب شطبها · اضغط للإدارة
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-destructive transition-colors shrink-0" />
            </Link>
          )}
        </div>
      )}

      {/* الجدول */}
      <div className="glass-card overflow-hidden">
        {/* البحث + تبويبات الحالة */}
        <div className="p-4 border-b border-border">
          <InventoryFilters
            counts={counts}
            currentStatus={status}
            currentQuery={query}
          />
        </div>

        {inventory.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">
              لا توجد أصناف في المخزون
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              جرّب فلتراً أو بحثاً آخر
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الصنف
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الفرع
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الكمية
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الأدنى / الأقصى
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    سعر البيع
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    سعر الشراء
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الحالة
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {inventoryWithQuantity.map((item: any) => {
                  const isOut = item.currentQuantity === 0;
                  const isLow = !isOut && item.currentQuantity < item.minStock;
                  const isOver = item.currentQuantity > item.maxStock;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-success/10 rounded-lg flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-success" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">
                              {item.drug.tradeName}
                            </p>
                            {item.drug.barcode && (
                              <p
                                className="text-xs text-muted-foreground"
                                dir="ltr"
                              >
                                {item.drug.barcode}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {item.branch.name}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`font-bold ${isOut ? "text-destructive" : isLow ? "text-warning" : "text-foreground"}`}
                        >
                          {item.currentQuantity}
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 text-muted-foreground text-right"
                        dir="ltr"
                      >
                        {item.maxStock} / {item.minStock}
                      </td>
                      <td
                        className="px-6 py-4 text-muted-foreground text-right"
                        dir="rtl"
                      >
                        {fmt(item.price ?? 0)}
                      </td>
                      <td
                        className="px-6 py-4 text-muted-foreground text-right"
                        dir="rtl"
                      >
                        {fmt(item.cost ?? 0)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-bold ${
                            isOut
                              ? "bg-destructive/10 text-destructive border-destructive/20"
                              : isLow
                                ? "bg-warning/10 text-warning border-warning/20"
                                : isOver
                                  ? "bg-info/10 text-info border-info/20"
                                  : "bg-success/10 text-success border-success/20"
                          }`}
                        >
                          {isOut ? (
                            <>
                              <AlertTriangle className="w-3 h-3" /> نفاد
                            </>
                          ) : isLow ? (
                            <>
                              <AlertTriangle className="w-3 h-3" /> منخفض
                            </>
                          ) : isOver ? (
                            <>
                              <AlertTriangle className="w-3 h-3" /> فائض
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-3 h-3" /> جيد
                            </>
                          )}
                        </span>
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
