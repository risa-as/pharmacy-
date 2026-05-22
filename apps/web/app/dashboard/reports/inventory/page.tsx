export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import {
  Package,
  ArrowRight,
  Download,
  AlertTriangle,
  CheckCircle,
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

  // Check for expiring batches
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const expiringBatches = inventory.flatMap((item: any) =>
    item.batches.filter(
      (batch: any) => new Date(batch.expiryDate) <= thirtyDaysFromNow,
    ),
  ).length;

  return (
    <div className="glass-card w-full p-6" dir="rtl" suppressHydrationWarning>
      <div className="flex w-full items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/reports"
            className="p-2 bg-muted hover:bg-muted rounded-lg transition-colors"
          >
            <ArrowRight className="w-5 h-5 text-muted-foreground" />
          </Link>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
            <Package className="w-7 h-7 text-success" />
            تقرير المخزون
          </h1>
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

      {/* Branch Filter */}
      <div className="mb-4">
        <BranchFilter
          currentBranch={branchId}
          baseUrl="/dashboard/reports/inventory"
        />
      </div>

      {/* إحصائيات */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 mb-8">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-xl font-bold text-foreground">
            {counts.total}
          </div>
          <div className="text-xs text-muted-foreground">إجمالي الأصناف</div>
        </div>
        <div className="bg-success/10 rounded-xl border border-green-200 p-4">
          <div className="text-xl font-bold text-success">{healthyStock}</div>
          <div className="text-xs text-success">مخزون جيد</div>
        </div>
        <div className="bg-warning/10 rounded-xl border border-warning/30 p-4">
          <div className="text-xl font-bold text-warning">{lowStock}</div>
          <div className="text-xs text-warning">مخزون منخفض</div>
        </div>
        <div className="bg-destructive/10 rounded-xl border border-red-200 p-4">
          <div className="text-xl font-bold text-destructive">{outOfStock}</div>
          <div className="text-xs text-destructive">نفاد المخزون</div>
        </div>
        <div className="bg-amber-500/10 rounded-xl border border-amber-400/30 p-4">
          <div className="text-xl font-bold text-amber-600">{surplusStock}</div>
          <div className="text-xs text-amber-600">مخزون فائض</div>
        </div>
        <div className="bg-primary/10 rounded-xl border border-primary p-4">
          <div className="text-lg font-bold text-primary tabular-nums">
            {totalSaleValue.toLocaleString()}
          </div>
          <div className="text-xs text-primary">قيمة المخزون (بيع)</div>
        </div>
        <div className="bg-purple-500/10 rounded-xl border border-purple-400/40 p-4">
          <div className="text-lg font-bold text-purple-600 tabular-nums">
            {totalCostValue.toLocaleString()}
          </div>
          <div className="text-xs text-purple-600">قيمة المخزون (شراء)</div>
        </div>
      </div>

      {/* تنبيهات */}
      {(lowStock > 0 || expiringBatches > 0) && (
        <div className="grid gap-4 sm:grid-cols-2 mb-8">
          {lowStock > 0 && (
            <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-warning/20 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-warning" />
              </div>
              <div>
                <div className="font-bold text-warning">
                  {lowStock} صنف بمخزون منخفض
                </div>
                <div className="text-sm text-warning">يحتاج إلى إعادة طلب</div>
              </div>
            </div>
          )}
          {expiringBatches > 0 && (
            <div className="bg-destructive/10 border border-red-200 rounded-xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-destructive/10 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <div className="font-bold text-destructive">
                  {expiringBatches} دفعة تنتهي صلاحيتها قريباً
                </div>
                <div className="text-sm text-destructive">خلال 30 يوم</div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Search + Status Filters */}
      <div className="mb-6">
        <InventoryFilters
          counts={counts}
          currentStatus={status}
          currentQuery={query}
        />
      </div>
      {/* جدول المخزون */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-bold text-foreground">تفاصيل المخزون</h3>
        </div>
        {inventory.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            لا توجد أصناف في المخزون
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
              <tr>
                <th className="px-4 py-3 text-center font-bold w-12">#</th>
                <th className="px-4 py-3 text-right font-bold">الصنف</th>
                <th className="px-4 py-3 text-right font-bold">الفرع</th>
                <th className="px-4 py-3 text-right font-bold">الكمية</th>
                <th className="px-4 py-3 text-right font-bold">الحد الأدنى</th>
                <th className="px-4 py-3 text-right font-bold">الحد الأقصى</th>
                <th className="px-4 py-3 text-right font-bold">سعر البيع</th>
                <th className="px-4 py-3 text-right font-bold">سعر الشراء</th>
                <th className="px-4 py-3 text-right font-bold">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inventoryWithQuantity.map((item: any, index: number) => {
                const isOut = item.currentQuantity === 0;
                const isLow = !isOut && item.currentQuantity < item.minStock;
                const isOver = item.currentQuantity > item.maxStock;
                const profit = (item.price ?? 0) - (item.cost ?? 0);
                const profitPct =
                  (item.cost ?? 0) > 0 ? (profit / item.cost) * 100 : 0;
                const isLoss = profit < 0;
                return (
                  <tr key={item.id} className="hover:bg-muted">
                    <td className="px-4 py-3 text-center text-sm text-muted-foreground font-mono">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 font-bold text-foreground">
                      {item.drug.tradeName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.branch.name}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-bold ${isOut ? "text-destructive" : isLow ? "text-warning" : "text-foreground"}`}
                      >
                        {item.currentQuantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.minStock}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.maxStock}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(item.price ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(item.cost ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                          isOut
                            ? "bg-destructive/10 text-destructive"
                            : isLow
                              ? "bg-warning/20 text-warning"
                              : isOver
                                ? "bg-amber-500/10 text-amber-600"
                                : "bg-success/10 text-success"
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
        )}
      </div>
    </div>
  );
}
