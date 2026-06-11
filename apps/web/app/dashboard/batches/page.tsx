export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import { Box, AlertTriangle, Clock } from "lucide-react";
import { getTenantContext } from "@/app/lib/tenant-utils";
import BatchTable from "@/app/ui/batches/batch-table";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import BatchSearch from "@/app/ui/batches/batch-search";
import Link from "next/link";

const PAGE_SIZE = 1000;

export default async function BatchesPage({
  searchParams,
}: {
  searchParams?: { branch?: string; query?: string; page?: string };
}) {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere } = tenantCtx;

  const selectedBranchId = searchParams?.branch;
  const query = searchParams?.query ?? "";
  const currentPage = Math.max(1, parseInt(searchParams?.page ?? "1") || 1);

  const inventoryFilter = selectedBranchId
    ? { ...tenantBranchWhere, branchId: selectedBranchId }
    : tenantBranchWhere;

  const searchFilter = query
    ? {
        inventory: inventoryFilter,
        OR: [
          { inventory: { drug: { tradeName: { contains: query, mode: "insensitive" as const } } } },
          { inventory: { drug: { barcode: { contains: query } } } },
          { batchNumber: { contains: query, mode: "insensitive" as const } },
        ],
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
      orderBy: { createdAt: "desc" },
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

  const statCards = [
    { label: "إجمالي الدفعات", value: totalCount, icon: Box, tone: "text-primary", bg: "bg-primary/10" },
    { label: "منتهية الصلاحية", value: expiredCount, icon: AlertTriangle, tone: "text-destructive", bg: "bg-destructive/10" },
    { label: "ستنتهي خلال 30 يوم", value: expiringSoonCount, icon: Clock, tone: "text-warning", bg: "bg-warning/10" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* الرأس */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
            <Box className="w-6 h-6 text-primary" />
            إدارة الدفعات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تتبّع دفعات الأدوية وأسعار الشراء وتواريخ الصلاحية
          </p>
        </div>
        <BranchFilter currentBranch={selectedBranchId} baseUrl="/dashboard/batches" />
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="glass-card p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-6 h-6 ${card.tone}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className={`text-2xl font-bold ${card.value > 0 ? card.tone : "text-foreground"}`}>
                  {card.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* الجدول */}
      <div className="glass-card overflow-hidden">
        {/* البحث */}
        <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
          <BatchSearch currentQuery={query} />
          {query && (
            <span className="text-sm text-muted-foreground">
              {filteredTotal} نتيجة لـ &quot;<span className="font-bold text-foreground">{query}</span>&quot;
            </span>
          )}
        </div>

        {batches.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Box className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">
              {query ? "لا توجد نتائج للبحث" : "لا توجد دفعات مسجلة"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {query ? "جرّب كلمة بحث أخرى" : "ستظهر الدفعات هنا عند إدخال المخزون"}
            </p>
          </div>
        ) : (
          <BatchTable
            batches={batches.map((b: any) => ({
              id: b.id,
              batchNumber: b.batchNumber,
              costPrice: b.costPrice,
              quantity: b.quantity,
              expiryDate: b.expiryDate.toISOString(),
              createdAt: b.createdAt.toISOString(),
              supplierId: b.supplierId,
              inventory: {
                branch: b.inventory.branch
                  ? { name: b.inventory.branch.name }
                  : null,
                drug: b.inventory.drug
                  ? {
                      id: b.inventory.drug.id,
                      tradeName: b.inventory.drug.tradeName,
                      barcode: b.inventory.drug.barcode,
                    }
                  : null,
              },
              supplier: b.supplier ? { name: b.supplier.name } : null,
            }))}
            currentPage={currentPage}
            pageSize={PAGE_SIZE}
          />
        )}

        {/* الترقيم */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
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
      className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted border border-border"
      }`}
    >
      {label}
    </Link>
  );
}
