import { Package, AlertTriangle, Clock, Bell, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getAllAlerts, getAlertStats } from "@/app/lib/alerts";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import AlertsList from "@/app/ui/alerts/alerts-list";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect("/login");
    const { organizationId, tenantBranchWhere } = tenantCtx;
    const branchId = (tenantBranchWhere as any)?.branchId;

    const [alerts, stats] = await Promise.all([
        getAllAlerts(branchId, organizationId),
        getAlertStats(branchId, organizationId),
    ]);

    const statCards = [
        {
            label: "إجمالي التنبيهات",
            value: stats.total,
            icon: Bell,
            tone: "text-primary",
            bg: "bg-primary/10",
        },
        {
            label: "نقص المخزون",
            value: stats.lowStock,
            icon: Package,
            tone: "text-warning",
            bg: "bg-warning/10",
        },
        {
            label: "قارب على الانتهاء",
            value: stats.expiring,
            icon: Clock,
            tone: "text-warning",
            bg: "bg-warning/10",
        },
        {
            label: "منتهية الصلاحية",
            value: stats.expired,
            icon: AlertTriangle,
            tone: "text-destructive",
            bg: "bg-destructive/10",
        },
    ];

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <Bell className="w-6 h-6 text-primary" />
                        الإشعارات والتنبيهات
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        متابعة نقص المخزون وانتهاء صلاحية الأدوية
                    </p>
                </div>
            </div>

            {/* بطاقات الإحصائيات */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div key={card.label} className="glass-card p-5 flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                                <Icon className={`w-6 h-6 ${card.tone}`} />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">{card.label}</p>
                                <p className={`text-2xl font-bold ${card.value > 0 ? card.tone : "text-foreground"}`}>
                                    {card.value}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* روابط الإجراءات السريعة */}
            <div className="flex flex-wrap gap-3">
                <Link
                    href="/dashboard/inventory/shortages"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                    <Package className="w-4 h-4 text-warning" />
                    إدارة النواقص
                    <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />
                </Link>
                <Link
                    href="/dashboard/reports/expiry"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                    <Clock className="w-4 h-4 text-warning" />
                    تقرير الصلاحية
                    <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />
                </Link>
                <Link
                    href="/dashboard/inventory/expired-damaged"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    المنتهية والتالفة
                    <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />
                </Link>
            </div>

            {/* القائمة التفاعلية */}
            <AlertsList alerts={alerts} />
        </div>
    );
}
