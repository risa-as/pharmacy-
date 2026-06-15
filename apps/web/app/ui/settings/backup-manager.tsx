"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, HardDrive, RefreshCw, Info, Building2, Store } from "lucide-react";

interface Backup {
    name: string;
    size: number;
    date: string;
    branchId?: string | null;
    branchName?: string | null;
    organizationId?: string | null;
    organizationName?: string | null;
}

export default function BackupManager() {
    const [backups, setBackups] = useState<Backup[]>([]);
    const [loading, setLoading] = useState(true);
    const [orgFilter, setOrgFilter] = useState("");
    const [branchFilter, setBranchFilter] = useState("");

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

    // Distinct organisations / branches present in the loaded backups, for filters.
    const orgs = useMemo(() => {
        const map = new Map<string, string>();
        for (const b of backups) {
            if (b.organizationId) map.set(b.organizationId, b.organizationName || b.organizationId);
        }
        return Array.from(map, ([id, name]) => ({ id, name }));
    }, [backups]);

    const branches = useMemo(() => {
        const map = new Map<string, string>();
        for (const b of backups) {
            if (b.branchId && (!orgFilter || b.organizationId === orgFilter)) {
                map.set(b.branchId, b.branchName || b.branchId);
            }
        }
        return Array.from(map, ([id, name]) => ({ id, name }));
    }, [backups, orgFilter]);

    const filteredBackups = useMemo(
        () =>
            backups.filter(
                (b) =>
                    (!orgFilter || b.organizationId === orgFilter) &&
                    (!branchFilter || b.branchId === branchFilter),
            ),
        [backups, orgFilter, branchFilter],
    );

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
                        {!loading && filteredBackups.length > 0 && (
                            <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">{filteredBackups.length}</span>
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

                {/* Filters — by organisation (super-admin) and branch */}
                {!loading && (orgs.length > 1 || branches.length > 1) && (
                    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border bg-card">
                        <span className="text-xs text-muted-foreground">تصفية:</span>
                        {orgs.length > 1 && (
                            <div className="relative">
                                <Building2 className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <select
                                    value={orgFilter}
                                    onChange={(e) => { setOrgFilter(e.target.value); setBranchFilter(""); }}
                                    className="appearance-none border border-border rounded-lg bg-muted pr-8 pl-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    <option value="">كل المؤسسات</option>
                                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            </div>
                        )}
                        {branches.length > 1 && (
                            <div className="relative">
                                <Store className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <select
                                    value={branchFilter}
                                    onChange={(e) => setBranchFilter(e.target.value)}
                                    className="appearance-none border border-border rounded-lg bg-muted pr-8 pl-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    <option value="">كل الفروع</option>
                                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                        )}
                        {(orgFilter || branchFilter) && (
                            <button
                                onClick={() => { setOrgFilter(""); setBranchFilter(""); }}
                                className="text-xs text-primary hover:underline"
                            >
                                مسح
                            </button>
                        )}
                    </div>
                )}

                <div className="max-h-[300px] overflow-y-auto">
                    {loading ? (
                        <div className="py-10 flex items-center justify-center text-muted-foreground">
                            <RefreshCw className="w-5 h-5 animate-spin" />
                        </div>
                    ) : filteredBackups.length === 0 ? (
                        <div className="py-10 text-center">
                            <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <HardDrive className="w-7 h-7 text-muted-foreground opacity-50" />
                            </div>
                            <p className="text-foreground font-medium text-sm">
                                {backups.length === 0 ? "لا توجد نسخ احتياطية بعد" : "لا توجد نسخ مطابقة للتصفية"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {backups.length === 0 ? "ستظهر هنا بعد أول مزامنة من تطبيق سطح المكتب" : "جرّب تغيير المؤسسة أو الفرع"}
                            </p>
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
                                {filteredBackups.map((backup: any) => (
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
