import { useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';

/**
 * Update banner driven by electron-updater events from the main process.
 *
 * Flow (background-download + install-on-restart strategy):
 *  - update:available         → optional subtle "downloading" hint
 *  - update:download-progress → progress percentage
 *  - update:downloaded        → prominent banner with a "restart now" button
 *
 * The downloaded-state banner is the important one: some pharmacies keep the
 * app open for many days, so we don't rely on the next quit to apply the
 * update — we prompt them to restart now (while still allowing dismissal, in
 * which case the update installs automatically on the next close).
 */
type UpdatePhase = 'idle' | 'downloading' | 'downloaded';

export default function UpdateBanner() {
    const [phase, setPhase] = useState<UpdatePhase>('idle');
    const [version, setVersion] = useState<string>('');
    const [percent, setPercent] = useState<number>(0);
    const [dismissed, setDismissed] = useState(false);
    const [restarting, setRestarting] = useState(false);

    useEffect(() => {
        const onAvailable = (_e: any, data: { version?: string }) => {
            setVersion(data?.version ?? '');
            setPhase((p) => (p === 'downloaded' ? p : 'downloading'));
        };
        const onProgress = (_e: any, data: { percent?: number }) => {
            setPercent(data?.percent ?? 0);
            setPhase((p) => (p === 'downloaded' ? p : 'downloading'));
        };
        const onDownloaded = (_e: any, data: { version?: string }) => {
            setVersion(data?.version ?? '');
            setPhase('downloaded');
            setDismissed(false); // a freshly-downloaded update always re-shows
        };

        window.ipcRenderer?.on('update:available', onAvailable);
        window.ipcRenderer?.on('update:download-progress', onProgress);
        window.ipcRenderer?.on('update:downloaded', onDownloaded);
        return () => {
            window.ipcRenderer?.off('update:available', onAvailable);
            window.ipcRenderer?.off('update:download-progress', onProgress);
            window.ipcRenderer?.off('update:downloaded', onDownloaded);
        };
    }, []);

    const handleRestart = () => {
        setRestarting(true);
        window.ipcRenderer?.invoke('update:install-now');
    };

    if (phase === 'idle') return null;

    // Downloaded → prominent, actionable banner (cannot be permanently hidden
    // by dismiss alone; it reappears on next launch until installed).
    if (phase === 'downloaded' && !dismissed) {
        return (
            <div dir="rtl" className="fixed top-0 inset-x-0 z-[60] flex items-center justify-between gap-3 bg-emerald-600 text-white px-4 py-2.5 text-sm shadow-md">
                <div className="flex items-center gap-2 min-w-0">
                    <Download className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                        تحديث جديد جاهز{version ? ` (الإصدار ${version})` : ''} — أعد التشغيل الآن لتطبيقه.
                    </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={handleRestart}
                        disabled={restarting}
                        className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 disabled:opacity-60 rounded-lg px-3 py-1.5 font-semibold transition-colors"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${restarting ? 'animate-spin' : ''}`} />
                        {restarting ? 'جارٍ إعادة التشغيل…' : 'إعادة التشغيل الآن'}
                    </button>
                    <button
                        onClick={() => setDismissed(true)}
                        className="text-white/80 hover:text-white p-1"
                        title="لاحقاً (سيُثبّت عند إغلاق التطبيق)"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        );
    }

    // Downloading → subtle progress strip.
    if (phase === 'downloading') {
        return (
            <div dir="rtl" className="fixed top-0 inset-x-0 z-[60] flex items-center gap-2 bg-zinc-800 text-zinc-200 px-4 py-1.5 text-xs">
                <Download className="w-3.5 h-3.5 animate-pulse shrink-0" />
                <span>يجري تنزيل تحديث جديد في الخلفية{percent > 0 ? ` — ${percent}%` : ''}…</span>
            </div>
        );
    }

    return null;
}
