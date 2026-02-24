import { getAllDebtors, getDebtStats } from "@/app/lib/actions/debt";
import { BookOpen, Users, Banknote, ArrowDownCircle } from "lucide-react";
import Link from "next/link";
import { BranchFilter } from "@/app/ui/reports/branch-filter";

function formatIQD(amount: number) {
    return new Intl.NumberFormat("ar-IQ").format(Math.round(amount)) + " د.ع";
}

export default async function DebtsPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;

    const [stats, debtors] = await Promise.all([
        getDebtStats(branchId),
        getAllDebtors(branchId),
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
                <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-destructive/10 rounded-xl">
                            <Banknote className="w-5 h-5 text-destructive" />
                        </div>
                        <span className="text-sm text-destructive font-medium">إجمالي الديون</span>
                    </div>
                    <p className="text-2xl font-bold text-destructive">{formatIQD(stats.totalDebt)}</p>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-warning/10 rounded-xl">
                            <Users className="w-5 h-5 text-warning" />
                        </div>
                        <span className="text-sm text-warning font-medium">عدد المدينين</span>
                    </div>
                    <p className="text-2xl font-bold text-warning">{stats.debtorCount}</p>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-2xl p-5">
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
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/80 text-muted-foreground text-xs">
                                <tr>
                                    <th className="p-3 text-right font-medium">الاسم</th>
                                    <th className="p-3 text-right font-medium">الهاتف</th>
                                    <th className="p-3 text-right font-medium">المبلغ المستحق</th>
                                    <th className="p-3 text-right font-medium">فواتير غير مسددة</th>
                                    <th className="p-3 text-right font-medium">آخر عملية</th>
                                    <th className="p-3 text-center font-medium">إجراء</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {debtors.map((debtor) => (
                                    <tr key={debtor.id} className="hover:bg-primary/10/30 transition-colors">
                                        <td className="p-3 font-medium text-foreground">{debtor.name}</td>
                                        <td className="p-3 text-muted-foreground" dir="ltr">{debtor.phone}</td>
                                        <td className="p-3">
                                            <span className="text-destructive font-bold">{formatIQD(debtor.balance)}</span>
                                        </td>
                                        <td className="p-3 text-muted-foreground">{debtor.unpaidSalesCount}</td>
                                        <td className="p-3 text-muted-foreground">
                                            {debtor.lastSaleDate
                                                ? new Date(debtor.lastSaleDate).toLocaleDateString("ar-IQ")
                                                : "—"}
                                        </td>
                                        <td className="p-3 text-center">
                                            <Link
                                                href={`/dashboard/debts/${debtor.id}`}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/10 transition-colors"
                                            >
                                                كشف حساب
                                            </Link>
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
