"use client";

import { useEffect, useState } from "react";
import { Download, HardDrive, RefreshCw, Info } from "lucide-react";

interface Backup {
    name: string;
    size: number;
    date: string;
    branchName?: string | null;
    organizationName?: string | null;
}

export default function BackupManager() {
    const [backups, setBackups] = useState<Backup[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchBackups = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/backup/list");
            const data = await res.json();
            if (data.success) {
                setBackups(data.backups);
            }
        } catch (error) {
            console.error("Failed to fetch backups", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBackups();
    }, []);

    const formatSize = (bytes: number) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString("ar-IQ", { timeZone: "Asia/Baghdad" });
    };

    const handleDownload = (filename: string) => {
        window.open(`/api/backup/download?file=${encodeURIComponent(filename)}`, "_blank");
    };

    return (
        <div className="space-y-3">
            {/* ملاحظة توضيحية لآلية النسخ */}
            <div className="flex items-start gap-2 rounded-lg bg-info/5 border border-info/20 px-4 py-3 text-sm text-muted-foreground">
                <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
                <span>
                    تُنشأ النسخ الاحتياطية <span className="font-bold text-foreground">تلقائياً من تطبيق سطح المكتب</span> وتُرفع للسحابة.
                    من هنا يمكنك عرضها وتحميلها متى احتجت لاستعادتها.
                </span>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
                <div className="p-4 border-b border-border flex justify-between items-center bg-muted/40">
                    <div className="flex items-center gap-2 text-foreground">
                        <HardDrive className="w-5 h-5 text-primary" />
                        <h3 className="font-bold">سجل النسخ الاحتياطية</h3>
                        {!loading && backups.length > 0 && (
                            <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">{backups.length}</span>
                        )}
                    </div>
                    <button
                        onClick={fetchBackups}
                        disabled={loading}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-all disabled:opacity-50"
                        title="تحديث"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </button>
                </div>

                <div className="max-h-[300px] overflow-y-auto">
                    {loading ? (
                        <div className="py-10 flex items-center justify-center text-muted-foreground">
                            <RefreshCw className="w-5 h-5 animate-spin" />
                        </div>
                    ) : backups.length === 0 ? (
                        <div className="py-10 text-center">
                            <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <HardDrive className="w-7 h-7 text-muted-foreground opacity-50" />
                            </div>
                            <p className="text-foreground font-medium text-sm">لا توجد نسخ احتياطية بعد</p>
                            <p className="text-xs text-muted-foreground mt-1">ستظهر هنا بعد أول مزامنة من تطبيق سطح المكتب</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-right">
                            <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                                <tr>
                                    <th className="px-4 py-3 font-medium font-cairo">الملف</th>
                                    <th className="px-4 py-3 font-medium font-cairo">الفرع</th>
                                    <th className="px-4 py-3 font-medium font-cairo">الحجم</th>
                                    <th className="px-4 py-3 font-medium font-cairo">التاريخ</th>
                                    <th className="px-4 py-3 font-medium font-cairo text-center">تحميل</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border bg-card">
                                {backups.map((backup: any) => (
                                    <tr key={backup.name} className="hover:bg-muted/40 transition-colors group">
                                        <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                                            <span className="inline-flex items-center gap-2">
                                                <HardDrive className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                {backup.name}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {backup.branchName ? (
                                                <div className="flex flex-col">
                                                    <span className="text-foreground">{backup.branchName}</span>
                                                    {backup.organizationName && (
                                                        <span className="text-[11px] text-muted-foreground">{backup.organizationName}</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                                            {formatSize(backup.size)}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {formatDate(backup.date)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => handleDownload(backup.name)}
                                                className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-primary hover:bg-primary/10 hover:border-primary/50 transition-colors"
                                                title="تحميل"
                                            >
                                                <Download className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
