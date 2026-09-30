"use client";

import { useState, useMemo } from "react";
import { Search, TrendingDown } from "lucide-react";
import {
    TableCard, TableToolbar, SearchField, ResultCount, DataTable, THead, Th, TBody, rowClass, cellClass,
    PrimaryCell, MutedText, StatusPill, EmptyState,
} from "@/app/ui/data-table";

export interface ShortageRow {
    id: string;
    drugName: string;
    barcode: string | null;
    branchName: string;
    currentStock: number;
    minStock: number;
}

/** Same layout and styling as the batches table; the list is loaded in full, so the search filters in place. */
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
        <TableCard>
            <TableToolbar>
                <SearchField value={query} onChange={setQuery} placeholder="بحث بالاسم أو الباركود..." />
                <ResultCount total={filtered.length} query={query.trim()} unit="صنف ناقص" />
            </TableToolbar>

            {filtered.length === 0 ? (
                <EmptyState icon={<Search />} title="لا توجد نتائج للبحث" hint="جرّب اسماً أو باركوداً آخر" />
            ) : (
                <DataTable>
                    <THead>
                        <Th>الدواء</Th>
                        <Th>الفرع</Th>
                        <Th>الكمية الحالية</Th>
                        <Th>النقص</Th>
                        <Th>الحالة</Th>
                    </THead>
                    <TBody>
                        {filtered.map((item) => {
                            const depleted = item.currentStock === 0;
                            const fillPct = item.minStock > 0 ? Math.min(100, Math.round((item.currentStock / item.minStock) * 100)) : 0;
                            return (
                                <tr key={item.id} className={rowClass}>
                                    <td className={cellClass}>
                                        <PrimaryCell title={item.drugName} subtitle={item.barcode} subtitleLtr />
                                    </td>
                                    <td className={`${cellClass} text-muted-foreground`}>
                                        <MutedText>{item.branchName}</MutedText>
                                    </td>
                                    <td className={cellClass}>
                                        <div className="min-w-[105px] space-y-1">
                                            <span className={`font-bold ${depleted ? "text-destructive" : "text-warning"}`}>{item.currentStock}</span>
                                            <div className="h-1 w-full max-w-[90px] rounded-sm bg-muted overflow-hidden">
                                                <div className={`h-full rounded-sm ${depleted ? "bg-destructive" : "bg-warning"}`} style={{ width: `${fillPct}%` }} />
                                            </div>
                                            <p className="text-[11px] text-muted-foreground leading-tight whitespace-nowrap">
                                                الحد الأدنى: <span className="font-semibold text-foreground">{item.minStock}</span>
                                            </p>
                                        </div>
                                    </td>
                                    <td className={`${cellClass} whitespace-nowrap`}>
                                        <span className="inline-flex items-center gap-1 font-bold text-destructive">
                                            <TrendingDown className="w-3.5 h-3.5" />
                                            {item.minStock - item.currentStock}
                                        </span>
                                    </td>
                                    <td className={cellClass}>
                                        {depleted ? <StatusPill tone="destructive">نفد</StatusPill> : <StatusPill tone="warning">منخفض</StatusPill>}
                                    </td>
                                </tr>
                            );
                        })}
                    </TBody>
                </DataTable>
            )}
        </TableCard>
    );
}
