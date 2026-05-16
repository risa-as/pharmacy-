import { AlertTriangle, Package, Clock, Bell } from "lucide-react";
import { getAllAlerts, getAlertStats, AlertItem } from "@/app/lib/alerts";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";

export default async function AlertsPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { organizationId, tenantBranchWhere } = tenantCtx;
    const branchId = (tenantBranchWhere as any)?.branchId;

    const alerts = await getAllAlerts(branchId, organizationId);
    const stats = await getAlertStats(branchId, organizationId);

    const getAlertIcon = (type: AlertItem['type']) => {
        switch (type) {
            case 'low_stock': return <Package className="w-5 h-5" />;
            case 'expired': return <AlertTriangle className="w-5 h-5" />;
            case 'expiring': return <Clock className="w-5 h-5" />;
        }
    };

    const getAlertColor = (alert: AlertItem) => {
        if (alert.severity === 'danger') {
            return 'bg-destructive/10 border-red-200 text-destructive';
        }
        return 'bg-warning/10 border-warning/30 text-warning';
    };

    const getAlertMessage = (alert: AlertItem) => {
        switch (alert.type) {
            case 'low_stock':
                return `الكمية: ${alert.quantity} (الحد الأدنى: ${alert.minStock})`;
            case 'expired':
                return `منتهي الصلاحية منذ ${Math.abs(alert.daysLeft || 0)} يوم`;
            case 'expiring':
                return `ينتهي خلال ${alert.daysLeft} يوم`;
        }
    };

    const getAlertTitle = (type: AlertItem['type']) => {
        switch (type) {
            case 'low_stock': return 'نقص في المخزون';
            case 'expired': return 'منتهي الصلاحية';
            case 'expiring': return 'قارب على الانتهاء';
        }
    };

    return (
        <div className="glass-card w-full p-6">
            {/* Header */}
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <Bell className="w-7 h-7 text-primary" />
                    الإشعارات والتنبيهات
                </h1>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="text-3xl font-bold text-foreground">{stats.total}</div>
                    <div className="text-sm text-muted-foreground">إجمالي التنبيهات</div>
                </div>
                <div className="bg-destructive/10 rounded-xl border border-red-200 p-4">
                    <div className="text-3xl font-bold text-destructive">{stats.danger}</div>
                    <div className="text-sm text-destructive">تنبيهات حرجة</div>
                </div>
                <div className="bg-warning/10 rounded-xl border border-warning/30 p-4">
                    <div className="text-3xl font-bold text-warning">{stats.warning}</div>
                    <div className="text-sm text-warning">تحذيرات</div>
                </div>
                <div className="bg-warning/10 rounded-xl border border-orange-200 p-4">
                    <div className="text-3xl font-bold text-warning">{stats.expired}</div>
                    <div className="text-sm text-warning">منتهي الصلاحية</div>
                </div>
            </div>

            {/* Alerts List */}
            {alerts.length === 0 ? (
                <div className="bg-success/10 border border-green-200 rounded-xl p-8 text-center">
                    <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Bell className="w-8 h-8 text-success" />
                    </div>
                    <h3 className="text-lg font-bold text-success mb-2">لا توجد تنبيهات</h3>
                    <p className="text-sm text-success">جميع الأدوية بحالة جيدة ولا توجد مشاكل في المخزون</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {alerts.map((alert: any) => (
                        <div
                            key={alert.id}
                            className={`flex items-center gap-4 p-4 rounded-xl border ${getAlertColor(alert)}`}
                        >
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${alert.severity === 'danger' ? 'bg-destructive/10' : 'bg-warning/20'}`}>
                                {getAlertIcon(alert.type)}
                            </div>

                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${alert.severity === 'danger' ? 'bg-destructive/20' : 'bg-warning/30'}`}>
                                        {getAlertTitle(alert.type)}
                                    </span>
                                    <span className="text-sm opacity-70">{alert.branchName}</span>
                                </div>
                                <h4 className="font-bold">{alert.drugName}</h4>
                                <p className="text-sm opacity-80">{getAlertMessage(alert)}</p>
                            </div>

                            {alert.expiryDate && (
                                <div className="text-sm opacity-70">
                                    {new Date(alert.expiryDate).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
