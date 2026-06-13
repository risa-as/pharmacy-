export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
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
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

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

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const branchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;

  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");
  const { tenantBranchWhere } = tenantCtx;

  // Use branchId if provided, else use the default tenantBranchWhere scopes on sale
  const saleWhere = branchId
    ? { branchId, ...tenantBranchWhere }
    : { ...tenantBranchWhere };

  const payments = await prisma.payment.findMany({
    where: { sale: saleWhere, method: { not: "CREDIT" } },
    orderBy: { createdAt: "desc" },
    include: {
      sale: {
        include: {
          branch: true,
          returns: true,
        },
      },
    },
  });

  // إحصائيات — صافي المبالغ بعد خصم المرتجعات
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getNetAmount = (p: any) => {
    const returnTotal = (p.sale.returns || []).reduce(
      (s: number, r: any) => s + r.total,
      0,
    );
    return p.amount - returnTotal;
  };

  const todayPayments = payments.filter(
    (p: any) => new Date(p.createdAt) >= today,
  );
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

  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");
  const statCards = [
    {
      label: "إجمالي العمليات",
      value: String(payments.length),
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
        <BranchFilter currentBranch={branchId} baseUrl="/dashboard/payments" />
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

      {/* الجدول */}
      <div className="glass-card overflow-hidden">
        {payments.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">لا توجد مدفوعات مسجلة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الفرع
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    طريقة الدفع
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المبلغ
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المرتجع
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الحالة
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    التاريخ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {payments.map((payment: any) => {
                  const Icon = methodIcons[payment.method] || CreditCard;
                  const returnTotal = (payment.sale.returns || []).reduce(
                    (s: number, r: any) => s + r.total,
                    0,
                  );
                  const isFullReturn = returnTotal >= payment.sale.total;
                  const isPartialReturn = returnTotal > 0 && !isFullReturn;
                  const netAmount = payment.amount - returnTotal;
                  const meta =
                    STATUS_META[payment.status] ?? STATUS_META.PENDING;
                  return (
                    <tr
                      key={payment.id}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-6 py-4 text-muted-foreground">
                        {payment.sale.branch.name}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-2 text-foreground">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          {methodLabels[payment.method] || payment.method}
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-right"
                        dir="ltr"
                      >
                        {returnTotal > 0 ? (
                          <div className="flex flex-col">
                            <span className="text-muted-foreground line-through text-xs">
                              {fmt(payment.amount)} د.ع
                            </span>
                            <span className="font-bold text-success">
                              {fmt(netAmount)} د.ع
                            </span>
                          </div>
                        ) : (
                          <span className="font-bold text-success">
                            {fmt(payment.amount)} د.ع
                          </span>
                        )}
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-right"
                        dir="ltr"
                      >
                        {returnTotal > 0 ? (
                          <span className="font-bold text-destructive">
                            −{fmt(returnTotal)} د.ع
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold ${meta.cls}`}
                          >
                            {meta.label}
                          </span>
                          {isFullReturn && (
                            <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold bg-destructive/10 text-destructive border-destructive/20">
                              <RotateCcw className="w-3 h-3" />
                              مرتجع كلي
                            </span>
                          )}
                          {isPartialReturn && (
                            <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold bg-warning/10 text-warning border-warning/20">
                              <RotateCcw className="w-3 h-3" />
                              مرتجع جزئي
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className="px-6 py-4 text-muted-foreground whitespace-nowrap text-right"
                        dir="ltr"
                        suppressHydrationWarning
                      >
                        {new Date(payment.createdAt).toLocaleDateString(
                          "ar-IQ",
                          { timeZone: "Asia/Baghdad" },
                        )}
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
