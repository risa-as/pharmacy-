'use client';

// صندوق طلبات ربط الموردين بالمذاخر (SUPER_ADMIN). ترفعها المؤسسات من صفحة
// الموردين؛ الاعتماد يكتب نفس الربط الذي تكتبه نافذة «ربط الموردين» ويُسجَّل في
// التدقيق. مفصول عن page.tsx لنفس سبب فصل SupplierLinksModal (حجم الصفحة).
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Link2, Check, X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

interface LinkRequestRow {
    id: string;
    status: string;
    note: string | null;
    createdAt: string;
    requestedByName: string | null;
    organization: { id: string; name: string };
    supplier: { id: string; name: string; phone: string | null; warehouseId: string | null };
    warehouse: { id: string; name: string; phone: string | null; city: string | null; isActive: boolean };
}

export default function LinkRequestsPanel({ onChanged }: { onChanged?: () => void }) {
    const [rows, setRows] = useState<LinkRequestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/supplier-link-requests', { cache: 'no-store' });
            const data = await res.json().catch(() => ({}));
            if (res.ok) setRows(data.requests ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const decide = async (row: LinkRequestRow, action: 'APPROVE' | 'REJECT') => {
        setBusyId(row.id);
        setErrors((e) => ({ ...e, [row.id]: '' }));
        try {
            const res = await fetch(`/api/admin/supplier-link-requests/${row.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, note: notes[row.id] ?? '' }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setErrors((e) => ({ ...e, [row.id]: data.error ?? 'فشل حسم الطلب' }));
                return;
            }
            await load();
            onChanged?.();
        } finally {
            setBusyId(null);
        }
    };

    if (loading || rows.length === 0) return null;

    return (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5">
            <button
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-right"
            >
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Link2 className="h-4 w-4 text-amber-600" />
                    طلبات ربط موردين بمذاخر بانتظار القرار ({rows.length})
                </span>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {expanded && (
                <ul className="divide-y divide-border border-t border-border">
                    {rows.map((r) => (
                        <li key={r.id} className="space-y-2 px-4 py-3 text-sm">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-foreground">
                                        <b>{r.organization.name}</b> تطلب ربط المورد <b>«{r.supplier.name}»</b>
                                        {r.supplier.phone && <span className="mr-1 font-mono text-xs text-muted-foreground" dir="ltr">{r.supplier.phone}</span>}
                                        {' '}بمذخر <b>«{r.warehouse.name}»</b>
                                        {r.warehouse.phone && <span className="mr-1 font-mono text-xs text-muted-foreground" dir="ltr">{r.warehouse.phone}</span>}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {new Date(r.createdAt).toISOString().slice(0, 10)}
                                        {r.requestedByName ? ` · ${r.requestedByName}` : ''}
                                        {!r.warehouse.isActive && ' · المذخر معطّل'}
                                        {r.supplier.warehouseId && ' · المورد مربوط بمذخر آخر الآن'}
                                    </p>
                                    {r.note && <p className="mt-1 rounded bg-muted/50 px-2 py-1 text-xs text-foreground">«{r.note}»</p>}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    value={notes[r.id] ?? ''}
                                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                                    maxLength={500}
                                    placeholder="ملاحظة القرار (تظهر للمؤسسة عند الرفض)"
                                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                                />
                                <button
                                    onClick={() => decide(r, 'APPROVE')}
                                    disabled={busyId === r.id}
                                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                    موافقة وربط
                                </button>
                                <button
                                    onClick={() => decide(r, 'REJECT')}
                                    disabled={busyId === r.id}
                                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                >
                                    <X className="h-3.5 w-3.5" /> رفض
                                </button>
                            </div>
                            {errors[r.id] && (
                                <p className="flex items-start gap-1 text-xs text-destructive">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {errors[r.id]}
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
