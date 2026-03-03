import { useEffect, useState } from 'react';
import { CloudOff, Cloud, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';

type SyncHealthSnapshot = {
    syncMode: 'manual' | 'auto' | 'smart';
    pendingCount: number;
    failedCount: number;
    inProgress: boolean;
    oldestPendingAt: string | null;
    oldestPendingAgeSec: number;
    nextRetryAt: string | null;
    topError: string | null;
};

export default function SyncHealthDashboard() {
    const [health, setHealth] = useState<SyncHealthSnapshot | null>(null);

    useEffect(() => {
        const listener = (_event: any, data: SyncHealthSnapshot) => {
            setHealth(data);
        };

        if (window.ipcRenderer) {
            window.ipcRenderer.on('sync-health-updated', listener);
        }

        return () => {
            if (window.ipcRenderer) {
                window.ipcRenderer.off('sync-health-updated', listener);
            }
        };
    }, []);

    if (!health) return null;

    const isHealthy = health.failedCount === 0 && health.oldestPendingAgeSec < 300; // < 5 mins
    const isCritical = health.failedCount > 0 || health.oldestPendingAgeSec > 3600; // > 1 hour

    return (
        <div className={`flex items-center gap-4 px-4 py-2 rounded-xl mb-4 border transition-colors ${isCritical ? 'bg-destructive/10 border-destructive/30' :
            isHealthy ? 'bg-success/10 border-success/20' : 'bg-warning/10 border-warning/30'
            }`}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
                {isCritical ? (
                    <CloudOff className="w-6 h-6 text-destructive shrink-0" />
                ) : health.inProgress ? (
                    <RefreshCw className="w-6 h-6 text-primary animate-spin shrink-0" />
                ) : isHealthy && health.pendingCount === 0 ? (
                    <CheckCircle2 className="w-6 h-6 text-success shrink-0" />
                ) : (
                    <Cloud className="w-6 h-6 text-warning shrink-0" />
                )}

                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold truncate ${isCritical ? 'text-destructive' :
                            isHealthy ? 'text-success' : 'text-warning'
                            }`}>
                            حالة المزامنة السحابية
                        </span>
                        {health.pendingCount > 0 && (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-card/60 rounded-full">
                                {health.pendingCount} قيد الانتظار
                            </span>
                        )}
                    </div>

                    <span className={`text-xs truncate ${isCritical ? 'text-destructive' :
                        isHealthy ? 'text-success' : 'text-warning'
                        }`}>
                        {isCritical ? (
                            health.topError ? `خطأ: ${health.topError}` : 'يوجد فشل في المزامنة'
                        ) : health.pendingCount === 0 ? (
                            'تمت مزامنة جميع البيانات بنجاح'
                        ) : (
                            `أقدم عملية معلقة منذ ${Math.floor(health.oldestPendingAgeSec / 60)} دقيقة`
                        )}
                    </span>
                </div>
            </div>

            {health.failedCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-card/60 rounded-lg shrink-0 border border-destructive/20">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    <span className="text-xs font-bold text-destructive">
                        {health.failedCount} فشل
                    </span>
                </div>
            )}
        </div>
    );
}
