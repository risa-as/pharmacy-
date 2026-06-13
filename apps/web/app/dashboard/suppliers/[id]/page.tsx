export const dynamic = "force-dynamic";

import {
  getSupplierSummary,
  getSupplierLedger,
} from "@/app/lib/actions/supplier-ledger-actions";
import { prisma } from "@/app/lib/prisma";
import Link from "next/link";
import {
  ArrowLeft,
  DollarSign,
  TrendingDown,
  TrendingUp,
  FileText,
  CreditCard,
  ShoppingCart,
} from "lucide-react";
import { PaymentFormWrapper } from "@/app/ui/suppliers/payment-form";
import { OpeningBalanceButton } from "@/app/ui/suppliers/opening-balance-form";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";

export default async function SupplierLedgerPage({
  params,
}: {
  params: { id: string };
}) {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) return redirect("/login");
  const { tenantWhere } = tenantCtx;

  const summary = await getSupplierSummary(params.id);
  if (!summary) notFound();

  const ledger = await getSupplierLedger(params.id);

  let branchWhere = {};
  if (tenantWhere.organizationId) {
    branchWhere = { organizationId: tenantWhere.organizationId };
  } else if (tenantWhere.branchId) {
    branchWhere = { id: tenantWhere.branchId };
  }

  const branches = await prisma.branch.findMany({
    where: branchWhere,
    select: { id: true, name: true },
  });

  const { supplier, totalPurchased, totalPayments, balance } = summary;

  return (
    <div className="w-full" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/suppliers"
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-cairo text-foreground">
              كشف حساب: {supplier.name}
            </h1>
            {supplier.phone && (
              <p className="text-sm text-muted-foreground mt-1" dir="ltr">
                {supplier.phone}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <OpeningBalanceButton
            supplierId={params.id}
            supplierName={supplier.name}
            branches={branches}
          />
          <Link
            href={`/dashboard/suppliers/${params.id}/purchases`}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition-all hover:bg-muted shadow-sm"
          >
            <ShoppingCart className="h-4 w-4 text-primary" />
            فواتير الشراء
          </Link>
          <PaymentFormWrapper
            supplierId={params.id}
            supplierName={supplier.name}
            branches={branches}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-destructive" />
            </div>
            <span className="text-sm font-cairo text-muted-foreground">
              إجمالي المشتريات
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {totalPurchased.toLocaleString("en-US")}{" "}
            <span className="text-sm text-muted-foreground">د.ع</span>
          </p>
        </div>

        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-success" />
            </div>
            <span className="text-sm font-cairo text-muted-foreground">
              إجمالي المدفوع
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {totalPayments.toLocaleString("en-US")}{" "}
            <span className="text-sm text-muted-foreground">د.ع</span>
          </p>
        </div>

        <div
          className={`rounded-xl border p-5 shadow-sm ${balance > 0 ? "bg-warning/10 border-warning/30" : "bg-success/10 border-green-200"}`}
        >
          <div className="flex items-center gap-3 mb-2">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${balance > 0 ? "bg-warning/20" : "bg-success/10"}`}
            >
              <DollarSign
                className={`w-5 h-5 ${balance > 0 ? "text-warning" : "text-success"}`}
              />
            </div>
            <span className="text-sm font-cairo text-muted-foreground">
              الرصيد المتبقي
            </span>
          </div>
          <p
            className={`text-2xl font-bold ${balance > 0 ? "text-warning" : "text-success"}`}
          >
            {balance.toLocaleString("en-US")}{" "}
            <span className="text-sm text-muted-foreground">د.ع</span>
          </p>
          {balance > 0 && (
            <p className="text-xs text-warning mt-1">مبلغ مستحق للمورد</p>
          )}
          {balance <= 0 && (
            <p className="text-xs text-success mt-1">لا توجد مبالغ مستحقة</p>
          )}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted">
          <h2 className="text-lg font-bold font-cairo text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            سجل الحركات
          </h2>
        </div>
        <table className="min-w-full text-foreground">
          <thead className="bg-muted text-right text-sm font-semibold text-muted-foreground border-b border-border">
            <tr>
              <th className="px-6 py-3 font-cairo">التاريخ</th>
              <th className="px-6 py-3 font-cairo">النوع</th>
              <th className="px-6 py-3 font-cairo">الوصف</th>
              <th className="px-6 py-3 font-cairo">الفرع</th>
              <th className="px-6 py-3 font-cairo">دائن (مشتريات)</th>
              <th className="px-6 py-3 font-cairo">مدين (دفعات)</th>
              <th className="px-6 py-3 font-cairo">الرصيد</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ledger.map((entry: any) => (
              <tr key={entry.id} className="hover:bg-muted transition-colors">
                <td className="px-6 py-3 text-sm text-muted-foreground whitespace-nowrap">
                  {new Date(entry.date).toLocaleDateString("ar-IQ", {
                    timeZone: "Asia/Baghdad",
                  })}
                </td>
                <td className="px-6 py-3 whitespace-nowrap">
                  {entry.type === "purchase" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-destructive/10 text-destructive">
                      <TrendingUp className="w-3 h-3" /> شراء
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-success/10 text-success">
                      <CreditCard className="w-3 h-3" /> دفعة
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 text-sm text-foreground">
                  {entry.description}
                </td>
                <td className="px-6 py-3 text-sm text-muted-foreground">
                  {entry.branch}
                </td>
                <td className="px-6 py-3 text-sm font-bold text-destructive whitespace-nowrap text-center">
                  {entry.type === "purchase"
                    ? entry.amount.toLocaleString("en-US")
                    : "—"}
                </td>
                <td className="px-6 py-3 text-sm font-bold text-success whitespace-nowrap text-center">
                  {entry.type === "payment"
                    ? entry.amount.toLocaleString("en-US")
                    : "—"}
                </td>
                <td
                  className="px-6 py-3 text-sm font-bold text-foreground whitespace-nowrap text-center"
                  dir="ltr"
                >
                  {(entry.runningBalance ?? 0).toLocaleString("en-US")}
                </td>
              </tr>
            ))}
            {ledger.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-12 text-center text-muted-foreground"
                >
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  لا توجد حركات مسجلة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
