import {
  getAllDebtors,
  getDebtStats,
  getRecentDebtPayments,
} from "@/app/lib/actions/debt";
import { getSafes, getSafesForOrg } from "@/app/lib/actions/finance-actions";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import {
  BookOpen,
  Users,
  Banknote,
  ArrowDownCircle,
  History,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import DebtorsTable from "@/app/ui/debts/debtors-table";

function formatIQD(amount: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(amount)) + " د.ع";
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "نقدي",
  CARD: "بطاقة",
  BANK_TRANSFER: "تحويل بنكي",
  ZAIN_CASH: "زين كاش",
};

export default async function DebtsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const branchId =
    typeof searchParams.branch === "string" ? searchParams.branch : undefined;

  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) redirect("/login");

  const safesPromise = tenantCtx.user.branchId
    ? getSafes(tenantCtx.user.branchId)
    : tenantCtx.organizationId
      ? getSafesForOrg(tenantCtx.organizationId)
      : Promise.resolve([]);

  const [stats, debtors, recentPayments, safes] = await Promise.all([
    getDebtStats(branchId),
    getAllDebtors(branchId),
    getRecentDebtPayments(branchId, 20),
    safesPromise,
  ]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* الرأس */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-destructive" />
            دفتر الديون
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            متابعة المبيعات الآجلة وتسديدات العملاء
          </p>
        </div>
        <BranchFilter currentBranch={branchId} baseUrl="/dashboard/debts" />
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
            <Banknote className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">إجمالي الديون</p>
            <p className="text-xl font-bold text-destructive" dir="ltr">
              {formatIQD(stats.totalDebt)}
            </p>
          </div>
        </div>

        <div className="glass-card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 text-warning" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">عدد المدينين</p>
            <p className="text-2xl font-bold text-warning">
              {stats.debtorCount}
            </p>
          </div>
        </div>

        <div className="glass-card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
            <ArrowDownCircle className="w-6 h-6 text-success" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">تسديدات اليوم</p>
            <p className="text-xl font-bold text-success" dir="ltr">
              {formatIQD(stats.todayPaymentsAmount)}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.todayPaymentsCount} عملية
            </p>
          </div>
        </div>
      </div>

      {/* جدول المدينين */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-bold text-foreground">قائمة المدينين</h2>
          {debtors.length > 0 && (
            <span className="mr-auto text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-full px-2.5 py-0.5 font-medium">
              {debtors.length} مدين
            </span>
          )}
        </div>

        {debtors.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-muted-foreground opacity-40" />
            </div>
            <p className="text-foreground font-medium">لا يوجد ديون حالياً</p>
            <p className="text-sm text-muted-foreground mt-1">
              سيظهر هنا أي بيع بالآجل
            </p>
          </div>
        ) : (
          <DebtorsTable debtors={debtors} safes={safes} />
        )}
      </div>

      {/* سجل التسديدات الأخيرة */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <History className="w-4 h-4 text-success" />
          <h2 className="font-bold text-foreground">سجل التسديدات الأخيرة</h2>
          <span className="mr-auto text-xs text-muted-foreground">
            آخر 20 عملية
          </span>
        </div>

        {recentPayments.length === 0 ? (
          <div className="py-12 text-center">
            <History className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">
              لا توجد تسديدات مسجلة حتى الآن
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    العميل
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    الهاتف
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    المبلغ المسدد
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    طريقة الدفع
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    ملاحظة
                  </th>
                  <th className="px-6 py-3.5 text-right font-medium font-cairo">
                    التاريخ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {recentPayments.map((payment: any) => (
                  <tr
                    key={payment.id}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/debts/${payment.patientId}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {payment.patientName}
                      </Link>
                    </td>
                    <td
                      className="px-6 py-4 text-muted-foreground text-right"
                      dir="ltr"
                    >
                      {payment.patientPhone || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="inline-flex items-center gap-1.5 bg-success/10 text-success border border-success/20 rounded-lg px-3 py-1">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-bold text-sm" dir="ltr">
                          {formatIQD(payment.amount)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-sm">
                      {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-sm">
                      {payment.note || "—"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-sm">
                      <span>
                        {new Date(payment.createdAt).toLocaleDateString(
                          "ar-IQ",
                          { timeZone: "Asia/Baghdad" },
                        )}
                      </span>
                      <span className="text-xs block text-muted-foreground/70">
                        {new Date(payment.createdAt).toLocaleTimeString(
                          "ar-IQ",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Baghdad",
                          },
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
