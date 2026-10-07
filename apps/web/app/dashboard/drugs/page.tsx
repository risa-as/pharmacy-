export const dynamic = "force-dynamic";

import {
  PlusIcon,
  FileSpreadsheet,
  Pill,
  Globe,
  Building2,
  PackageSearch,
} from "lucide-react";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { UpdateDrug, DeleteDrug } from "@/app/ui/drugs/buttons";
import BatchSearch from "@/app/ui/batches/batch-search";
import TablePagination from "@/app/ui/table-pagination";
import { displayText } from "@/app/lib/display-text";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

const ITEMS_PER_PAGE = 50;

type DrugSource = "all" | "custom" | "global";

async function getDrugs(
  query: string,
  currentPage: number,
  organizationId: string | undefined,
  source: DrugSource,
) {
  // صفوف المذاخر الخاصة (warehouseId != null) ليست جزءاً من الكتالوج المشترك
  // ولا من أدوية المؤسسة — تُستثنى من كل شرائح هذه الصفحة.
  const orgVisible = {
    OR: [
      { organizationId: null, warehouseId: null },
      ...(organizationId ? [{ organizationId }] : []),
    ],
  };

  // Source filter: which slice of the visible catalog to show.
  //  - custom: only drugs this organization added
  //  - global: only the shared global catalog (no organization)
  //  - all:    both (default)
  let sourceFilter: any = orgVisible;
  if (source === "custom") {
    sourceFilter = organizationId
      ? { organizationId }
      : { NOT: { organizationId: null }, warehouseId: null };
  } else if (source === "global") {
    sourceFilter = { organizationId: null, warehouseId: null };
  }

  const searchFilter = query
    ? {
        OR: [
          { tradeName: { contains: query } },
          { scientificName: { contains: query } },
          { barcode: { contains: query } },
        ],
      }
    : {};

  const where = { AND: [sourceFilter, searchFilter] };

  const [drugs, total, totalCatalog, customCount] = await Promise.all([
    prisma.globalDrug.findMany({
      where,
      orderBy: { tradeName: "asc" },
      skip: (currentPage - 1) * ITEMS_PER_PAGE,
      take: ITEMS_PER_PAGE,
    }),
    prisma.globalDrug.count({ where }),
    prisma.globalDrug.count({ where: orgVisible }),
    organizationId
      ? prisma.globalDrug.count({ where: { organizationId } })
      : Promise.resolve(0),
  ]);

  return { drugs, total, totalCatalog, customCount };
}

const pill = "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-bold";

function StatChip({
  icon,
  label,
  value,
  tone,
  href,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`glass-card p-5 flex items-center gap-4 transition-colors ${
        active ? "ring-2 ring-primary/40" : "hover:bg-muted/40"
      }`}
    >
      <div className={`w-12 h-12 rounded-xl ${tone} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground">{value.toLocaleString("en-US")}</p>
      </div>
    </Link>
  );
}

export default async function Page(
  props: {
    searchParams?: Promise<{
      query?: string;
      page?: string;
      source?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");

  const organizationId = tenantCtx.organizationId;
  const isSuperAdmin = tenantCtx.user.role === "SUPER_ADMIN";
  const query = searchParams?.query || "";
  const currentPage = Number(searchParams?.page) || 1;
  const source: DrugSource =
    searchParams?.source === "custom" || searchParams?.source === "global"
      ? searchParams.source
      : "all";
  const { drugs, total, totalCatalog, customCount } = await getDrugs(
    query,
    currentPage,
    organizationId,
    source,
  );
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE) || 1;
  const globalCount = Math.max(0, totalCatalog - customCount);

  // Filter link (resets to page 1, preserves the search query).
  const filterHref = (s: DrugSource) => {
    const params = new URLSearchParams();
    if (s !== "all") params.set("source", s);
    if (query) params.set("query", query);
    const qs = params.toString();
    return qs ? `/dashboard/drugs?${qs}` : "/dashboard/drugs";
  };

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    if (query) params.set("query", query);
    if (source !== "all") params.set("source", source);
    return `/dashboard/drugs?${params.toString()}`;
  };

  return (
    <div className="space-y-6" dir="rtl" suppressHydrationWarning>
      {/* الرأس */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
            <Pill className="w-6 h-6 text-primary" />
            قاعدة الأدوية
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة كتالوج الأدوية العالمي والمخصّص لصيدليتك
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <Link
              href="/dashboard/drugs/import"
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold border border-border bg-card hover:bg-muted text-foreground transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden md:block">استيراد أدوية</span>
            </Link>
          )}
          <Link
            href="/dashboard/drugs/create"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors shadow-sm"
          >
            <PlusIcon className="h-4 w-4" />
            <span className="hidden md:block">إضافة دواء جديد</span>
          </Link>
        </div>
      </div>

      {/* بطاقات الإحصائيات — وهي أيضاً فلتر المصدر */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatChip
          icon={<Pill className="w-6 h-6 text-primary" />}
          label="إجمالي الأدوية"
          value={totalCatalog}
          tone="bg-primary/10"
          href={filterHref("all")}
          active={source === "all"}
        />
        <StatChip
          icon={<Building2 className="w-6 h-6 text-emerald-600" />}
          label="مخصّصة لصيدليتك"
          value={customCount}
          tone="bg-emerald-500/10"
          href={filterHref("custom")}
          active={source === "custom"}
        />
        <StatChip
          icon={<Globe className="w-6 h-6 text-blue-500" />}
          label="أدوية عالمية"
          value={globalCount}
          tone="bg-blue-500/10"
          href={filterHref("global")}
          active={source === "global"}
        />
      </div>

      {/* الجدول — بنفس تصميم جدول الدفعات وسلوكه */}
      <div className="glass-card overflow-hidden">
        {/* البحث */}
        <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
          <BatchSearch
            currentQuery={query}
            placeholder="ابحث بالاسم التجاري أو المادة الفعالة أو الباركود..."
          />
          <span className="text-sm text-muted-foreground">
            {query ? (
              <>
                {total.toLocaleString("en-US")} نتيجة لـ &quot;<span className="font-bold text-foreground">{query}</span>&quot;
              </>
            ) : (
              <>{total.toLocaleString("en-US")} دواء</>
            )}
          </span>
          {(query || source !== "all") && (
            <Link href="/dashboard/drugs" className="text-sm text-primary hover:underline">
              إظهار الكل
            </Link>
          )}
        </div>

        {drugs.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <PackageSearch className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">
              {query
                ? "لا توجد نتائج للبحث"
                : source === "custom"
                  ? "لا توجد أدوية مخصّصة لصيدليتك بعد"
                  : source === "global"
                    ? "لا توجد أدوية عالمية"
                    : "لا توجد أدوية بعد"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {query ? (
                "جرّب كلمة بحث أخرى"
              ) : (
                <Link href="/dashboard/drugs/create" className="text-primary hover:underline">
                  إضافة أول دواء
                </Link>
              )}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الدواء</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الباركود</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">المصدر</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الحالة</th>
                  <th className="px-3 py-3 text-center font-medium font-cairo whitespace-nowrap">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {drugs.map((drug: any) => (
                  <tr key={drug.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-3 py-3">
                      <div className="max-w-[280px]">
                        <p className="font-semibold text-foreground truncate" title={drug.tradeName}>
                          {drug.tradeName}
                        </p>
                        {displayText(drug.scientificName) ? (
                          <p className="text-[11px] text-muted-foreground truncate text-right" dir="ltr" title={drug.scientificName}>
                            {displayText(drug.scientificName)}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/50">—</p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                      <span className="block max-w-[160px] truncate text-right" dir="ltr" title={displayText(drug.barcode) ?? undefined}>
                        {displayText(drug.barcode) ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                      {displayText(drug.origin) ?? <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {drug.isActive ? (
                          <span className={`${pill} bg-success/10 text-success border-success/20`}>نشط</span>
                        ) : (
                          <span className={`${pill} bg-destructive/10 text-destructive border-destructive/20`}>غير نشط</span>
                        )}
                        {drug.organizationId ? (
                          <span className={`${pill} bg-emerald-500/10 text-emerald-600 border-emerald-500/20`}>خاص</span>
                        ) : (
                          <span className={`${pill} bg-blue-500/10 text-blue-600 border-blue-500/20`}>عالمي</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {isSuperAdmin || drug.organizationId === organizationId ? (
                          <>
                            <UpdateDrug id={drug.id} />
                            <DeleteDrug id={drug.id} />
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">للقراءة فقط</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* الترقيم */}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={total}
          unit="دواء"
          hrefFor={pageHref}
        />
      </div>
    </div>
  );
}
