export const dynamic = "force-dynamic";

import {
  PlusIcon,
  FileSpreadsheet,
  Pill,
  Globe,
  Building2,
  ChevronLeft,
  ChevronRight,
  PackageSearch,
} from "lucide-react";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { UpdateDrug, DeleteDrug } from "@/app/ui/drugs/buttons";
import GlobalDrugSearch from "@/app/ui/drugs/global-search";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

const ITEMS_PER_PAGE = 50;

async function getDrugs(
  query: string,
  currentPage: number,
  organizationId: string | undefined,
) {
  const orgVisible = {
    OR: [
      { organizationId: null },
      ...(organizationId ? [{ organizationId }] : []),
    ],
  };

  const searchFilter = query
    ? {
        OR: [
          { tradeName: { contains: query } },
          { scientificName: { contains: query } },
          { barcode: { contains: query } },
        ],
      }
    : {};

  const where = { AND: [orgVisible, searchFilter] };

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

// Deterministic accent colour per drug so the avatar fallbacks aren't all identical.
const AVATAR_COLORS = [
  "bg-blue-500/10 text-blue-500",
  "bg-emerald-500/10 text-emerald-500",
  "bg-violet-500/10 text-violet-500",
  "bg-amber-500/10 text-amber-600",
  "bg-rose-500/10 text-rose-500",
  "bg-cyan-500/10 text-cyan-500",
];
function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function StatChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}
      >
        {icon}
      </div>
      <div>
        <div className="text-lg font-bold leading-none text-foreground font-mono">
          {value.toLocaleString("en-US")}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams?: {
    query?: string;
    page?: string;
  };
}) {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");

  const organizationId = tenantCtx.organizationId;
  const isSuperAdmin = tenantCtx.user.role === "SUPER_ADMIN";
  const query = searchParams?.query || "";
  const currentPage = Number(searchParams?.page) || 1;
  const { drugs, total, totalCatalog, customCount } = await getDrugs(
    query,
    currentPage,
    organizationId,
  );
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE) || 1;
  const globalCount = Math.max(0, totalCatalog - customCount);

  const pageHref = (p: number) =>
    `/dashboard/drugs?page=${p}${query ? `&query=${encodeURIComponent(query)}` : ""}`;

  return (
    <div className="glass-card w-full p-6" dir="rtl" suppressHydrationWarning>
      {/* Header */}
      <div className="flex w-full flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground">
            قاعدة الأدوية
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة كتالوج الأدوية العالمي والمخصّص لصيدليتك.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/drugs/import"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold border border-border/60 bg-card hover:bg-muted text-foreground transition-colors"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden md:block">استيراد أدوية</span>
          </Link>
          <Link
            href="/dashboard/drugs/create"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors shadow-sm"
          >
            <PlusIcon className="h-4 w-4" />
            <span className="hidden md:block">إضافة دواء جديد</span>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <StatChip
          icon={<Pill className="h-5 w-5" />}
          label="إجمالي الأدوية"
          value={totalCatalog}
          tone="bg-primary/10 text-primary"
        />
        <StatChip
          icon={<Building2 className="h-5 w-5" />}
          label="مخصّصة لصيدليتك"
          value={customCount}
          tone="bg-emerald-500/10 text-emerald-500"
        />
        <StatChip
          icon={<Globe className="h-5 w-5" />}
          label="أدوية عالمية"
          value={globalCount}
          tone="bg-blue-500/10 text-blue-500"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="w-full max-w-md">
          <GlobalDrugSearch placeholder="ابحث بالاسم التجاري أو المادة الفعالة أو الباركود..." />
        </div>
        <div className="text-sm text-muted-foreground">
          {query ? (
            <>
              نتائج البحث:{" "}
              <span className="font-bold text-foreground">
                {total.toLocaleString("en-US")}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-foreground">
            <thead className="bg-muted text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
              <tr>
                <th scope="col" className="px-4 py-3 font-cairo w-14">
                  #
                </th>
                <th scope="col" className="px-4 py-3 font-cairo">
                  الدواء
                </th>
                <th scope="col" className="px-4 py-3 font-cairo w-40">
                  الباركود
                </th>
                <th scope="col" className="px-4 py-3 font-cairo w-32">
                  المصدر
                </th>
                <th scope="col" className="px-4 py-3 font-cairo w-32">
                  الحالة
                </th>
                <th scope="col" className="px-4 py-3 font-cairo w-24">
                  الإجراءات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {drugs.map((drug: any, index: number) => (
                <tr
                  key={drug.id}
                  className="text-sm hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-right text-muted-foreground">
                    {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {drug.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={drug.image}
                          alt=""
                          className="h-9 w-9 rounded-lg object-cover shrink-0 border border-border"
                        />
                      ) : (
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold shrink-0 ${avatarColor(drug.tradeName || drug.id)}`}
                        >
                          {(drug.tradeName || "?").trim().charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-right text-foreground break-words">
                          {drug.tradeName}
                        </div>
                        {drug.scientificName && (
                          <div className="text-xs text-right text-muted-foreground break-words">
                            {drug.scientificName}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td
                    className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap text-right"
                    dir="ltr"
                  >
                    {drug.barcode || "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                    {drug.origin || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {drug.isActive ? (
                        <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success ring-1 ring-inset ring-success/20">
                          نشط
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive ring-1 ring-inset ring-destructive/20">
                          غير نشط
                        </span>
                      )}
                      {drug.organizationId ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20">
                          خاص
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500 ring-1 ring-inset ring-blue-500/20">
                          عالمي
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {isSuperAdmin ||
                      drug.organizationId === organizationId ? (
                        <>
                          <UpdateDrug id={drug.id} />
                          <DeleteDrug id={drug.id} />
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground py-2">
                          للقراءة فقط
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {drugs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <PackageSearch className="h-10 w-10 opacity-40" />
                      <p className="text-sm">
                        {query
                          ? "لا توجد أدوية مطابقة للبحث."
                          : "لا توجد أدوية بعد."}
                      </p>
                      {query ? (
                        <Link
                          href="/dashboard/drugs"
                          className="text-xs text-primary hover:underline"
                        >
                          مسح البحث وإظهار الكل
                        </Link>
                      ) : (
                        <Link
                          href="/dashboard/drugs/create"
                          className="text-xs text-primary hover:underline"
                        >
                          إضافة أول دواء
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground hidden sm:block">
              إظهار{" "}
              <span className="font-medium font-mono text-foreground">
                {(currentPage - 1) * ITEMS_PER_PAGE + 1}
              </span>{" "}
              –{" "}
              <span className="font-medium font-mono text-foreground">
                {Math.min(currentPage * ITEMS_PER_PAGE, total)}
              </span>{" "}
              من{" "}
              <span className="font-medium font-mono text-foreground">
                {total.toLocaleString("en-US")}
              </span>
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={pageHref(currentPage - 1)}
                aria-disabled={currentPage <= 1}
                className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card transition-colors ${currentPage <= 1 ? "pointer-events-none opacity-40" : "hover:bg-muted text-foreground"}`}
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
              <span className="text-sm font-medium text-foreground px-2">
                صفحة {currentPage} من {totalPages}
              </span>
              <Link
                href={pageHref(currentPage + 1)}
                aria-disabled={currentPage >= totalPages}
                className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card transition-colors ${currentPage >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-muted text-foreground"}`}
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
