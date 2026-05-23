import { useState, useEffect } from 'react';
import { X, RefreshCw, Trash2, AlertTriangle, CloudOff, CheckCircle } from 'lucide-react';

interface SyncFailure {
    id: string;
    entityType: string;
    entityId: string;
    payload: string;
    errorMessage: string;
    createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
    'ADD-INVENTORY':    'إضافة مخزون',
    'DELETE-INVENTORY': 'حذف مخزون',
    'UPDATE-INVENTORY': 'تحديث مخزون',
    'ADD-BATCH':        'إضافة دفعة',
    'CREATE-DRUG':      'إضافة دواء',
    'SALE':             'عملية بيع',
    'DEBT_PAYMENT':     'سداد دين',
};

function simplifyError(raw: string): string {
    const e = raw.toLowerCase();
    if (e.includes('fetch') || e.includes('network') || e.includes('abort') || e.includes('timeout') || e.includes('retries'))
        return 'انقطع الاتصال أثناء الإرسال';
    if (e.includes('not found') || e.includes('404'))
        return 'العنصر غير موجود في السحابة';
    if (e.includes('403') || e.includes('forbidden'))
        return 'لا توجد صلاحية للتعديل';
    if (e.includes('duplicate') || e.includes('unique'))
        return 'العنصر موجود مسبقاً';
    if (e.includes('401') || e.includes('unauthorized'))
        return 'انتهت جلسة المزامنة — أعد تسجيل الدخول';
    return 'خطأ في الخادم';
}

export default function SyncFailuresPanel({ onClose }: { onClose: () => void }) {
    const [failures, setFailures] = useState<SyncFailure[]>([]);
    const [loading, setLoading]   = useState(true);
    const [busy, setBusy]         = useState<Set<string>>(new Set());

    const load = async () => {
        setLoading(true);
        try {
            const data = await window.ipcRenderer.invoke('get-sync-failures');
            setFailures(Array.isArray(data) ? data : []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const setBusyId  = (id: string) => setBusy(p => new Set(p).add(id));
    const clearBusy  = (id: string) => setBusy(p => { const n = new Set(p); n.delete(id); return n; });

    const retry = async (f: SyncFailure) => {
        setBusyId(f.id);
        try {
            await window.ipcRenderer.invoke('retry-sync-failure', {
                id: f.id,
                entityType: f.entityType,
                payload: f.payload,
            });
            await load();
        } finally { clearBusy(f.id); }
    };

    const remove = async (id: string) => {
        setBusyId(id);
        try {
            await window.ipcRenderer.invoke('delete-sync-failure', id);
            await load();
        } finally { clearBusy(id); }
    };

    const retryAll = async () => {
        for (const f of failures) await retry(f);
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            dir="rtl"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col">

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-warning/10 flex items-center justify-center">
                            <CloudOff className="w-5 h-5 text-warning" />
                        </div>
                        <div>
                            <h2 className="font-bold text-foreground text-sm">التعديلات الفاشلة</h2>
                            <p className="text-[11px] text-muted-foreground">
                                {loading ? 'جارٍ التحميل…' : `${failures.length} عنصر يحتاج مراجعة`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {failures.length > 1 && (
                            <button
                                onClick={retryAll}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 font-bold transition-opacity"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                إعادة الكل
                            </button>
                        )}
                        <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                            <X className="w-4 h-4 text-muted-foreground" />
                        </button>
                    </div>
                </div>

                {/* ── Body ── */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                    {loading ? (
                        <div className="text-center text-muted-foreground py-10 text-sm">جارٍ التحميل…</div>
                    ) : failures.length === 0 ? (
                        <div className="text-center py-10">
                            <CheckCircle className="w-10 h-10 mx-auto mb-2 text-success opacity-50" />
                            <p className="font-bold text-success text-sm">لا توجد تعديلات فاشلة</p>
                            <p className="text-xs text-muted-foreground mt-1">جميع البيانات تمت مزامنتها بنجاح</p>
                        </div>
                    ) : failures.map(f => {
                        const isBusy = busy.has(f.id);
                        const label  = TYPE_LABELS[f.entityType] ?? f.entityType;
                        const err    = simplifyError(f.errorMessage);
                        const date   = new Date(f.createdAt).toLocaleString('ar-IQ-u-nu-latn', {
                            year: 'numeric', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                        });

                        return (
                            <div key={f.id} className="bg-background border border-border rounded-xl p-3.5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-sm text-foreground">{label}</span>
                                                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{date}</span>
                                            </div>
                                            <p className="text-xs text-warning/80 mt-0.5">{err}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            onClick={() => retry(f)}
                                            disabled={isBusy}
                                            title="إعادة المحاولة"
                                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 disabled:opacity-40 font-bold transition-colors"
                                        >
                                            <RefreshCw className={`w-3 h-3 ${isBusy ? 'animate-spin' : ''}`} />
                                            إعادة
                                        </button>
                                        <button
                                            onClick={() => remove(f.id)}
                                            disabled={isBusy}
                                            title="تجاهل وحذف"
                                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 disabled:opacity-40 font-bold transition-colors"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                            حذف
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ── Footer hint ── */}
                {failures.length > 0 && (
                    <div className="px-5 py-2.5 border-t border-border bg-muted/20 rounded-b-2xl">
                        <p className="text-[11px] text-muted-foreground text-center">
                            <span className="font-bold text-primary">إعادة</span> — يُعيد الإرسال للسحابة فوراً &nbsp;·&nbsp;
                            <span className="font-bold text-destructive">حذف</span> — يتجاهل الخطأ نهائياً
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
