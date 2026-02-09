import { useState, useEffect } from "react";
import { Database, FolderOpen, Download, RotateCcw, Trash2, Check, AlertCircle } from "lucide-react";

interface Backup {
    name: string;
    path: string;
    date: Date;
    size: number;
}

// تنسيق حجم الملف
const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// تنسيق التاريخ
const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('ar-IQ', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

export default function SettingsPage() {
    const [backups, setBackups] = useState<Backup[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // جلب قائمة النسخ الاحتياطية
    const fetchBackups = async () => {
        if (window.ipcRenderer) {
            const list = await window.ipcRenderer.invoke('get-backups');
            setBackups(list);
        }
    };

    useEffect(() => {
        fetchBackups();
    }, []);

    // إنشاء نسخة احتياطية
    const handleCreateBackup = async () => {
        if (!window.ipcRenderer) return;

        setLoading(true);
        setMessage(null);

        try {
            const result = await window.ipcRenderer.invoke('create-backup');
            if (result.success) {
                setMessage({ type: 'success', text: 'تم إنشاء النسخة الاحتياطية بنجاح' });
                fetchBackups();
            } else {
                setMessage({ type: 'error', text: result.error || 'فشل إنشاء النسخة الاحتياطية' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'حدث خطأ غير متوقع' });
        } finally {
            setLoading(false);
        }
    };

    // استعادة نسخة احتياطية
    const handleRestore = async (backup: Backup) => {
        if (!window.ipcRenderer) return;

        if (!confirm(`هل تريد استعادة النسخة الاحتياطية؟\n\n${backup.name}\n\nسيتم استبدال البيانات الحالية!`)) {
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const result = await window.ipcRenderer.invoke('restore-backup', backup.path);
            if (result.success) {
                setMessage({ type: 'success', text: 'تم استعادة النسخة الاحتياطية. يرجى إعادة تشغيل التطبيق.' });
            } else {
                setMessage({ type: 'error', text: result.error || 'فشل استعادة النسخة الاحتياطية' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'حدث خطأ غير متوقع' });
        } finally {
            setLoading(false);
        }
    };

    // فتح مجلد النسخ الاحتياطية
    const handleOpenFolder = async () => {
        if (window.ipcRenderer) {
            await window.ipcRenderer.invoke('open-backup-folder');
        }
    };

    return (
        <div dir="rtl" className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <Database className="w-7 h-7 text-blue-600" />
                الإعدادات والنسخ الاحتياطي
            </h1>

            {/* رسالة الحالة */}
            {message && (
                <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${message.type === 'success'
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                    }`}>
                    {message.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    {message.text}
                </div>
            )}

            {/* قسم النسخ الاحتياطي */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
                <div className="bg-gray-50 p-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-800">النسخ الاحتياطي</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        يتم إنشاء نسخة احتياطية تلقائياً عند إغلاق التطبيق
                    </p>
                </div>

                <div className="p-4 flex flex-wrap gap-3">
                    <button
                        onClick={handleCreateBackup}
                        disabled={loading}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold transition-colors disabled:opacity-50"
                    >
                        <Download className="w-5 h-5" />
                        إنشاء نسخة احتياطية الآن
                    </button>

                    <button
                        onClick={handleOpenFolder}
                        className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold transition-colors"
                    >
                        <FolderOpen className="w-5 h-5" />
                        فتح مجلد النسخ
                    </button>
                </div>
            </div>

            {/* قائمة النسخ الاحتياطية */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gray-50 p-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-800">النسخ الاحتياطية المتوفرة</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        يتم الاحتفاظ بآخر 10 نسخ احتياطية
                    </p>
                </div>

                {backups.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                        <Database className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد نسخ احتياطية</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {backups.map((backup, index) => (
                            <div key={backup.path} className="p-4 flex items-center justify-between hover:bg-gray-50">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${index === 0 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                        <Database className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-gray-800 flex items-center gap-2">
                                            {backup.name}
                                            {index === 0 && (
                                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                                    الأحدث
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {formatDate(backup.date)} • {formatSize(backup.size)}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleRestore(backup)}
                                    disabled={loading}
                                    className="flex items-center gap-2 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    استعادة
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* معلومات */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="font-bold text-blue-800 mb-2">💡 ملاحظات</h3>
                <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                    <li>يتم حفظ النسخ الاحتياطية في مجلد "المستندات/Faramace Backups"</li>
                    <li>عند استعادة نسخة احتياطية، يجب إعادة تشغيل التطبيق</li>
                    <li>النسخ الاحتياطية القديمة (أكثر من 10) تُحذف تلقائياً</li>
                </ul>
            </div>
        </div>
    );
}
