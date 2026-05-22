import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, CloudOff, Clock } from 'lucide-react';

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

/** Maps a raw technical error to a short, calm Arabic label */
function classifyError(error: string | null): 'offline' | 'data' | 'unknown' | null {
    if (!error) return null;
    const e = error.toLowerCase();
    if (
        e.includes('retries') ||
        e.includes('fetch') ||
        e.includes('network') ||
        e.includes('abort') ||
        e.includes('econnrefused') ||
        e.includes('enotfound') ||
        e.includes('timeout') ||
        e.includes('failed to connect')
    ) return 'offline';
    if (e.includes('client error 4') || e.includes('400') || e.includes('403') || e.includes('404')) return 'data';
    return 'unknown';
}

export default function SyncHealthDashboard() {
    const [health, setHealth] = useState<SyncHealthSnapshot | null>(null);

    useEffect(() => {
        const listener = (_event: any, data: SyncHealthSnapshot) => setHealth(data);
        if (window.ipcRenderer) window.ipcRenderer.on('sync-health-updated', listener);
        return () => { if (window.ipcRenderer) window.ipcRenderer.off('sync-health-updated', listener); };
    }, []);

    if (!health) return null;

    // All good and nothing pending — no need to show anything
    if (health.pendingCount === 0 && health.failedCount === 0 && !health.inProgress) return null;

    const errorType = classifyError(health.topError);
    const isOffline = errorType === 'offline' || (health.failedCount > 0 && errorType !== 'data');

    // Actively syncing
    if (health.inProgress) {
        return (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/8 border border-primary/15 text-primary/70">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span className="text-[11px] font-medium">جارٍ المزامنة</span>
            </div>
        );
    }

    // Offline / network unreachable — calm and quiet
    if (isOffline) {
        return (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 border border-border/50 text-muted-foreground">
                <WifiOff className="w-3 h-3 opacity-60" />
                <span className="text-[11px] font-medium">غير متصل</span>
                {health.pendingCount > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] opacity-50">
                        <Clock className="w-2.5 h-2.5" />
                        {health.pendingCount}
                    </span>
                )}
            </div>
        );
    }

    // Items pending but no error yet — neutral waiting state
    if (health.pendingCount > 0 && health.failedCount === 0) {
        return (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-border/40 text-muted-foreground">
                <Clock className="w-3 h-3 opacity-50" />
                <span className="text-[11px] font-medium">{health.pendingCount} معلق</span>
            </div>
        );
    }

    // Real data issue (4xx) — gentle amber, not destructive red
    return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/8 border border-warning/25 text-warning/80">
            <CloudOff className="w-3 h-3" />
            <span className="text-[11px] font-medium">{health.failedCount} تحتاج مراجعة</span>
        </div>
    );
}
