import { useState, useEffect } from "react";
import { AlertTriangle, Trash2, RefreshCcw, Edit2, Check, AlertCircle, Copy } from "lucide-react";

interface SyncFailure {
    id: string;
    entityType: string;
    entityId: string;
    payload: string;
    errorMessage: string;
    createdAt: Date;
}

export default function SyncFailuresTab() {
    const [failures, setFailures] = useState<SyncFailure[]>([]);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [editingPayload, setEditingPayload] = useState<SyncFailure | null>(null);
    const [editValue, setEditValue] = useState("");

    const fetchFailures = async () => {
        if (!window.ipcRenderer) return;
        setLoading(true);
        try {
            const list = await window.ipcRenderer.invoke('get-sync-failures');
            setFailures(list);
        } catch (e) {
            console.error("Failed to fetch sync failures:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFailures();
        if (window.ipcRenderer) {
            const listener = () => fetchFailures();
            window.ipcRenderer.on('sync-failure-recorded', listener);
            return () => {
                window.ipcRenderer.removeListener('sync-failure-recorded', listener);
            };
        }
    }, []);

    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(timer);
    }, [toast]);

    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setToast({ text, type });
    };

    const handleDelete = async (id: string) => {
        if (!window.ipcRenderer) return;
        try {
            const ok = await window.ipcRenderer.invoke('delete-sync-failure', id);
            if (ok) {
                showToast("تم الحذف والتجاهل بنجاح");
                setFailures(f => f.filter(x => x.id !== id));
            }
        } catch (e) {
            showToast("فشل الحذف", "error");
        }
    };

    const handleRetry = async (failure: SyncFailure, overridePayload?: string) => {
        if (!window.ipcRenderer) return;
        setLoading(true);
        try {
            const payloadStr = overridePayload || failure.payload;
            const ok = await window.ipcRenderer.invoke('retry-sync-failure', {
                ...failure,
                payload: payloadStr
            });

            if (ok) {
                showToast("تم إرسال البيانات بنجاح!");
                setEditingPayload(null);
                setFailures(f => f.filter(x => x.id !== failure.id));
            } else {
                showToast("فشلت المحاولة مجدداً. راجع الخطأ.", "error");
                fetchFailures(); // To get the updated error
            }
        } catch (e) {
            showToast("حدث خطأ غير متوقع أثناء المعالجة", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div dir="rtl" className="flex flex-col h-full overflow-hidden bg-white/50 relative">

            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center border border-red-100">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                        <h2 className="text-gray-900 font-black text-sm">أخطاء المزامنة المعلقة ({failures.length})</h2>
                        <p className="text-xs text-gray-400">العمليات التي فشل رفعها للسيرفر بسبب بيانات خاطئة.</p>
                    </div>
                </div>

                <button
                    onClick={fetchFailures}
                    disabled={loading}
                    className="flex justify-center items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50"
                >
                    <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    تحديث
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {failures.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-70">
                        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-4">
                            <Check className="w-10 h-10 text-green-500" />
                        </div>
                        <h3 className="text-gray-700 font-bold mb-1">لا توجد أخطاء حالياً!</h3>
                        <p className="text-sm text-gray-500">تم مزامنة جميع البيانات بنجاح.</p>
                    </div>
                ) : (
                    failures.map(failure => (
                        <div key={failure.id} className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md">
                            <div className="p-4 flex flex-wrap gap-4 items-start justify-between border-b border-red-50/50 bg-red-50/20">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-700 uppercase tracking-widest border border-red-200">
                                            {failure.entityType}
                                        </span>
                                        <span className="text-xs text-gray-400 font-medium">
                                            {new Date(failure.createdAt).toLocaleString('ar-IQ')}
                                        </span>
                                    </div>
                                    <p className="text-sm font-bold text-gray-800 break-words line-clamp-2">
                                        سبب الرفض: <span className="text-red-600">{failure.errorMessage}</span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => handleRetry(failure)}
                                        className="h-9 px-4 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                                        disabled={loading}
                                    >
                                        <RefreshCcw className="w-3.5 h-3.5" />
                                        إعادة
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditingPayload(failure);
                                            try {
                                                setEditValue(JSON.stringify(JSON.parse(failure.payload), null, 2));
                                            } catch {
                                                setEditValue(failure.payload);
                                            }
                                        }}
                                        className="w-9 h-9 flex items-center justify-center bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 rounded-lg transition-colors"
                                        title="تعديل"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(failure.id)}
                                        className="w-9 h-9 flex items-center justify-center bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-lg transition-colors"
                                        title="حذف"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Edit Modal */}
            {editingPayload && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <div>
                                <h3 className="font-black text-gray-800 flex items-center gap-2">
                                    <Edit2 className="w-4 h-4 text-blue-600" />
                                    تعديل الكود البرمجي
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">يمكنك تصحيح الأخطاء في الكود أدناه وإعادة المحاولة.</p>
                            </div>
                            <button onClick={() => setEditingPayload(null)} className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200">
                                ✕
                            </button>
                        </div>

                        <div className="p-4 flex-1 overflow-hidden flex flex-col relative group">
                            <textarea
                                dir="ltr"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                className="w-full h-full font-mono text-xs p-4 bg-gray-900 text-green-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                spellCheck="false"
                            />
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(editValue);
                                    showToast("تم النسخ", "success");
                                }}
                                className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity"
                                title="نسخ"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setEditingPayload(null)}
                                className="px-5 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition-colors text-sm"
                            >
                                إلغاء
                            </button>
                            <button
                                onClick={() => handleRetry(editingPayload, editValue)}
                                disabled={loading}
                                className="px-5 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 text-sm flex items-center gap-2"
                            >
                                <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                حفظ ومحاولة رفع السيرفر
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div
                    className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] max-w-sm rounded-xl border px-4 py-3 shadow-xl backdrop-blur-md animate-slideUp ${toast.type === "success"
                        ? "bg-emerald-50/95 border-emerald-200 text-emerald-800"
                        : "bg-red-50/95 border-red-200 text-red-800"
                        }`}
                >
                    <div className="flex items-center gap-2">
                        {toast.type === "success" ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                        <p className="text-sm font-bold">{toast.text}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
