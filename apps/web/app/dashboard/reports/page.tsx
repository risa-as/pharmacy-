import { prisma } from "@/app/lib/prisma";
import { BarChart3, Download, Calendar, TrendingUp, TrendingDown, FileSpreadsheet, FileText, User, AlertTriangle, DollarSign, Package, AlertOctagon } from "lucide-react";
import Link from "next/link";
import ExportReports from "@/app/ui/reports/export-reports";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

export default async function ReportsPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere } = tenantCtx;

    const [salesCount, purchasesCount, inventoryCount, userCount] = await Promise.all([
        prisma.sale.count({ where: tenantBranchWhere }),
        prisma.purchase.count({ where: tenantBranchWhere }),
        prisma.inventory.count({ where: tenantBranchWhere }),
        prisma.user.count({ where: tenantBranchWhere }),
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
            title: "أداء الموظفين",
            description: "تتبع المبيعات والنشاط ونسبة المساهمة لكل موظف",
            href: "/dashboard/reports/employees",
            icon: User,
            color: "cyan",
            count: userCount,
        },
        {
            title: "الأرباح والخسائر (P&L)",
            description: "قائمة الدخل التفصيلية مع مقارنة شهرية",
            href: "/dashboard/reports/profits",
            icon: DollarSign,
            color: "orange",
            count: null,
        },
        {
            title: "📊 أكثر الأدوية مبيعاً",
            description: "ترتيب الأصناف بحسب الكمية المباعة والإيرادات",
            href: "/dashboard/reports/top-sellers",
            icon: TrendingUp,
            color: "emerald",
            count: null,
        },
        {
            title: "⚠️ الأدوية الراكدة",
            description: "أصناف لم تُباع منذ فترة وقيمة المخزون المجمد",
            href: "/dashboard/reports/slow-movers",
            icon: AlertOctagon,
            color: "red",
            count: null,
        },
        {
            title: "📅 انتهاء الصلاحية",
            description: "الأدوية المنتهية والقريبة من الانتهاء حسب الخطورة",
            href: "/dashboard/reports/expiry",
            icon: AlertTriangle,
            color: "amber",
            count: null,
        },
        {
            title: "💰 هامش الربح لكل دواء",
            description: "تحليل هامش ربح كل صنف مع تصنيف لون حسب النسبة",
            href: "/dashboard/reports/margins",
            icon: TrendingDown,
            color: "teal",
            count: null,
        },
    ];

    const colorClasses: Record<string, { bg: string; icon: string; border: string }> = {
        blue: { bg: "bg-primary/10", icon: "text-primary", border: "border-primary hover:border-primary" },
        green: { bg: "bg-success/10", icon: "text-success", border: "border-green-200 hover:border-green-400" },
        purple: { bg: "bg-info/10", icon: "text-info", border: "border-info/20 hover:border-info/50" },
        orange: { bg: "bg-warning/10", icon: "text-warning", border: "border-orange-200 hover:border-orange-400" },
        cyan: { bg: "bg-cyan-50", icon: "text-cyan-600", border: "border-cyan-200 hover:border-cyan-400" },
        emerald: { bg: "bg-success/10", icon: "text-success", border: "border-emerald-200 hover:border-emerald-400" },
        red: { bg: "bg-destructive/10", icon: "text-destructive", border: "border-red-200 hover:border-red-400" },
        amber: { bg: "bg-warning/10", icon: "text-warning", border: "border-warning/30 hover:border-amber-400" },
        teal: { bg: "bg-teal-50", icon: "text-teal-600", border: "border-teal-200 hover:border-teal-400" },
    };

    return (
        <div className="glass-card w-full p-6" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <BarChart3 className="w-7 h-7 text-primary" />
                    التقارير والإحصائيات
                </h1>
                <ExportReports />
            </div>

            {/* التقارير المتاحة */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 mb-8">
                {reports.map((report) => {
                    const Icon = report.icon;
                    const colors = colorClasses[report.color] || colorClasses.blue;
                    return (
                        <Link
                            key={report.title}
                            href={report.href}
                            className={`rounded-2xl border-2 bg-card p-6 shadow-sm transition-all hover:shadow-md ${colors.border}`}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className={`p-3 rounded-xl ${colors.bg}`}>
                                    <Icon className={`w-6 h-6 ${colors.icon}`} />
                                </div>
                                {report.count !== null && (
                                    <span className="text-2xl font-bold text-foreground">
                                        {report.count}
                                    </span>
                                )}
                            </div>
                            <h3 className="text-lg font-bold text-foreground mb-1">{report.title}</h3>
                            <p className="text-sm text-muted-foreground">{report.description}</p>
                        </Link>
                    );
                })}
            </div>

            {/* خيارات التصدير */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-primary">
                <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                    <Download className="w-5 h-5 text-primary" />
                    تصدير البيانات
                </h2>
                <div className="grid gap-4 sm:grid-cols-3">
                    <button className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border hover:border-primary hover:shadow-md transition-all">
                        <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
                            <FileSpreadsheet className="w-5 h-5 text-success" />
                        </div>
                        <div className="text-right">
                            <div className="font-bold text-foreground">Excel</div>
                            <div className="text-xs text-muted-foreground">تصدير جدول البيانات</div>
                        </div>
                    </button>
                    <button className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border hover:border-red-300 hover:shadow-md transition-all">
                        <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
                            <FileText className="w-5 h-5 text-destructive" />
                        </div>
                        <div className="text-right">
                            <div className="font-bold text-foreground">PDF</div>
                            <div className="text-xs text-muted-foreground">تقرير قابل للطباعة</div>
                        </div>
                    </button>
                    <button className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border hover:border-purple-300 hover:shadow-md transition-all">
                        <div className="w-10 h-10 bg-info rounded-lg flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-info" />
                        </div>
                        <div className="text-right">
                            <div className="font-bold text-foreground">تقرير مخصص</div>
                            <div className="text-xs text-muted-foreground">اختر الفترة والبيانات</div>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}
