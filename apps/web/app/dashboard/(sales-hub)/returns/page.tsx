import Link from 'next/link';
import ReturnStockReview from '@/app/ui/sales/return-stock-review';
export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";
import { Undo2, Banknote, Package } from "lucide-react";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import TableSearch from "@/app/ui/table-search";
import TablePagination from "@/app/ui/table-pagination";
import { formatCurrency } from "@/app/lib/utils/currency";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

const PAGE_SIZE = 50;

export default async function ReturnsPage(
  props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  }
) {
  const searchParams = await props.searchParams;
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere } = tenantCtx;
  if (!tenantCtx.userPermissions.canViewReturns) redirect('/dashboard');
  const canReviewStock = ['ADMIN','MANAGER'].includes(tenantCtx.user.role) && tenantCtx.userPermissions.canDoStocktake && tenantCtx.userPermissions.canProcessReturn;
  const branchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;
  const search =
    typeof searchParams.search === "string" && searchParams.search.trim()
      ? searchParams.search.trim()
      : undefined;
  const page =
    typeof searchParams.page === "string" ? Math.max(1, parseInt(searchParams.page) || 1) : 1;

  const scopeWhere: Prisma.SaleReturnWhereInput = branchId ? { AND: [tenantBranchWhere, { branchId }] } : tenantBranchWhere;
  // البحث برقم الإرجاع أو رقم الفاتورة الأصلية أو اسم صنف مُرجع
  const returnsWhere: Prisma.SaleReturnWhereInput = search
    ? {
        AND: [
          scopeWhere,
          {
            OR: [
              { documentNumber: { contains: search, mode: "insensitive" } },
              { sale: { documentNumber: { contains: search, mode: "insensitive" } } },
              { items: { some: { drug: { tradeName: { contains: search, mode: "insensitive" } } } } },
            ],
          },
        ],
      }
    : scopeWhere;

  // The cards cover every matching return, not only the page on screen.
  const [returns, totals, itemTotals] = await Promise.all([
    prisma.saleReturn.findMany({
      where: returnsWhere,
      orderBy: { createdAt: "desc" },
      include: {
        sale: { include: { user: { select: { name: true } }, patient: true } },
        branch: true,
        items: { include: { drug: true } },
      },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.saleReturn.aggregate({ where: returnsWhere, _count: { _all: true }, _sum: { total: true } }),
    prisma.saleReturnItem.aggregate({ where: { saleReturn: returnsWhere }, _sum: { quantity: true } }),
  ]);
  const totalCount = totals._count._all;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const reviewPage = Math.max(1, Number(searchParams.reviewPage) || 1);
  const pendingWhere = { stockStatus: 'QUARANTINED', saleReturn: scopeWhere };
  const [pendingRows, pendingCount] = await Promise.all([
    prisma.saleReturnItem.findMany({ where: pendingWhere, include: { drug: true, saleReturn: { select: { branchId: true, documentNumber: true } } }, orderBy: { id: 'asc' }, take: 50, skip: (reviewPage - 1) * 50 }),
    prisma.saleReturnItem.count({ where: pendingWhere }),
  ]);
  const pending = pendingRows.map(i => ({ ...i, branchId: i.saleReturn.branchId }));
  const reviewHref = (p: number) => `/dashboard/returns?${new URLSearchParams({ ...(branchId ? { branch: branchId } : {}), reviewPage: String(p) })}`;
  const reviewBatches = canReviewStock && pending.length ? await prisma.batch.findMany({ where: { expiryDate: { gt: new Date() }, inventory: { AND: [tenantBranchWhere, { drugId: { in: pending.map(i => i.drugId) } }] } }, select: { id: true, batchNumber: true, expiryDate: true, inventory: { select: { drugId: true, branchId: true } } } }) : [];

  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (branchId) params.set("branch", branchId);
    if (search) params.set("search", search);
    params.set("page", String(p));
    return `/dashboard/returns?${params.toString()}`;
  };
  const branchExtraParams = search ? new URLSearchParams({ search }).toString() : undefined;

  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  const statCards = [
    {
      label: "عدد المرتجعات",
      value: totalCount.toLocaleString("en-US"),
      sub: "عملية إرجاع",
      icon: Undo2,
      tone: "text-destructive",
      bg: "bg-destructive/10",
    },
    {
      label: "إجمالي المبالغ المستردة (د.ع)",
      value: fmt(totals._sum.total ?? 0),
      sub: "قيمة المرتجعات",
      icon: Banknote,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "الأصناف المرجعة",
      value: fmt(itemTotals._sum.quantity ?? 0),
      sub: "وحدة",
      icon: Package,
      tone: "text-info",
      bg: "bg-info/10",
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* الرأس */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
            <Undo2 className="w-6 h-6 text-destructive" />
            المرتجعات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            سجل عمليات إرجاع الفواتير والمبالغ المستردة
          </p>
        </div>
        <BranchFilter currentBranch={branchId} baseUrl="/dashboard/returns" extraParams={branchExtraParams} />
      </div>

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
                <p className="text-xs text-muted-foreground">{card.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      {pending.length > 0 && <section className="glass-card p-4 space-y-3"><h2 className="font-bold">مرتجعات تنتظر فحص المخزون ({pendingCount})</h2>{pending.map(item => <div key={item.id} className="border-b pb-3"><strong>{item.drug.tradeName}</strong> · {item.quantity} وحدة {canReviewStock ? <ReturnStockReview id={item.id} batches={reviewBatches.filter(b => b.inventory.drugId === item.drugId && b.inventory.branchId === item.branchId).map(b => ({ id: b.id, label: `${b.batchNumber} — ${b.expiryDate.toLocaleDateString('en-GB')}` }))} /> : <p className="text-xs text-warning">اعزل هذه الكمية؛ اعتمادها متاح للمدير.</p>}</div>)}<nav className="flex gap-4 text-sm">{reviewPage > 1 && <Link href={reviewHref(reviewPage - 1)}>السابق</Link>}{reviewPage * 50 < pendingCount && <Link href={reviewHref(reviewPage + 1)}>التالي</Link>}</nav></section>}

      {/* الجدول — بنفس تصميم جدول الدفعات وسلوكه */}
      <div className="glass-card overflow-hidden">
        {/* البحث */}
        <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
          <TableSearch currentQuery={search ?? ""} param="search" placeholder="بحث برقم الإرجاع أو رقم الفاتورة أو اسم الصنف..." />
          <span className="text-sm text-muted-foreground">
            {search ? (
              <>
                {totalCount.toLocaleString("en-US")} نتيجة لـ &quot;<span className="font-bold text-foreground">{search}</span>&quot;
              </>
            ) : (
              <>{totalCount.toLocaleString("en-US")} عملية إرجاع</>
            )}
          </span>
        </div>

        {returns.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Undo2 className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">
              {search ? "لا توجد نتائج للبحث" : "لا توجد مرتجعات مسجلة"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? "جرّب كلمة بحث أخرى" : "ستظهر هنا عمليات إرجاع الفواتير"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">رقم الإرجاع</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الفاتورة الأصلية</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الأصناف المرجعة</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الفرع</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الكاشير</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">المبلغ المسترد</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">التاريخ</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {returns.map((ret: any) => {
                  const createdAt = new Date(ret.createdAt);
                  const lines: string[] = ret.items.map((item: any) => `${item.quantity} × ${item.drug?.tradeName || "غير معروف"}`);
                  const others = lines.length - 1;
                  return (
                    <tr key={ret.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-3 py-3 font-mono font-bold text-primary whitespace-nowrap" dir="ltr">
                        {ret.documentNumber}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap" dir="ltr">
                        {ret.sale.documentNumber}
                      </td>
                      <td className="px-3 py-3">
                        <div className="max-w-[200px]">
                          <p className="font-semibold text-foreground truncate" title={lines.join("، ") || undefined}>
                            {lines[0] ?? "—"}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {others > 0 ? `و ${others} ${others === 1 ? "صنف آخر" : "أصناف أخرى"}` : "صنف واحد"}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        <span className="block max-w-[160px] truncate" title={ret.branch?.name || undefined}>
                          {ret.branch?.name || "غير محدد"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {ret.sale?.user?.name ? (
                          <span className="block max-w-[120px] truncate" title={ret.sale.user.name}>
                            {ret.sale.user.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-bold text-destructive whitespace-nowrap" dir="ltr">
                        {formatCurrency(ret.total)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-xs text-muted-foreground leading-tight whitespace-nowrap" dir="ltr">
                          <div>{createdAt.toLocaleDateString("ar-IQ", { timeZone: "Asia/Baghdad" })}</div>
                          <div className="text-[10px] text-muted-foreground/60">
                            {createdAt.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" })}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        <span className="block max-w-[180px] truncate" title={ret.notes || undefined}>
                          {ret.notes || "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* الترقيم */}
        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalCount={totalCount}
          unit="عملية إرجاع"
          hrefFor={buildPageUrl}
        />
      </div>
    </div>
  );
}
