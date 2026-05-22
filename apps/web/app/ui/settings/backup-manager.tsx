"use client";

import { useEffect, useState } from "react";
import { Download, HardDrive, RefreshCw } from "lucide-react";

interface Backup {
    name: string;
    size: number;
    date: string;
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
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/50">
                <div className="flex items-center gap-2 text-foreground">
                    <HardDrive className="w-5 h-5 text-primary" />
                    <h3 className="font-bold">سجل النسخ الاحتياطي</h3>
                </div>
                <button
                    onClick={fetchBackups}
                    disabled={loading}
                    className="p-1.5 rounded-lg hover:bg-card hover:shadow-sm text-muted-foreground transition-all disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="max-h-[300px] overflow-y-auto">
                {loading ? (
                    <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
                ) : backups.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">لا توجد نسخ احتياطية حتى الآن</div>
                ) : (
                    <table className="w-full text-sm text-right">
                        <thead className="text-muted-foreground bg-muted/50 text-xs">
                            <tr>
                                <th className="p-3 font-medium">الملف</th>
                                <th className="p-3 font-medium">الحجم</th>
                                <th className="p-3 font-medium">التاريخ</th>
                                <th className="p-3 font-medium text-center">إجراء</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {backups.map((backup: any) => (
                                <tr key={backup.name} className="hover:bg-primary/10/30 transition-colors group">
                                    <td className="p-3 font-medium text-foreground ltr:text-left" dir="ltr">
                                        {backup.name}
                                    </td>
                                    <td className="p-3 text-muted-foreground ltr:text-left" dir="ltr">
                                        {formatSize(backup.size)}
                                    </td>
                                    <td className="p-3 text-muted-foreground">
                                        {formatDate(backup.date)}
                                    </td>
                                    <td className="p-3 text-center">
                                        <button
                                            onClick={() => handleDownload(backup.name)}
                                            className="text-primary hover:bg-primary/10 p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
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
    );
}
