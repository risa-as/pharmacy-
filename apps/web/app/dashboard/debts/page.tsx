import { getAllDebtors, getDebtStats, getRecentDebtPayments } from "@/app/lib/actions/debt";
import { BookOpen, Users, Banknote, ArrowDownCircle, History, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import DebtorsTable from "@/app/ui/debts/debtors-table";

function formatIQD(amount: number) {
    return new Intl.NumberFormat("en-US").format(Math.round(amount)) + " د.ع";
}

export default async function DebtsPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;

    const [stats, debtors, recentPayments] = await Promise.all([
        getDebtStats(branchId),
        getAllDebtors(branchId),
        getRecentDebtPayments(branchId, 20),
    ]);

    return (
        <div className="glass-card w-full p-6" dir="rtl">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <BookOpen className="w-7 h-7 text-destructive" />
                    دفتر الديون
                </h1>
            </div>

            {/* Branch Filter */}
            <div className="mb-6">
                <BranchFilter currentBranch={branchId} baseUrl="/dashboard/debts" />
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-destructive/10 dark:to-destructive/5 border border-red-200 dark:border-destructive/30 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-destructive/10 rounded-xl">
                            <Banknote className="w-5 h-5 text-destructive" />
                        </div>
                        <span className="text-sm text-destructive font-medium">إجمالي الديون</span>
                    </div>
                    <p className="text-2xl font-bold text-destructive">{formatIQD(stats.totalDebt)}</p>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-warning/10 dark:to-warning/5 border border-orange-200 dark:border-warning/30 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-warning/10 rounded-xl">
                            <Users className="w-5 h-5 text-warning" />
                        </div>
                        <span className="text-sm text-warning font-medium">عدد المدينين</span>
                    </div>
                    <p className="text-2xl font-bold text-warning">{stats.debtorCount}</p>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-success/10 dark:to-success/5 border border-green-200 dark:border-success/30 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-success/10 rounded-xl">
                            <ArrowDownCircle className="w-5 h-5 text-success" />
                        </div>
                        <span className="text-sm text-success font-medium">تسديدات اليوم</span>
                    </div>
                    <p className="text-2xl font-bold text-success">{formatIQD(stats.todayPaymentsAmount)}</p>
                    <p className="text-xs text-success mt-1">{stats.todayPaymentsCount} عملية</p>
                </div>
            </div>

            {/* Debtors Table */}
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
                <div className="p-4 border-b border-border bg-muted/50">
                    <h2 className="font-bold text-foreground">قائمة المدينين</h2>
                </div>

                {debtors.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p className="text-lg font-medium">لا يوجد ديون حالياً</p>
                        <p className="text-sm mt-1">سيظهر هنا أي بيع بالآجل</p>
                    </div>
                ) : (
                    <DebtorsTable debtors={debtors} />
                )}
            </div>
            {/* Recent Payments History */}
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden mt-6">
                <div className="p-4 border-b border-border bg-muted/50 flex items-center gap-2">
                    <History className="w-4 h-4 text-success" />
                    <h2 className="font-bold text-foreground">سجل التسديدات الأخيرة</h2>
                    <span className="text-xs text-muted-foreground mr-auto">آخر 20 عملية</span>
                </div>

                {recentPayments.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">لا توجد تسديدات مسجلة حتى الآن</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/80 text-muted-foreground text-xs">
                                <tr>
                                    <th className="p-3 text-right font-medium">العميل</th>
                                    <th className="p-3 text-right font-medium">الهاتف</th>
                                    <th className="p-3 text-right font-medium">المبلغ المسدد</th>
                                    <th className="p-3 text-right font-medium">طريقة الدفع</th>
                                    <th className="p-3 text-right font-medium">ملاحظة</th>
                                    <th className="p-3 text-right font-medium">التاريخ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {recentPayments.map((payment: any) => (
                                    <tr key={payment.id} className="hover:bg-accent transition-colors">
                                        <td className="p-3">
                                            <Link
                                                href={`/dashboard/debts/${payment.patientId}`}
                                                className="font-medium text-primary hover:underline"
                                            >
                                                {payment.patientName}
                                            </Link>
                                        </td>
                                        <td className="p-3 text-muted-foreground" dir="ltr">{payment.patientPhone}</td>
                                        <td className="p-3">
                                            <span className="inline-flex items-center gap-1 text-success font-bold">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                {formatIQD(payment.amount)}
                                            </span>
                                        </td>
                                        <td className="p-3 text-muted-foreground">
                                            {payment.method === "CASH" ? "نقدي" :
                                             payment.method === "CARD" ? "بطاقة" :
                                             payment.method === "MOBILE_WALLET" ? "محفظة" :
                                             payment.method === "BANK_TRANSFER" ? "تحويل بنكي" :
                                             payment.method === "ZAIN_CASH" ? "زين كاش" : payment.method}
                                        </td>
                                        <td className="p-3 text-muted-foreground">{payment.note || "—"}</td>
                                        <td className="p-3 text-muted-foreground">
                                            {new Date(payment.createdAt).toLocaleDateString("ar-IQ", { timeZone: "Asia/Baghdad" })}
                                            <span className="text-xs block">
                                                {new Date(payment.createdAt).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" })}
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
