import { HandCoins } from "@/app/ui/debts/debt-icon";
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
  Users,
  ArrowDownCircle,
  History,
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

export default async function DebtsPage(
  props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  }
) {
  const searchParams = await props.searchParams;
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
            <HandCoins className="w-6 h-6 text-destructive" />
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
            <HandCoins className="w-6 h-6 text-destructive" />
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

      {/* جدول المدينين — بنفس تصميم جدول الدفعات */}
      <div className="glass-card overflow-hidden">
        {debtors.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <HandCoins className="w-8 h-8 text-muted-foreground opacity-50" />
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
        <div className="p-4 border-b border-border flex items-center gap-2">
          <History className="w-4 h-4 text-success" />
          <h2 className="font-bold text-foreground">سجل التسديدات الأخيرة</h2>
          <span className="mr-auto text-sm text-muted-foreground">
            آخر 20 عملية
          </span>
        </div>

        {recentPayments.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <History className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-foreground font-medium">لا توجد تسديدات مسجلة</p>
            <p className="text-sm text-muted-foreground mt-1">
              ستظهر هنا تسديدات العملاء لديونهم
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">العميل</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">المبلغ المسدد</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">طريقة الدفع</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">ملاحظة</th>
                  <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {recentPayments.map((payment: any) => {
                  const createdAt = new Date(payment.createdAt);
                  return (
                    <tr key={payment.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-3 py-3">
                        <div className="max-w-[220px]">
                          <Link
                            href={`/dashboard/debts/${payment.patientId}`}
                            className="block font-semibold text-foreground hover:text-primary transition-colors truncate"
                            title={payment.patientName}
                          >
                            {payment.patientName}
                          </Link>
                          <p className="text-[10px] text-muted-foreground truncate text-right" dir="ltr">
                            {payment.patientPhone || "—"}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-bold text-success whitespace-nowrap" dir="ltr">
                        {formatIQD(payment.amount)}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-bold bg-muted text-muted-foreground border-border">
                          {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        <span className="block max-w-[200px] truncate" title={payment.note || undefined}>
                          {payment.note || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
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
      </div>
    </div>
  );
}
