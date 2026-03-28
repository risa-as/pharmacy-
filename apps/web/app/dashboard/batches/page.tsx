export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import { Box } from "lucide-react";
import { formatCurrency } from "@/app/lib/utils/currency";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import BatchSearch from "@/app/ui/batches/batch-search";
import Link from "next/link";

const PAGE_SIZE = 50;

export default async function BatchesPage({
  searchParams,
}: {
  searchParams?: { branch?: string; query?: string; page?: string };
}) {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) return null;
  const { tenantBranchWhere } = tenantCtx;

  const selectedBranchId = searchParams?.branch;
  const query = searchParams?.query ?? "";
  const currentPage = Math.max(1, parseInt(searchParams?.page ?? "1") || 1);

  const inventoryFilter = selectedBranchId
    ? { ...tenantBranchWhere, branchId: selectedBranchId }
    : tenantBranchWhere;

  const searchFilter = query
    ? {
        inventory: {
          ...inventoryFilter,
          drug: {
            OR: [
              { tradeName: { contains: query, mode: "insensitive" as const } },
              { barcode: { contains: query } },
            ],
          },
        },
      }
    : { inventory: inventoryFilter };

  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  // Stats: always across all batches for the branch (no search filter)
  const [totalCount, expiredCount, expiringSoonCount] = await Promise.all([
    prisma.batch.count({ where: { inventory: inventoryFilter } }),
    prisma.batch.count({
      where: { inventory: inventoryFilter, expiryDate: { lt: now } },
    }),
    prisma.batch.count({
      where: {
        inventory: inventoryFilter,
        expiryDate: { gte: now, lte: thirtyDaysFromNow },
      },
    }),
  ]);

  // Paginated + filtered batches
  const [batches, filteredTotal] = await Promise.all([
    prisma.batch.findMany({
      where: searchFilter,
      orderBy: { expiryDate: "asc" },
      include: {
        inventory: {
          include: {
            branch: true,
            drug: { select: { id: true, tradeName: true, barcode: true } },
          },
        },
        supplier: { select: { name: true } },
      },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.batch.count({ where: searchFilter }),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  return (
    <div className="glass-card w-full p-6" dir="rtl">
      <div className="flex w-full items-center justify-between mb-4">
        <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
          <Box className="w-7 h-7 text-primary" />
          إدارة الدفعات
        </h1>
      </div>

      <div className="mb-4">
        <BranchFilter
          currentBranch={selectedBranchId}
          baseUrl="/dashboard/batches"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-3xl font-bold text-foreground">{totalCount}</div>
          <div className="text-sm text-muted-foreground">إجمالي الدفعات</div>
        </div>
        <div className="bg-destructive/10 rounded-xl border border-red-200 p-4">
          <div className="text-3xl font-bold text-destructive">
            {expiredCount}
          </div>
          <div className="text-sm text-destructive">منتهية الصلاحية</div>
        </div>
        <div className="bg-warning/10 rounded-xl border border-warning/30 p-4">
          <div className="text-3xl font-bold text-warning">
            {expiringSoonCount}
          </div>
          <div className="text-sm text-warning">ستنتهي خلال 30 يوم</div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <BatchSearch currentQuery={query} />
      </div>

      {/* Result info */}
      {query && (
        <div className="mb-3 text-sm text-muted-foreground">
          نتائج البحث عن &quot;
          <span className="font-bold text-foreground">{query}</span>&quot;:{" "}
          {filteredTotal} دفعة
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
        {batches.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Box className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>{query ? "لا توجد نتائج للبحث" : "لا توجد دفعات مسجلة"}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
              <tr>
                <th className="px-4 py-3 text-center font-bold w-12">#</th>
                <th className="px-4 py-3 text-right font-bold">الدواء</th>
                <th className="px-4 py-3 text-right font-bold">الفرع</th>
                <th className="px-4 py-3 text-right font-bold">المورد</th>
                <th className="px-4 py-3 text-right font-bold">رقم الدفعة</th>
                <th className="px-4 py-3 text-right font-bold">
                  سعر الشراء (للوحدة)
                </th>
                <th className="px-4 py-3 text-right font-bold">الكمية</th>
                <th className="px-4 py-3 text-right font-bold">
                  تاريخ الانتهاء
                </th>
                <th className="px-4 py-3 text-right font-bold">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batches.map((batch: any, index: number) => {
                const drug = batch.inventory.drug;
                const expiryDate = new Date(batch.expiryDate);
                const isExpired = expiryDate < now;
                const isExpiringSoon =
                  expiryDate >= now && expiryDate <= thirtyDaysFromNow;

                let statusClass = "bg-success/10 text-success";
                let statusText = "صالح";
                if (isExpired) {
                  statusClass = "bg-destructive/10 text-destructive";
                  statusText = "منتهي";
                } else if (isExpiringSoon) {
                  statusClass = "bg-warning/20 text-warning";
                  statusText = "قريب الانتهاء";
                }

                return (
                  <tr key={batch.id} className="hover:bg-muted">
                    <td className="px-4 py-3 text-center text-sm text-muted-foreground font-mono">
                      {(currentPage - 1) * PAGE_SIZE + index + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {drug?.tradeName || "غير معروف"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {batch.inventory.branch?.name || "غير محدد"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {batch.supplier?.name || (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-muted-foreground">
                      {batch.batchNumber}
                    </td>
                    <td className="px-4 py-3 font-bold text-foreground text-right">
                      <span dir="ltr">{formatCurrency(batch.costPrice)}</span>
                    </td>
                    <td className="px-4 py-3 font-bold text-foreground">
                      {batch.quantity}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {expiryDate.toLocaleDateString("ar-IQ")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${statusClass}`}
                      >
                        {statusText}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">
            صفحة {currentPage} من {totalPages} — {filteredTotal} دفعة
          </span>
          <div className="flex items-center gap-1">
            {currentPage > 1 && (
              <PaginationLink
                href={buildPageUrl(searchParams, currentPage - 1)}
                label="السابق"
              />
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(
                (p) =>
                  Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages,
              )
              .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1)
                  acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "..." ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="px-2 py-1.5 text-sm text-muted-foreground"
                  >
                    …
                  </span>
                ) : (
                  <PaginationLink
                    key={p}
                    href={buildPageUrl(searchParams, p as number)}
                    label={String(p)}
                    active={p === currentPage}
                  />
                ),
              )}
            {currentPage < totalPages && (
              <PaginationLink
                href={buildPageUrl(searchParams, currentPage + 1)}
                label="التالي"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function buildPageUrl(
  searchParams: Record<string, string | undefined> | undefined,
  page: number,
) {
  const params = new URLSearchParams();
  if (searchParams?.branch) params.set("branch", searchParams.branch);
  if (searchParams?.query) params.set("query", searchParams.query);
  params.set("page", String(page));
  return `/dashboard/batches?${params.toString()}`;
}

function PaginationLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted border border-border"
      }`}
    >
      {label}
    </Link>
  );
}
