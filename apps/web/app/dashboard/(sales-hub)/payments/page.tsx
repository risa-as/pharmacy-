export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  CreditCard,
  DollarSign,
  Smartphone,
  Building2,
  RotateCcw,
  Banknote,
  Receipt,
} from "lucide-react";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import TableSearch from "@/app/ui/table-search";
import TablePagination from "@/app/ui/table-pagination";
import { formatCurrency } from "@/app/lib/utils/currency";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

const PAGE_SIZE = 100;
const pill = "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-bold";

const methodLabels: Record<string, string> = {
  CASH: "نقداً",
  CARD: "بطاقة",
  MOBILE_WALLET: "محفظة إلكترونية",
  BANK_TRANSFER: "تحويل بنكي",
  ZAIN_CASH: "زين كاش",
  STRIPE: "Stripe",
};

const methodIcons: Record<string, any> = {
  CASH: DollarSign,
  CARD: CreditCard,
  MOBILE_WALLET: Smartphone,
  BANK_TRANSFER: Building2,
  ZAIN_CASH: Smartphone,
  STRIPE: CreditCard,
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: {
    label: "معلقة",
    cls: "bg-warning/10 text-warning border-warning/20",
  },
  COMPLETED: {
    label: "مكتملة",
    cls: "bg-success/10 text-success border-success/20",
  },
  FAILED: {
    label: "فاشلة",
    cls: "bg-destructive/10 text-destructive border-destructive/20",
  },
  REFUNDED: { label: "مسترجعة", cls: "bg-info/10 text-info border-info/20" },
};

export default async function PaymentsPage(
  props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  }
) {
  const searchParams = await props.searchParams;
  const branchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;
  const search =
    typeof searchParams.search === "string" && searchParams.search.trim()
      ? searchParams.search.trim()
      : undefined;
  const page =
    typeof searchParams.page === "string" ? Math.max(1, parseInt(searchParams.page) || 1) : 1;

  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere } = tenantCtx;

  // Use branchId if provided, else use the default tenantBranchWhere scopes on sale
  const saleWhere = branchId
    ? { branchId, ...tenantBranchWhere }
    : { ...tenantBranchWhere };

  // البحث برقم الفاتورة (الرقم المطبوع أو المرجع)
  const searchWhere: Prisma.SaleWhereInput = search
    ? {
        OR: [
          { documentNumber: { contains: search, mode: "insensitive" } },
          ...(/^\d+$/.test(search) ? [{ invoiceNumber: Number(search) }] : []),
        ],
      }
    : {};
  const paymentWhere: Prisma.PaymentWhereInput = {
    sale: { ...saleWhere, ...searchWhere },
    method: { not: "CREDIT" },
  };

  // إحصائيات اليوم — صافي المبالغ بعد خصم المرتجعات، من مدفوعات اليوم وحدها
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [payments, totalCount, todayPayments] = await Promise.all([
    prisma.payment.findMany({
      where: paymentWhere,
      orderBy: { createdAt: "desc" },
      include: {
        sale: {
          include: {
            branch: true,
            returns: true,
          },
        },
      },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.payment.count({ where: paymentWhere }),
    prisma.payment.findMany({
      where: { ...paymentWhere, createdAt: { gte: today } },
      select: { amount: true, method: true, sale: { select: { returns: { select: { total: true } } } } },
    }),
  ]);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getNetAmount = (p: any) => {
    const returnTotal = (p.sale.returns || []).reduce(
      (s: number, r: any) => s + r.total,
      0,
    );
    return p.amount - returnTotal;
  };

  const totalToday = todayPayments.reduce(
    (acc: number, p: any) => acc + getNetAmount(p),
    0,
  );
  const cashToday = todayPayments
    .filter((p: any) => p.method === "CASH")
    .reduce((acc: number, p: any) => acc + getNetAmount(p), 0);
  const cardToday = todayPayments
    .filter((p: any) => p.method === "CARD")
    .reduce((acc: number, p: any) => acc + getNetAmount(p), 0);
  const zainCashToday = todayPayments
    .filter((p: any) => p.method === "ZAIN_CASH")
    .reduce((acc: number, p: any) => acc + getNetAmount(p), 0);

  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (branchId) params.set("branch", branchId);
    if (search) params.set("search", search);
    params.set("page", String(p));
    return `/dashboard/payments?${params.toString()}`;
  };
  const branchExtraParams = search ? new URLSearchParams({ search }).toString() : undefined;

  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");
  const statCards = [
    {
      label: "إجمالي العمليات",
      value: totalCount.toLocaleString("en-US"),
      icon: Receipt,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "مجموع اليوم (د.ع)",
      value: fmt(totalToday),
      icon: DollarSign,
      tone: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "نقداً اليوم (د.ع)",
      value: fmt(cashToday),
      icon: Banknote,
      tone: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "بطاقات اليوم (د.ع)",
      value: fmt(cardToday),
      icon: CreditCard,
      tone: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "زين كاش اليوم (د.ع)",
      value: fmt(zainCashToday),
      icon: Smartphone,
      tone: "text-success",
      bg: "bg-success/10",
    },
  ];

  return (
    <div className="space-y-6" dir="rtl" suppressHydrationWarning>
      {/* الرأس */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-primary" />
            سجل المدفوعات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            المدفوعات غير الآجلة موزّعة حسب الطريقة (صافي بعد المرتجعات)
          </p>
        </div>
        <BranchFilter currentBranch={branchId} baseUrl="/dashboard/payments" extraParams={branchExtraParams} />
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="glass-card p-5 flex items-center gap-3"
            >
              <div
                className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}
              >
                <Icon className={`w-5 h-5 ${card.tone}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">
                  {card.label}
                </p>
                <p className={`text-xl font-bold ${card.tone}`} dir="ltr">
                  {card.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* الجدول — بنفس تصميم جدول الدفعات وسلوكه */}
      <div className="glass-card overflow-hidden">
        {/* البحث */}
        <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
          <TableSearch currentQuery={search ?? ""} param="search" placeholder="بحث برقم الفاتورة..." />
          <span className="text-sm text-muted-foreground">
            {search ? (
              <>
                {totalCount.toLocaleString("en-US")} نتيجة لـ &quot;<span className="font-bold text-foreground">{search}</span>&quot;
              </>
            ) : (
              <>{totalCount.toLocaleString("en-US")} عملية</>
            )}
          </span>
        </div>

        {payments.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">
              {search ? "لا توجد نتائج للبحث" : "لا توجد مدفوعات مسجلة"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? "جرّب رقماً آخر" : "ستظهر هنا مدفوعات فواتير البيع غير الآجلة"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الفاتورة</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الفرع</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">طريقة الدفع</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">المبلغ</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">المرتجع</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الحالة</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {payments.map((payment: any) => {
                  const Icon = methodIcons[payment.method] || CreditCard;
                  const returnTotal = (payment.sale.returns || []).reduce(
                    (s: number, r: any) => s + r.total,
                    0,
                  );
                  const isFullReturn = returnTotal > 0 && returnTotal >= payment.sale.total;
                  const isPartialReturn = returnTotal > 0 && !isFullReturn;
                  const netAmount = payment.amount - returnTotal;
                  const meta =
                    STATUS_META[payment.status] ?? STATUS_META.PENDING;
                  const createdAt = new Date(payment.createdAt);
                  return (
                    <tr key={payment.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-3 py-3 font-mono font-bold text-primary whitespace-nowrap" dir="ltr">
                        {payment.sale.invoiceNumber != null
                          ? `#${String(payment.sale.invoiceNumber).padStart(4, "0")}`
                          : payment.sale.documentNumber}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        <span className="block max-w-[160px] truncate" title={payment.sale.branch.name}>
                          {payment.sale.branch.name}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-foreground">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          {methodLabels[payment.method] || payment.method}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="font-bold text-success" dir="ltr">{formatCurrency(netAmount)}</div>
                        {returnTotal > 0 && (
                          <div className="text-[10px] text-muted-foreground line-through" dir="ltr">
                            {formatCurrency(payment.amount)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap" dir="ltr">
                        {returnTotal > 0 ? (
                          <span className="font-bold text-destructive">−{fmt(returnTotal)} د.ع</span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className={`${pill} ${meta.cls}`}>{meta.label}</span>
                          {isFullReturn && (
                            <span className={`${pill} bg-destructive/10 text-destructive border-destructive/20`}>
                              <RotateCcw className="w-3 h-3" />
                              مرتجع كلي
                            </span>
                          )}
                          {isPartialReturn && (
                            <span className={`${pill} bg-warning/10 text-warning border-warning/20`}>
                              <RotateCcw className="w-3 h-3" />
                              مرتجع جزئي
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3" suppressHydrationWarning>
                        <div className="text-xs text-muted-foreground leading-tight whitespace-nowrap" dir="ltr">
                          <div>{createdAt.toLocaleDateString("ar-IQ", { timeZone: "Asia/Baghdad" })}</div>
                          <div className="text-[10px] text-muted-foreground/60">
                            {createdAt.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" })}
                          </div>
                        </div>
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
          unit="عملية"
          hrefFor={buildPageUrl}
        />
      </div>
    </div>
  );
}
