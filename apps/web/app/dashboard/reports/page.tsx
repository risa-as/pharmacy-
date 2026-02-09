import { PrismaClient } from "@prisma/client";
import { BarChart3, Download, Calendar, TrendingUp, FileSpreadsheet, FileText } from "lucide-react";
import Link from "next/link";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function ReportsPage() {
    // Get some basic stats
    const [salesCount, purchasesCount, inventoryCount] = await Promise.all([
        prisma.sale.count(),
        prisma.purchase.count(),
        prisma.inventory.count(),
    ]);

    const reports = [
        {
            title: "تقرير المبيعات",
            description: "تحليل المبيعات اليومية والأسبوعية والشهرية",
            href: "/dashboard/reports/sales",
            icon: TrendingUp,
            color: "blue",
            count: salesCount,
        },
        {
            title: "تقرير المخزون",
            description: "حالة المخزون والكميات والتنبيهات",
            href: "/dashboard/reports/inventory",
            icon: BarChart3,
            color: "green",
            count: inventoryCount,
        },
        {
            title: "تقرير المشتريات",
            description: "تحليل المشتريات من الموردين",
            href: "/dashboard/reports/purchases",
            icon: FileSpreadsheet,
            color: "purple",
            count: purchasesCount,
        },
        {
            title: "تقرير الأرباح",
            description: "تحليل الإيرادات والمصروفات والأرباح",
            href: "/dashboard/reports/profits",
            icon: TrendingUp,
            color: "orange",
            count: null,
        },
    ];

    const colorClasses: Record<string, { bg: string; icon: string; border: string }> = {
        blue: { bg: "bg-blue-50", icon: "text-blue-600", border: "border-blue-200 hover:border-blue-400" },
        green: { bg: "bg-green-50", icon: "text-green-600", border: "border-green-200 hover:border-green-400" },
        purple: { bg: "bg-purple-50", icon: "text-purple-600", border: "border-purple-200 hover:border-purple-400" },
        orange: { bg: "bg-orange-50", icon: "text-orange-600", border: "border-orange-200 hover:border-orange-400" },
    };

    return (
        <div className="w-full" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800 flex items-center gap-3">
                    <BarChart3 className="w-7 h-7 text-blue-600" />
                    التقارير والإحصائيات
                </h1>
            </div>

            {/* التقارير المتاحة */}
            <div className="grid gap-6 sm:grid-cols-2 mb-8">
                {reports.map((report) => {
                    const Icon = report.icon;
                    const colors = colorClasses[report.color];
                    return (
                        <Link
                            key={report.title}
                            href={report.href}
                            className={`rounded-2xl border-2 bg-white p-6 shadow-sm transition-all hover:shadow-md ${colors.border}`}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className={`p-3 rounded-xl ${colors.bg}`}>
                                    <Icon className={`w-6 h-6 ${colors.icon}`} />
                                </div>
                                {report.count !== null && (
                                    <span className="text-2xl font-bold text-gray-800">
                                        {report.count}
                                    </span>
                                )}
                            </div>
                            <h3 className="text-lg font-bold text-gray-800 mb-1">{report.title}</h3>
                            <p className="text-sm text-gray-500">{report.description}</p>
                        </Link>
                    );
                })}
            </div>

            {/* خيارات التصدير */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Download className="w-5 h-5 text-blue-600" />
                    تصدير البيانات
                </h2>
                <div className="grid gap-4 sm:grid-cols-3">
                    <button className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <FileSpreadsheet className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="text-right">
                            <div className="font-bold text-gray-800">Excel</div>
                            <div className="text-xs text-gray-500">تصدير جدول البيانات</div>
                        </div>
                    </button>
                    <button className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-red-300 hover:shadow-md transition-all">
                        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-5 h-5 text-red-600" />
                        </div>
                        <div className="text-right">
                            <div className="font-bold text-gray-800">PDF</div>
                            <div className="text-xs text-gray-500">تقرير قابل للطباعة</div>
                        </div>
                    </button>
                    <button className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-purple-600" />
                        </div>
                        <div className="text-right">
                            <div className="font-bold text-gray-800">تقرير مخصص</div>
                            <div className="text-xs text-gray-500">اختر الفترة والبيانات</div>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}
