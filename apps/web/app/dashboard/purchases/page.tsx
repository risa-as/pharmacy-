export const dynamic = "force-dynamic";

import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import MoreActions from '@/app/ui/order-more-actions';
import { getPurchases } from "@/app/lib/actions/purchase-actions";
import Link from "next/link";
import {
  Truck,
  ShoppingCart,
  Receipt,
  Clock,
  Banknote,
  Eye,
} from "lucide-react";
import { auth } from "@/auth";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import DeletePurchaseButton from "./[id]/components/delete-button";
import TableSearch from "@/app/ui/table-search";
import TablePagination from "@/app/ui/table-pagination";
import { formatCurrency } from "@/app/lib/utils/currency";
import {
  TableCard, TableToolbar, ResultCount, DataTable, THead, Th, TBody, rowClass, cellClass,
  PrimaryCell, MutedText, StatusPill, Actions, actionClass, EmptyState, DateTimeCell, type PillTone,
} from "@/app/ui/data-table";

const STATUS_META: Record<string, { label: string; tone: PillTone }> = {
  PENDING: { label: "قيد الانتظار", tone: "warning" },
  COMPLETED: { label: "مكتمل", tone: "success" },
  RECEIVED: { label: "تم الاستلام", tone: "info" },
  CANCELLED: { label: "ملغى", tone: "destructive" },
};

export default async function PurchasesPage(
  props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  }
) {
  const ctx = await getTenantContext();
  if (ctx instanceof NextResponse || !ctx.userPermissions.canViewSuppliers) return <div>غير مصرح</div>;
  const searchParams = await props.searchParams;
  const session = await auth();
  const branchId = session?.user?.branchId;
  const isAdmin = session?.user?.role === "ADMIN";

  if (!branchId && !isAdmin) {
    return (
      <div className="p-8 text-center text-destructive">
        يرجى تسجيل الدخول لعرض المشتريات.
      </div>
    );
  }

  const filterBranchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;
  const search =
    typeof searchParams.search === "string"
      ? searchParams.search.trim().toLowerCase()
      : "";
  const purchases = await getPurchases(filterBranchId);

  // الإحصائيات (من كامل نتائج الفرع، قبل البحث)
  const active = purchases.filter((p: any) => p.status !== "CANCELLED");
  const totalSpent = active.reduce((s: number, p: any) => s + p.total, 0);
  const pendingCount = purchases.filter(
    (p: any) => p.status === "PENDING",
  ).length;
  const outstanding = active.reduce(
    (s: number, p: any) => s + (p.total - (p.paidAmount || 0)),
    0,
  );
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  // فلترة البحث (في الذاكرة)
  const list = search
    ? purchases.filter(
        (p: any) =>
          (p.supplier?.name || "").toLowerCase().includes(search) ||
          p.id.toLowerCase().includes(search),
      )
    : purchases;

  const statCards = [
    {
      label: "عدد الطلبات",
      value: String(purchases.length),
      icon: ShoppingCart,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "إجمالي المشتريات (د.ع)",
      value: fmt(totalSpent),
      icon: Receipt,
      tone: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "قيد الانتظار",
      value: String(pendingCount),
      icon: Clock,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "المستحق للموردين (د.ع)",
      value: fmt(outstanding),
      icon: Banknote,
      tone: "text-destructive",
      bg: "bg-destructive/10",
    },
  ];

  const branchExtraParams = search
    ? `search=${encodeURIComponent(search)}`
    : undefined;

  // Pagination over the (already loaded) list, like the other tables.
  const PAGE_SIZE = 50;
  const page =
    typeof searchParams.page === "string" ? Math.max(1, parseInt(searchParams.page) || 1) : 1;
  const totalPages = Math.ceil(list.length / PAGE_SIZE);
  const pageRows = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (filterBranchId) params.set("branch", filterBranchId);
    if (search) params.set("search", search);
    params.set("page", String(p));
    return `/dashboard/purchases?${params.toString()}`;
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* الرأس */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            سجل المشتريات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            طلبات الشراء من الموردين وحالاتها
          </p>
        </div>
        <Link
          href="/dashboard/purchases/smart-order"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
        >
          <Truck className="w-4 h-4" />
          طلب ذكي جديد
        </Link>
      </div>

      <BranchFilter
        currentBranch={filterBranchId}
        baseUrl="/dashboard/purchases"
        extraParams={branchExtraParams}
      />

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

      {/* الجدول — بنفس تصميم جدول الدفعات وسلوكه */}
      <TableCard>
        <TableToolbar>
          <TableSearch currentQuery={search} param="search" placeholder="بحث باسم المورد أو رقم الطلب..." />
          <ResultCount total={list.length} query={search} unit="طلب" />
        </TableToolbar>

        {list.length === 0 ? (
          <EmptyState
            icon={<Truck />}
            title={search ? "لا توجد نتائج للبحث" : "لا يوجد سجل مشتريات"}
            hint={search ? "جرّب كلمة بحث أخرى" : "ابدأ بإنشاء طلب ذكي جديد"}
          />
        ) : (
          <DataTable>
            <THead>
              <Th>المورد</Th>
              <Th>الفرع</Th>
              <Th>المواد</Th>
              <Th>الإجمالي</Th>
              <Th>التاريخ</Th>
              <Th>الحالة</Th>
              <Th center>الإجراءات</Th>
            </THead>
            <TBody>
              {pageRows.map((purchase: any) => {
                const meta = STATUS_META[purchase.status] ?? {
                  label: purchase.status,
                  tone: "muted" as const,
                };
                const due = purchase.status === "CANCELLED" ? 0 : Math.max(0, purchase.total - (purchase.paidAmount || 0));
                return (
                  <tr key={purchase.id} className={rowClass}>
                    <td className={cellClass}>
                      <PrimaryCell
                        title={purchase.supplier?.name || "غير معروف"}
                        subtitle={purchase.documentNumber}
                        subtitleLtr
                      />
                    </td>
                    <td className={`${cellClass} text-muted-foreground`}>
                      <MutedText>{purchase.branch?.name || "غير معروف"}</MutedText>
                    </td>
                    <td className={`${cellClass} text-muted-foreground whitespace-nowrap`}>
                      <span className="font-bold text-foreground">{purchase._count.items}</span> صنف
                    </td>
                    <td className={`${cellClass} whitespace-nowrap`}>
                      <div className="font-bold text-foreground" dir="ltr">{formatCurrency(purchase.total)}</div>
                      {due > 0 && (
                        <div className="text-[10px] text-muted-foreground" dir="ltr">مستحق {formatCurrency(due)}</div>
                      )}
                    </td>
                    <td className={cellClass}>
                      <DateTimeCell date={purchase.createdAt} />
                    </td>
                    <td className={cellClass}>
                      <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                    </td>
                    <td className={cellClass}>
                      <Actions>
                        <Link
                          href={`/dashboard/purchases/${purchase.id}`}
                          title="تفاصيل الفاتورة"
                          className={actionClass()}
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        {(purchase.status === "PENDING" ||
                          purchase.status === "CANCELLED") && ctx.userPermissions.canCreatePurchase && (
                          <MoreActions label="إجراءات فاتورة الشراء"><DeletePurchaseButton purchaseId={purchase.id} /></MoreActions>
                        )}
                      </Actions>
                    </td>
                  </tr>
                );
              })}
            </TBody>
          </DataTable>
        )}

        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalCount={list.length}
          unit="طلب"
          hrefFor={buildPageUrl}
        />
      </TableCard>
    </div>
  );
}
