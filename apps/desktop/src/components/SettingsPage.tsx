import { useState, useEffect } from "react";
import { Database, FolderOpen, Download, RotateCcw, Check, AlertCircle, Shield, HardDrive, Clock, Info, RefreshCcw, Loader2, ChevronDown } from "lucide-react";
import SyncFailuresTab from "./SyncFailuresTab";

interface Backup {
    name: string;
    path: string;
    date: Date;
    size: number;
}

const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('ar-IQ', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    const diffDays = Math.floor(diffHours / 24);
    return `منذ ${diffDays} يوم`;
};

export default function SettingsPage() {
    const [backups, setBackups] = useState<Backup[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [restoringId, setRestoringId] = useState<string | null>(null);
    const [showConfirmRestore, setShowConfirmRestore] = useState<Backup | null>(null);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [activeTab, setActiveTab] = useState<'backups' | 'failures'>('backups');
    const [failureCount, setFailureCount] = useState(0);

    const fetchBackups = async () => {
        if (window.ipcRenderer) {
            setLoading(true);
            try {
                const list = await window.ipcRenderer.invoke('get-backups');
                setBackups(list);
            } catch (e) {
                console.error("Failed to fetch backups:", e);
            } finally {
                setLoading(false);
            }
        }
    };

    useEffect(() => { fetchBackups(); }, []);

    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(timer);
    }, [toast]);

    useEffect(() => {
        if (window.ipcRenderer) {
            window.ipcRenderer.invoke('get-sync-failures-count').then((count: number) => {
                setFailureCount(count || 0);
            }).catch(console.error);

            const listener = () => {
                window.ipcRenderer.invoke('get-sync-failures-count').then((count: number) => {
                    setFailureCount(count || 0);
                }).catch(console.error);
            };
            window.ipcRenderer.on('sync-failure-recorded', listener);
            return () => {
                window.ipcRenderer.off('sync-failure-recorded', listener);
            };
        }
    }, []);

    const handleCreateBackup = async () => {
        if (!window.ipcRenderer) return;
        setCreating(true);
        try {
            const result = await window.ipcRenderer.invoke('create-backup');
            if (result.success) {
                setToast({ type: 'success', text: 'تم إنشاء النسخة الاحتياطية بنجاح ✓' });
                fetchBackups();
            } else {
                setToast({ type: 'error', text: result.error || 'فشل إنشاء النسخة الاحتياطية' });
            }
        } catch {
            setToast({ type: 'error', text: 'حدث خطأ غير متوقع' });
        } finally {
            setCreating(false);
        }
    };

    const handleRestore = async (backup: Backup) => {
        if (!window.ipcRenderer) return;
        setShowConfirmRestore(null);
        setRestoringId(backup.path);
        try {
            const result = await window.ipcRenderer.invoke('restore-backup', backup.path);
            if (result.success) {
                setToast({ type: 'success', text: 'تم استعادة النسخة. أعد تشغيل التطبيق.' });
            } else {
                setToast({ type: 'error', text: result.error || 'فشل الاستعادة' });
            }
        } catch {
            setToast({ type: 'error', text: 'حدث خطأ غير متوقع' });
        } finally {
            setRestoringId(null);
        }
    };

    const handleOpenFolder = async () => {
        if (window.ipcRenderer) {
            await window.ipcRenderer.invoke('open-backup-folder');
        }
    };

    const totalSize = backups.reduce((a, b) => a + (b.size || 0), 0);
    const displayedBackups = showAll ? backups : backups.slice(0, 5);

    return (
        <div dir="rtl" className="h-full flex flex-col bg-background">
            {/* ======= HEADER ======= */}
            <div className="bg-card/80 backdrop-blur-xl border-b border-border/60 px-6 py-4 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-600/20">
                            <Shield className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-foreground tracking-tight">الإعدادات</h1>
                            <p className="text-xs text-muted-foreground">النسخ الاحتياطي وإدارة البيانات</p>
                        </div>
                    </div>
                    <div className="flex bg-muted rounded-lg p-1">
                        <button
                            onClick={() => setActiveTab('backups')}
                            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'backups' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            قاعدة البيانات
                        </button>
                        <button
                            onClick={() => setActiveTab('failures')}
                            className={`px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-1.5 transition-all ${activeTab === 'failures' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            أخطاء المزامنة
                            {failureCount > 0 && (
                                <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full">{failureCount}</span>
                            )}
                        </button>
                    </div>
                    <button
                        onClick={activeTab === 'backups' ? fetchBackups : undefined}
                        disabled={loading && activeTab === 'backups'}
                        className={`flex items-center gap-2 text-muted-foreground hover:text-primary px-3 py-2 rounded-xl hover:bg-primary/10 transition-all text-sm font-bold ${activeTab === 'failures' ? 'invisible' : ''}`}
                    >
                        <RefreshCcw className={`w-4 h-4 ${loading && activeTab === 'backups' ? 'animate-spin' : ''}`} />
                        تحديث
                    </button>
                </div>
            </div>

            {activeTab === 'backups' ? (
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    {/* ======= STATS ROW ======= */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-muted-foreground font-bold">النسخ المتوفرة</span>
                                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                                    <Database className="w-4 h-4 text-primary" />
                                </div>
                            </div>
                            <p className="text-2xl font-black text-foreground tabular-nums">{backups.length}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">نسخة احتياطية</p>
                        </div>

                        <div className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-muted-foreground font-bold">الحجم الكلي</span>
                                <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                                    <HardDrive className="w-4 h-4 text-purple-600" />
                                </div>
                            </div>
                            <p className="text-2xl font-black text-foreground tabular-nums">{formatSize(totalSize)}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">مساحة مستخدمة</p>
                        </div>

                        <div className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-muted-foreground font-bold">آخر نسخة</span>
                                <div className="w-8 h-8 bg-success/10 rounded-lg flex items-center justify-center">
                                    <Clock className="w-4 h-4 text-success" />
                                </div>
                            </div>
                            <p className="text-lg font-black text-foreground">{backups.length > 0 ? getRelativeTime(backups[0].date) : '—'}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{backups.length > 0 ? formatDate(backups[0].date) : 'لا توجد نسخ'}</p>
                        </div>
                    </div>

                    {/* ======= ACTION BUTTONS ======= */}
                    <div className="bg-card rounded-xl border border-border p-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleCreateBackup}
                                disabled={creating}
                                className="flex-1 flex items-center justify-center gap-2.5 bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground px-5 py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-60 text-sm"
                            >
                                {creating ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <Download className="w-5 h-5" />
                                )}
                                {creating ? 'جاري الإنشاء...' : 'إنشاء نسخة احتياطية الآن'}
                            </button>

                            <button
                                onClick={handleOpenFolder}
                                className="flex items-center justify-center gap-2 bg-muted hover:bg-muted/80 text-foreground px-5 py-3.5 rounded-xl font-bold transition-all border border-border active:scale-[0.98] text-sm"
                            >
                                <FolderOpen className="w-5 h-5" />
                                فتح المجلد
                            </button>
                        </div>
                    </div>

                    {/* ======= BACKUP LIST ======= */}
                    <div className="bg-card rounded-xl border border-border overflow-hidden">
                        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-black text-foreground">النسخ الاحتياطية</h2>
                                <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-bold">{backups.length}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground">يتم الاحتفاظ بآخر 10 نسخ تلقائياً</p>
                        </div>

                        {backups.length === 0 ? (
                            <div className="py-12 text-center">
                                <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Database className="w-7 h-7 text-muted-foreground/30" />
                                </div>
                                <p className="text-muted-foreground text-sm font-bold">لا توجد نسخ احتياطية بعد</p>
                                <p className="text-muted-foreground/50 text-xs mt-1">أنشئ أول نسخة من الزر أعلاه</p>
                            </div>
                        ) : (
                            <>
                                <div className="divide-y divide-border/40">
                                    {displayedBackups.map((backup, index) => {
                                        const isLatest = index === 0;
                                        const isRestoring = restoringId === backup.path;

                                        return (
                                            <div
                                                key={backup.path}
                                                className={`px-4 py-3 flex items-center justify-between transition-colors group ${isLatest ? 'bg-success/5' : 'hover:bg-muted/40'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isLatest ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
                                                        }`}>
                                                        <Database className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold text-foreground truncate">{getRelativeTime(backup.date)}</span>
                                                            {isLatest && (
                                                                <span className="text-[9px] bg-success/15 text-success px-1.5 py-0.5 rounded-md font-black shrink-0">الأحدث</span>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-muted-foreground truncate">
                                                            {formatDate(backup.date)} • {formatSize(backup.size)}
                                                        </p>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => setShowConfirmRestore(backup)}
                                                    disabled={!!restoringId}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all font-bold text-xs shrink-0 ${isRestoring
                                                        ? 'bg-primary/10 text-primary'
                                                        : 'text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100'
                                                        }`}
                                                >
                                                    {isRestoring ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <RotateCcw className="w-3.5 h-3.5" />
                                                    )}
                                                    {isRestoring ? 'جاري...' : 'استعادة'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Show More Button */}
                                {backups.length > 5 && (
                                    <button
                                        onClick={() => setShowAll(!showAll)}
                                        className="w-full py-2.5 text-xs font-bold text-primary hover:bg-primary/5 border-t border-border transition-colors flex items-center justify-center gap-1"
                                    >
                                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`} />
                                        {showAll ? 'عرض أقل' : `عرض الكل (${backups.length})`}
                                    </button>
                                )}
                            </>
                        )}
                    </div>

                    {/* ======= INFO BOX ======= */}
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                        <div className="flex items-start gap-2.5">
                            <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                            <div>
                                <h3 className="font-bold text-primary text-xs mb-2">ملاحظات مهمة</h3>
                                <ul className="text-[11px] text-primary/80 space-y-1">
                                    <li className="flex items-center gap-1.5">
                                        <span className="w-1 h-1 bg-primary/60 rounded-full shrink-0"></span>
                                        يتم إنشاء نسخة تلقائية عند إغلاق التطبيق
                                    </li>
                                    <li className="flex items-center gap-1.5">
                                        <span className="w-1 h-1 bg-primary/60 rounded-full shrink-0"></span>
                                        عند الاستعادة يجب إعادة تشغيل التطبيق
                                    </li>
                                    <li className="flex items-center gap-1.5">
                                        <span className="w-1 h-1 bg-primary/60 rounded-full shrink-0"></span>
                                        النسخ القديمة (أكثر من 10) تُحذف تلقائياً
                                    </li>
                                    <li className="flex items-center gap-1.5">
                                        <span className="w-1 h-1 bg-primary/60 rounded-full shrink-0"></span>
                                        المسار: المستندات / Faramace Backups
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <SyncFailuresTab />
            )}

            {/* ======= TOAST ======= */}
            {toast && (
                <div
                    className={`fixed bottom-5 left-5 z-[70] max-w-sm rounded-xl border px-4 py-3 shadow-xl backdrop-blur-md animate-slideUp ${toast.type === "success"
                        ? "bg-success/10 border-success/30 text-success"
                        : "bg-destructive/10 border-destructive/30 text-destructive"
                        }`}
                >
                    <div className="flex items-center gap-2">
                        {toast.type === "success" ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                        <p className="text-sm font-bold">{toast.text}</p>
                    </div>
                </div>
            )}

            {/* ======= RESTORE CONFIRMATION MODAL ======= */}
            {showConfirmRestore && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
                    <div className="bg-card rounded-2xl max-w-md w-full p-6 shadow-2xl border border-border">
                        <div className="w-14 h-14 bg-warning/10 text-warning rounded-xl flex items-center justify-center mx-auto mb-4">
                            <RotateCcw className="w-7 h-7" />
                        </div>
                        <h2 className="text-lg font-bold text-center mb-2">تأكيد الاستعادة</h2>
                        <p className="text-muted-foreground text-center text-sm mb-2">
                            سيتم استبدال البيانات الحالية بنسخة:
                        </p>
                        <div className="bg-muted rounded-xl px-4 py-3 text-center mb-5">
                            <p className="text-sm font-bold text-foreground">{getRelativeTime(showConfirmRestore.date)}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(showConfirmRestore.date)} • {formatSize(showConfirmRestore.size)}</p>
                        </div>
                        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mb-5">
                            <p className="text-xs text-destructive font-bold text-center">⚠️ لا يمكن التراجع عن هذا الإجراء</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleRestore(showConfirmRestore)}
                                className="flex-1 bg-warning text-warning-foreground py-2.5 rounded-xl font-bold hover:bg-warning/90 transition-colors text-sm"
                            >
                                تأكيد الاستعادة
                            </button>
                            <button
                                onClick={() => setShowConfirmRestore(null)}
                                className="flex-1 bg-muted text-foreground py-2.5 rounded-xl font-bold hover:bg-muted/80 transition-colors text-sm"
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
