"use client";

import { useState, useMemo } from "react";
import { Search, Trash2, Clock, Package } from "lucide-react";
import WriteOffModal from "./write-off-modal";

export interface ExpiryRow {
    id: string;
    drugName: string;
    barcode: string | null;
    batchNumber: string | null;
    branchName: string;
    quantity: number;
    costPrice: number;
    expiryLabel: string;
    daysLeft: number;
    status: "expired" | "expiring";
}

type FilterKey = "all" | "expired" | "expiring";

const fmt = (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);

export default function ExpiryBatchesTable({ rows, canWriteOff }: { rows: ExpiryRow[]; canWriteOff: boolean }) {
    const [filter, setFilter] = useState<FilterKey>("all");
    const [query, setQuery] = useState("");
    const [target, setTarget] = useState<ExpiryRow | null>(null);

    const counts = useMemo(
        () => ({
            all: rows.length,
            expired: rows.filter((r) => r.status === "expired").length,
            expiring: rows.filter((r) => r.status === "expiring").length,
        }),
        [rows]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter((r) => {
            if (filter !== "all" && r.status !== filter) return false;
            if (
                q &&
                !r.drugName.toLowerCase().includes(q) &&
                !(r.barcode || "").toLowerCase().includes(q) &&
                !(r.batchNumber || "").toLowerCase().includes(q)
            )
                return false;
            return true;
        });
    }, [rows, filter, query]);

    const tabs: { key: FilterKey; label: string }[] = [
        { key: "all", label: "الكل" },
        { key: "expired", label: "منتهية" },
        { key: "expiring", label: "قريبة الانتهاء" },
    ];

    return (
        <div className="glass-card overflow-hidden">
            {/* الفلترة والبحث */}
            <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex flex-wrap gap-1.5">
                    {tabs.map((tab) => {
                        const active = filter === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setFilter(tab.key)}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                    active
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                                }`}
                            >
                                {tab.label}
                                <span
                                    className={`text-xs rounded-full px-1.5 py-0.5 ${
                                        active ? "bg-primary-foreground/20" : "bg-background"
                                    }`}
                                >
                                    {counts[tab.key]}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="relative sm:mr-auto sm:max-w-xs w-full">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="بحث بالاسم أو رقم الدفعة..."
                        className="w-full pr-10 pl-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                    <p className="text-sm">لا توجد نتائج مطابقة</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                            <tr>
                                <th className="px-6 py-3.5 text-right font-medium font-cairo">الدواء</th>
                                <th className="px-6 py-3.5 text-right font-medium font-cairo">رقم الدفعة</th>
                                <th className="px-6 py-3.5 text-right font-medium font-cairo">الفرع</th>
                                <th className="px-6 py-3.5 text-right font-medium font-cairo">الكمية</th>
                                <th className="px-6 py-3.5 text-right font-medium font-cairo">سعر التكلفة</th>
                                <th className="px-6 py-3.5 text-right font-medium font-cairo">تاريخ الانتهاء</th>
                                <th className="px-6 py-3.5 text-right font-medium font-cairo">الحالة</th>
                                {canWriteOff && (
                                    <th className="px-6 py-3.5 text-center font-medium font-cairo">إجراء</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-card">
                            {filtered.map((batch) => {
                                const expired = batch.status === "expired";
                                return (
                                    <tr key={batch.id} className="hover:bg-muted/40 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                                        expired ? "bg-destructive/10" : "bg-warning/10"
                                                    }`}
                                                >
                                                    <Package className={`w-4 h-4 ${expired ? "text-destructive" : "text-warning"}`} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-foreground truncate">{batch.drugName}</p>
                                                    {batch.barcode && (
                                                        <p className="text-xs text-muted-foreground" dir="ltr">{batch.barcode}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-muted-foreground font-mono text-xs" dir="ltr">
                                            {batch.batchNumber || "—"}
                                        </td>
                                        <td className="px-6 py-4 text-muted-foreground">{batch.branchName}</td>
                                        <td className="px-6 py-4 font-bold text-foreground">{batch.quantity}</td>
                                        <td className="px-6 py-4 text-muted-foreground" dir="ltr">{fmt(batch.costPrice)}</td>
                                        <td className="px-6 py-4 text-muted-foreground" dir="ltr" suppressHydrationWarning>
                                            {batch.expiryLabel}
                                        </td>
                                        <td className="px-6 py-4">
                                            {expired ? (
                                                <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 text-destructive border border-destructive/20 px-2.5 py-1 text-xs font-bold">
                                                    <Trash2 className="w-3 h-3" />
                                                    منتهٍ منذ {Math.abs(batch.daysLeft)} يوم
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 rounded-md bg-warning/10 text-warning border border-warning/20 px-2.5 py-1 text-xs font-bold">
                                                    <Clock className="w-3 h-3" />
                                                    {batch.daysLeft} يوم
                                                </span>
                                            )}
                                        </td>
                                        {canWriteOff && (
                                            <td className="px-6 py-4">
                                                <div className="flex justify-center">
                                                    <button
                                                        onClick={() => setTarget(batch)}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 hover:border-destructive/50 transition-colors"
                                                        title="شطب الدفعة"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        شطب
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal تأكيد الشطب */}
            {target && (
                <WriteOffModal
                    target={{
                        id: target.id,
                        drugName: target.drugName,
                        batchNumber: target.batchNumber,
                        quantity: target.quantity,
                        costPrice: target.costPrice,
                    }}
                    onClose={() => setTarget(null)}
                />
            )}
        </div>
    );
}
