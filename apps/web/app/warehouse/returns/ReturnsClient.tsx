"use client";

// المرحلة 5 (الصقل التجاري) §Part 4: عميل صفحة «الإرجاعات» — قائمة بفلترة
// الحالة + قبول/رفض (canQuoteOrders، الخادم يتحقق مجدداً).
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Check, X, Package } from 'lucide-react';
import PageHeader from "@/app/warehouse/_components/PageHeader";
import EmptyState from "@/app/warehouse/_components/EmptyState";
import StatusChip, { type StatusChipVariant } from "@/app/warehouse/_components/StatusChip";
import ReturnInspection from './ReturnInspection';
import { warehouseMutation } from '@/app/lib/warehouse-mutation-client';
import { useWarehouseList } from '../_components/useWarehouseList';
import ListPages from '../_components/ListPages';

interface ReturnItem {
    id: string;
    barcode: string;
    drugName: string | null;
    quantity: number;
    unitPrice: number;
    disposition: string;
}

interface ReturnRow {
    shipmentMode?: string | null;
    id: string;
    creditNoteNumber: string | null;
    orderId: string;
    organizationName: string;
    reason: string | null;
    totalAmount: number;
    status: string;
    creditBalance: number | null;
    refundedAmount: number | null;
    actorName: string | null;
    createdAt: string;
    items: ReturnItem[];
}

const money = (n: number) => n.toLocaleString("ar-IQ-u-nu-latn", { maximumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
    PENDING: "بانتظار قرارك",
    ACCEPTED: "مقبول",
    REJECTED: "مرفوض",
};
const STATUS_VARIANT: Record<string, StatusChipVariant> = {
    PENDING: "warning",
    ACCEPTED: "success",
    REJECTED: "danger",
};

export default function ReturnsClient({
    initialReturns,
    canDecide,
    canRelease, canDispose, canRefund,
}: {
    initialReturns: ReturnRow[];
    canDecide: boolean;
    canRelease: boolean; canDispose: boolean; canRefund: boolean;
}) {
    const [filter, setFilter] = useState("ALL");
    const list = useWarehouseList<ReturnRow>('/api/warehouse-portal/returns', 'returns', new URLSearchParams({ status: filter === 'ALL' ? '' : filter }).toString(), initialReturns);
    const { items: returns, setItems: setReturns } = list;
    const [busyId, setBusyId] = useState<string | null>(null);
    const [refundReference, setRefundReference] = useState<Record<string, string>>({});
    async function refund(r: ReturnRow) {
        if (busyId || r.creditBalance === null || r.refundedAmount === null) return;
        setBusyId(r.id);
        try {
            const response = await warehouseMutation(`/api/warehouse-portal/returns/${r.id}/refund`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: r.creditBalance - r.refundedAmount, reference: refundReference[r.id] ?? '' }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setReturns(prev => prev.map(row => row.id === r.id ? { ...row, refundedAmount: data.return.refundedAmount } : row));
            toast.success('سُجل رد الرصيد الدائن');
        } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر تسجيل الرد'); }
        finally { setBusyId(null); }
    }

    const visible = useMemo(
        () => (filter === "ALL" ? returns : returns.filter((r) => r.status === filter)),
        [returns, filter]
    );

    const decide = async (r: ReturnRow, action: "ACCEPTED" | "REJECTED") => {
        if (action === "REJECTED" && !confirm(`رفض طلب الإرجاع من «${r.organizationName}»؟`)) return;
        setBusyId(r.id);
        try {
            const res = await fetch(`/api/warehouse-portal/returns/${r.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? "تعذر تنفيذ القرار");
                return;
            }
            setReturns((prev) =>
                prev.map((p) => (p.id === r.id ? { ...p, ...data.return, createdAt: p.createdAt,
                    items: data.return.items.map((item: ReturnItem) => ({ ...item, drugName: p.items.find(existing => existing.id === item.id)?.drugName ?? null })) } : p))
            );
            toast.success(action === "ACCEPTED" ? "قُبل الإرجاع وطُبِّق الإشعار الدائن على الفاتورة" : "رُفض طلب الإرجاع");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'تعذر الاتصال؛ أعد المحاولة بالقرار نفسه');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="الإرجاعات"
                description="طلبات إرجاع الصيدليات على طلبات مُسلَّمة — القبول ينشئ إشعاراً دائناً على فاتورة الصيدلية."
                actions={
                    <div className="flex flex-wrap gap-1">
                        {[
                            ["ALL", "الكل"],
                            ["PENDING", "بانتظار القرار"],
                            ["ACCEPTED", "مقبولة"],
                            ["REJECTED", "مرفوضة"],
                        ].map(([v, l]) => (
                            <button
                                key={v}
                                onClick={() => setFilter(v)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                                    filter === v ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
                                }`}
                            >
                                {l}
                            </button>
                        ))}
                    </div>
                }
            />

            <ListPages {...list} />
            {visible.length === 0 ? (
                <EmptyState icon="↩️" title="لا توجد طلبات إرجاع بهذه الحالة." />
            ) : (
                <div className="space-y-3">
                    {visible.map((r) => (
                        <div key={r.id} className="min-w-0 rounded-lg border bg-card p-4 shadow-sm sm:p-5">
                            <div className="flex flex-wrap items-center gap-3 border-b pb-4">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><RotateCcw size={19} aria-hidden="true" /></span>
                                <div className="min-w-0 flex-1">
                                <div className="font-bold">{r.organizationName}</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                    {new Date(r.createdAt).toLocaleString("ar-IQ-u-nu-latn")}
                                </div>
                                </div>
                                <span className="mr-auto">
                                    <StatusChip variant={STATUS_VARIANT[r.status] ?? "neutral"} label={STATUS_LABEL[r.status] ?? r.status} emphasis={r.status === "PENDING"} />
                                </span>
                            </div>
                            {r.reason && <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">سبب الإرجاع: </span>{r.reason}</div>}
                            <div className="mt-3 overflow-x-auto rounded-lg border">
                                <table className="w-full min-w-[460px] table-fixed text-sm">
                                    <thead className="bg-muted text-right text-muted-foreground">
                                        <tr>
                                            <th className="w-[46%] px-3 py-2.5 font-medium">الدواء / الباركود</th>
                                            <th className="w-[14%] px-2 py-2.5 text-center font-medium">الكمية</th>
                                            <th className="w-[20%] px-2 py-2.5 font-medium">سعر الوحدة</th>
                                            <th className="w-[20%] px-2 py-2.5 font-medium">القيمة</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {r.items.map((it) => (
                                            <tr key={it.id} className="border-t transition-colors hover:bg-muted/30">
                                                <td className="px-3 py-3">
                                                    <div className="break-words text-right font-semibold leading-6"><bdi>{it.drugName || 'اسم الدواء غير متوفر'}</bdi></div>
                                                    <details className="mt-1 text-xs text-muted-foreground">
                                                        <summary className="w-fit max-w-full cursor-pointer list-none rounded px-1 py-0.5 font-mono hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" title="اضغط لعرض الباركود كاملًا" aria-label={`عرض الباركود الكامل للدواء ${it.drugName || ''}`}>
                                                            <bdi dir="ltr" className="block truncate">{it.barcode.length > 22 ? `${it.barcode.slice(0, 12)}…${it.barcode.slice(-6)}` : it.barcode}</bdi>
                                                        </summary>
                                                        <p dir="ltr" className="mt-1 select-all break-all rounded-md border bg-muted/40 p-2 font-mono">{it.barcode}</p>
                                                    </details>
                                                </td>
                                                <td className="tabular-nums px-2 py-3 text-center"><span className="inline-flex min-w-8 justify-center rounded-md bg-muted px-2 py-1 font-medium">{it.quantity}</span></td>
                                                <td className="tabular-nums px-3 py-2">{money(it.unitPrice)}</td>
                                                <td className="tabular-nums px-3 py-2 font-medium">{money(it.quantity * it.unitPrice)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-3">
                                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Package size={15} aria-hidden="true" />{r.items.length} أصناف</span>
                                <div className="flex items-baseline gap-3"><span className="text-sm text-muted-foreground">إجمالي الإرجاع</span><span className="text-xl font-bold tabular-nums">{money(r.totalAmount)} <span className="text-xs font-medium text-muted-foreground">د.ع</span></span></div>
                            </div>
                            {r.status === 'ACCEPTED' && <div className="mt-3 text-sm">
                                <p>الإشعار الدائن: <bdi className="font-semibold">{r.creditNoteNumber ?? 'بانتظار الترقيم'}</bdi></p>
                                {r.creditBalance !== null && r.refundedAmount !== null && <p>رصيد لصالح العميل: {money(Math.max(r.creditBalance - r.refundedAmount, 0))} د.ع</p>}
                                {r.shipmentMode === 'ORDER_PORTAL' && <p className="mt-3 rounded-lg border p-3 text-muted-foreground">مرتجع شحنة بوابة الطلبات: التسوية المالية مسجلة هنا. افحص البضاعة وسجل استلامها في برنامج مخزون المذخر الخارجي؛ لن تُضاف إلى مخزون المنصة.</p>}
                                {r.shipmentMode !== 'ORDER_PORTAL' && (canRelease || canDispose) && r.items.some(item => item.disposition === 'QUARANTINE') &&
                                    <ReturnInspection returnId={r.id} items={r.items.filter(item => item.disposition === 'QUARANTINE')}
                                        canRelease={canRelease} canDispose={canDispose}
                                        onSaved={updated => setReturns(prev => prev.map(row => row.id === r.id ? { ...row, items: row.items.map(item => ({ ...item, disposition: updated.find(saved => saved.id === item.id)?.disposition ?? item.disposition })) } : row))} />}
                                {r.items.filter(item => item.disposition !== 'QUARANTINE').map(item => <p key={item.id} className="mt-2 break-words">{item.drugName || 'دواء غير مسمى'}: {item.disposition === 'RELEASED' ? 'أُعيد للمخزون بعد الفحص' : 'أُتلف بعد الفحص'}</p>)}
                                {canRefund && r.creditBalance !== null && r.refundedAmount !== null && r.creditBalance > r.refundedAmount && <div className="mt-3 flex gap-2">
                                    <input aria-label="مرجع سند صرف الرصيد الدائن" placeholder="مرجع سند الصرف" className="rounded border p-2" value={refundReference[r.id] ?? ''} onChange={e => setRefundReference(prev => ({ ...prev, [r.id]: e.target.value }))} />
                                    <button disabled={busyId === r.id || (refundReference[r.id]?.trim().length ?? 0) < 3} className="rounded border px-3 py-1 disabled:opacity-50" onClick={() => refund(r)}>تسجيل رد الرصيد للعميل</button>
                                </div>}
                            </div>}
                            {canDecide && r.status === "PENDING" && (
                                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3">
                                    <button
                                        onClick={() => decide(r, "REJECTED")}
                                        disabled={busyId === r.id}
                                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-destructive/25 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                    >
                                        <X size={15} aria-hidden="true" /> رفض الطلب
                                    </button>
                                    <button
                                        onClick={() => decide(r, "ACCEPTED")}
                                        disabled={busyId === r.id}
                                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                    >
                                        <Check size={15} aria-hidden="true" /> قبول وتطبيق الإشعار الدائن
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
