export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { BarChart3, TrendingUp, TrendingDown, FileSpreadsheet, User, AlertTriangle, DollarSign, AlertOctagon, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';

type Tone = "primary" | "success" | "info" | "warning" | "destructive";

const TONES: Record<Tone, { bg: string; icon: string }> = {
    primary: { bg: "bg-primary/10", icon: "text-primary" },
    success: { bg: "bg-success/10", icon: "text-success" },
    info: { bg: "bg-info/10", icon: "text-info" },
    warning: { bg: "bg-warning/10", icon: "text-warning" },
    destructive: { bg: "bg-destructive/10", icon: "text-destructive" },
};

export default async function ReportsPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { tenantBranchWhere } = tenantCtx;

    const [salesCount, purchasesCount, inventoryCount, userCount] = await Promise.all([
        prisma.sale.count({ where: tenantBranchWhere }),
        prisma.purchase.count({ where: tenantBranchWhere }),
        prisma.inventory.count({ where: tenantBranchWhere }),
        prisma.user.count({ where: tenantBranchWhere }),
    ]);

    const reports: {
        title: string;
        description: string;
        href: string;
        icon: typeof TrendingUp;
        tone: Tone;
        count: number | null;
    }[] = [
        {
            title: "تقرير المبيعات",
            description: "تحليل المبيعات اليومية والأسبوعية والشهرية",
            href: "/dashboard/reports/sales",
            icon: TrendingUp,
            tone: "primary",
            count: salesCount,
        },
        {
            title: "تقرير المخزون",
            description: "حالة المخزون والكميات والتنبيهات",
            href: "/dashboard/reports/inventory",
            icon: BarChart3,
            tone: "success",
            count: inventoryCount,
        },
        {
            title: "تقرير المشتريات",
            description: "تحليل المشتريات من الموردين",
            href: "/dashboard/reports/purchases",
            icon: FileSpreadsheet,
            tone: "info",
            count: purchasesCount,
        },
        {
            title: "أداء الموظفين",
            description: "تتبع المبيعات والنشاط ونسبة المساهمة لكل موظف",
            href: "/dashboard/reports/employees",
            icon: User,
            tone: "primary",
            count: userCount,
        },
        {
            title: "الأرباح والخسائر (P&L)",
            description: "قائمة الدخل التفصيلية مع مقارنة شهرية",
            href: "/dashboard/reports/profits",
            icon: DollarSign,
            tone: "success",
            count: null,
        },
        {
            title: "أكثر الأدوية مبيعاً",
            description: "ترتيب الأصناف بحسب الكمية المباعة والإيرادات",
            href: "/dashboard/reports/top-sellers",
            icon: TrendingUp,
            tone: "success",
            count: null,
        },
        {
            title: "الأدوية الراكدة",
            description: "أصناف لم تُبَع منذ فترة وقيمة المخزون المجمّد",
            href: "/dashboard/reports/slow-movers",
            icon: AlertOctagon,
            tone: "destructive",
            count: null,
        },
        {
            title: "انتهاء الصلاحية",
            description: "الأدوية المنتهية والقريبة من الانتهاء حسب الخطورة",
            href: "/dashboard/reports/expiry",
            icon: AlertTriangle,
            tone: "warning",
            count: null,
        },
        {
            title: "هامش الربح لكل دواء",
            description: "تحليل هامش ربح كل صنف مع تصنيف لوني حسب النسبة",
            href: "/dashboard/reports/margins",
            icon: TrendingDown,
            tone: "info",
            count: null,
        },
    ];

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div>
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                    <BarChart3 className="w-6 h-6 text-primary" />
                    التقارير والإحصائيات
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    تحليلات شاملة للمبيعات والمخزون والأرباح وأداء الفريق
                </p>
            </div>

            {/* شبكة التقارير */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {reports.map((report) => {
                    const Icon = report.icon;
                    const tone = TONES[report.tone];
                    return (
                        <Link
                            key={report.title}
                            href={report.href}
                            className="glass-card p-5 flex flex-col group hover:border-primary/40 hover:shadow-md transition-all"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className={`w-11 h-11 rounded-xl ${tone.bg} flex items-center justify-center`}>
                                    <Icon className={`w-5 h-5 ${tone.icon}`} />
                                </div>
                                {report.count !== null && (
                                    <span className="text-2xl font-bold text-foreground">
                                        {report.count}
                                    </span>
                                )}
                            </div>
                            <h3 className="text-base font-bold text-foreground">{report.title}</h3>
                            <p className="text-sm text-muted-foreground mt-1 flex-1">{report.description}</p>
                            <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                عرض التقرير
                                <ArrowLeft className="w-3.5 h-3.5" />
                            </span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
