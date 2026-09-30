"use client";

import { useState, useMemo } from "react";
import { Search, Trash2, Clock } from "lucide-react";
import WriteOffModal from "./write-off-modal";
import {
    TableCard, TableToolbar, SearchField, ResultCount, DataTable, THead, Th, TBody, rowClass, cellClass,
    PrimaryCell, MutedText, StatusPill, Actions, EmptyState,
} from "@/app/ui/data-table";

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

/** Same layout and styling as the batches table; the list is loaded in full, so tabs and search filter in place. */
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

    const tabs: { key: FilterKey; label: string; active: string; idle: string }[] = [
        { key: "all", label: "الكل", active: "bg-primary text-primary-foreground", idle: "text-foreground" },
        { key: "expired", label: "منتهية", active: "bg-destructive text-white", idle: "text-destructive" },
        { key: "expiring", label: "قريبة الانتهاء", active: "bg-warning text-white", idle: "text-warning" },
    ];

    return (
        <TableCard>
            <TableToolbar>
                <SearchField value={query} onChange={setQuery} placeholder="بحث بالاسم أو الباركود أو رقم الدفعة..." />
                {/* Status tabs, styled like the inventory page tabs */}
                <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 overflow-x-auto max-w-full">
                    {tabs.map((tab) => {
                        const active = filter === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setFilter(tab.key)}
                                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold transition-all ${
                                    active ? tab.active : `${tab.idle} hover:bg-background`
                                }`}
                            >
                                {tab.label}
                                <span className={`text-xs rounded-full px-1.5 py-0.5 font-mono ${active ? "bg-white/20" : "bg-muted"}`}>
                                    {counts[tab.key]}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <ResultCount total={filtered.length} query={query.trim()} unit="دفعة" />
            </TableToolbar>

            {filtered.length === 0 ? (
                <EmptyState icon={<Search />} title="لا توجد نتائج" hint="جرّب كلمة بحث أو تبويباً آخر" />
            ) : (
                <DataTable>
                    <THead>
                        <Th>الدواء</Th>
                        <Th>رقم الدفعة</Th>
                        <Th>الفرع</Th>
                        <Th>الكمية</Th>
                        <Th>سعر التكلفة</Th>
                        <Th>تاريخ الانتهاء</Th>
                        <Th>الحالة</Th>
                        {canWriteOff && <Th center>إجراء</Th>}
                    </THead>
                    <TBody>
                        {filtered.map((batch) => {
                            const expired = batch.status === "expired";
                            return (
                                <tr key={batch.id} className={rowClass}>
                                    <td className={cellClass}>
                                        <PrimaryCell title={batch.drugName} subtitle={batch.barcode} subtitleLtr />
                                    </td>
                                    <td className={`${cellClass} font-mono text-xs text-muted-foreground`}>
                                        <span className="block max-w-[100px] truncate text-right" dir="ltr">{batch.batchNumber || "—"}</span>
                                    </td>
                                    <td className={`${cellClass} text-muted-foreground`}>
                                        <MutedText>{batch.branchName}</MutedText>
                                    </td>
                                    <td className={`${cellClass} font-bold text-foreground`}>{batch.quantity}</td>
                                    <td className={`${cellClass} font-bold text-foreground whitespace-nowrap`} dir="ltr">
                                        {fmt(batch.costPrice)} د.ع
                                    </td>
                                    <td className={`${cellClass} text-xs text-muted-foreground whitespace-nowrap`} dir="ltr" suppressHydrationWarning>
                                        {batch.expiryLabel}
                                    </td>
                                    <td className={cellClass}>
                                        {expired ? (
                                            <StatusPill tone="destructive">
                                                <Trash2 className="w-3 h-3" />
                                                منتهٍ منذ {Math.abs(batch.daysLeft)} يوم
                                            </StatusPill>
                                        ) : (
                                            <StatusPill tone="warning">
                                                <Clock className="w-3 h-3" />
                                                {batch.daysLeft} يوم
                                            </StatusPill>
                                        )}
                                    </td>
                                    {canWriteOff && (
                                        <td className={cellClass}>
                                            <Actions>
                                                <button
                                                    onClick={() => setTarget(batch)}
                                                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-destructive hover:bg-destructive/10 hover:border-destructive/50 transition-colors"
                                                    title="شطب الدفعة"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    شطب
                                                </button>
                                            </Actions>
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </TBody>
                </DataTable>
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
        </TableCard>
    );
}
