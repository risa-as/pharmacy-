"use client";

import { useState, useMemo } from "react";
import { Search, ArrowDown, Package } from "lucide-react";

export interface ShortageRow {
    id: string;
    drugName: string;
    barcode: string | null;
    branchName: string;
    currentStock: number;
    minStock: number;
}

export default function ShortagesTable({ rows }: { rows: ShortageRow[] }) {
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(
            (r) =>
                r.drugName.toLowerCase().includes(q) ||
                (r.barcode || "").toLowerCase().includes(q)
        );
    }, [rows, query]);

    return (
        <div className="glass-card overflow-hidden">
            {/* البحث */}
            <div className="p-4 border-b border-border">
                <div className="relative max-w-sm">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="بحث بالاسم أو الباركود..."
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
                                <th className="px-6 py-3.5 text-right font-medium font-cairo">الفرع</th>
                                <th className="px-6 py-3.5 text-right font-medium font-cairo">الكمية الحالية</th>
                                <th className="px-6 py-3.5 text-right font-medium font-cairo">الحد الأدنى</th>
                                <th className="px-6 py-3.5 text-right font-medium font-cairo">النقص</th>
                                <th className="px-6 py-3.5 text-right font-medium font-cairo">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-card">
                            {filtered.map((item) => {
                                const depleted = item.currentStock === 0;
                                return (
                                    <tr key={item.id} className="hover:bg-muted/40 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 bg-warning/10 rounded-lg flex items-center justify-center shrink-0">
                                                    <Package className="w-4 h-4 text-warning" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-foreground truncate">{item.drugName}</p>
                                                    {item.barcode && (
                                                        <p className="text-xs text-muted-foreground" dir="ltr">{item.barcode}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-muted-foreground">{item.branchName}</td>
                                        <td className="px-6 py-4">
                                            <span className={`font-bold ${depleted ? "text-destructive" : "text-warning"}`}>
                                                {item.currentStock}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-muted-foreground">{item.minStock}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1 text-destructive font-bold">
                                                <ArrowDown className="w-3.5 h-3.5" />
                                                {item.minStock - item.currentStock}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {depleted ? (
                                                <span className="inline-flex items-center rounded-md bg-destructive/10 text-destructive border border-destructive/20 px-2.5 py-1 text-xs font-bold">
                                                    نفد
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-md bg-warning/10 text-warning border border-warning/20 px-2.5 py-1 text-xs font-bold">
                                                    منخفض
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
