'use client';

// ميزة وحدة التسعير: شاشة حسم عدد الأشرطة للأدوية غير المؤكَّدة، مرتّبة بحركتها.
//
// التأكيد يحدث طبيعياً عند إضافة دفعة، لكن دواءً يُطلب مرة كل شهرين يبقى بلا
// تعبئة مؤكَّدة فصولاً. هذه الشاشة تسبق ذلك الانتظار، والترتيب بالبيع يجعل
// «المهم» رقماً لا انطباعاً.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Check, PackageCheck, AlertTriangle, Info } from 'lucide-react';

type DosageFormClass = 'SINGLE_UNIT' | 'MULTI_UNIT' | 'UNKNOWN';

interface Row {
    drugId: string;
    barcode: string;
    tradeName: string;
    form: DosageFormClass;
    suggestedUnitsPerPack: number | null;
    movement: number;
    stock: number;
    sellPrice: number;
    lastStripCost: number | null;
    derivedPacketPrice: number | null;
}

const fmt = (n: number | null) =>
    n === null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function PackUnitsPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [total, setTotal] = useState(0);
    const [singleUnitCount, setSingleUnitCount] = useState(0);
    /**
     * مرشّح الشكل: 'SINGLE' يعرض ما تعبئته 1 يقيناً (زجاجة، أنبوب، قطرة).
     * مراجعة هذه تدقيق لا إدخال — الرقم معروف سلفاً والعين تمرّ عليه سريعاً.
     */
    const [formFilter, setFormFilter] = useState<'ALL' | 'SINGLE'>('ALL');
    /** المحدد للتأكيد الجماعي — يبدأ فارغاً عمداً فلا يمرّ تأكيد بلا قصد. */
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkSaving, setBulkSaving] = useState(false);
    const [movementDays, setMovementDays] = useState(90);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    /** ما كتبه المستخدم لكل دواء قبل الحفظ. */
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
    const [error, setError] = useState('');

    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 300);
        return () => clearTimeout(t);
    }, [query]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const url = new URL('/api/inventory/pack-units', window.location.origin);
        if (debounced) url.searchParams.set('query', debounced);
        if (formFilter === 'SINGLE') url.searchParams.set('form', 'SINGLE');
        fetch(url.toString())
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (cancelled || !d) return;
                setRows(d.items ?? []);
                setTotal(d.totalUnconfirmed ?? 0);
                setSingleUnitCount(d.singleUnitCount ?? 0);
                setMovementDays(d.movementDays ?? 90);
                setSelected(new Set());
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [debounced, formFilter]);

    const save = async (row: Row) => {
        const raw = draft[row.drugId] ?? '';
        const n = parseInt(raw, 10);
        if (!Number.isInteger(n) || n <= 0) {
            setError(`اكتب عدد أشرطة صحيحاً لـ${row.tradeName}.`);
            return;
        }
        setError('');
        setSavingId(row.drugId);
        try {
            const res = await fetch('/api/inventory/pack-units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drugId: row.drugId, unitsPerPack: n }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? 'فشل الحفظ'); return; }
            // يبقى الصف ظاهراً موسوماً بأنه حُسم، فلا تقفز بقية الصفوف تحت
            // المؤشر بعد كل حفظ — الاختفاء الفوري يربك المراجعة المتتابعة.
            setDoneIds((prev) => new Set(prev).add(row.drugId));
            setTotal((t) => Math.max(0, t - 1));
        } finally {
            setSavingId(null);
        }
    };

    /** الصفوف المعروضة التي لم تُحسم بعد — أساس التحديد والتأكيد الجماعي. */
    const selectableIds = useMemo(
        () => rows.filter((r) => !doneIds.has(r.drugId)).map((r) => r.drugId),
        [rows, doneIds],
    );

    /**
     * تأكيد جماعي للأشكال الوحدوية بالقيمة 1.
     *
     * لا يُحدَّد شيء تلقائياً: المستخدم يضغط «تحديد الكل» ثم «تأكيد». خطوتان
     * مقصودتان — الرقم معروف سلفاً لكن التأكيد مشترك بين كل الصيدليات ولا
     * يُسأل عنه أحد بعده، فلا يمرّ بضغطة واحدة عابرة.
     */
    const confirmSelectedAsOne = async () => {
        const ids = Array.from(selected);
        if (ids.length === 0) return;
        setError('');
        setBulkSaving(true);
        try {
            const res = await fetch('/api/inventory/pack-units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drugIds: ids, unitsPerPack: 1 }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? 'فشل التأكيد الجماعي'); return; }
            setDoneIds((prev) => {
                const next = new Set(prev);
                for (const id of ids) next.add(id);
                return next;
            });
            setTotal((t) => Math.max(0, t - (data.confirmed ?? ids.length)));
            setSingleUnitCount((c) => Math.max(0, c - (data.confirmed ?? ids.length)));
            setSelected(new Set());
        } finally {
            setBulkSaving(false);
        }
    };

    /** يحفظ كل الصفوف التي كتب لها المستخدم رقماً، حتى لو كانت الأرقام مختلفة. */
    const confirmDrafts = async () => {
        const items = rows
            .filter((row) => !doneIds.has(row.drugId))
            .map((row) => ({ drugId: row.drugId, unitsPerPack: parseInt(draft[row.drugId] ?? '', 10) }))
            .filter((item) => Number.isInteger(item.unitsPerPack) && item.unitsPerPack > 0);
        if (items.length === 0) {
            setError('اكتب عدد الأشرطة لدواء واحد على الأقل قبل التأكيد الجماعي.');
            return;
        }
        setError('');
        setBulkSaving(true);
        try {
            const res = await fetch('/api/inventory/pack-units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? 'فشل التأكيد الجماعي'); return; }
            setDoneIds((prev) => {
                const next = new Set(prev);
                for (const item of items) next.add(item.drugId);
                return next;
            });
            setTotal((t) => Math.max(0, t - (data.confirmed ?? items.length)));
            setDraft((prev) => {
                const next = { ...prev };
                for (const item of items) delete next[item.drugId];
                return next;
            });
            setSelected(new Set());
        } finally {
            setBulkSaving(false);
        }
    };

    const pending = useMemo(() => rows.filter((r) => !doneIds.has(r.drugId)).length, [rows, doneIds]);
    const draftedIds = useMemo(
        () => rows.filter((r) => !doneIds.has(r.drugId) && Number.isInteger(parseInt(draft[r.drugId] ?? '', 10)) && parseInt(draft[r.drugId] ?? '', 10) > 0).map((r) => r.drugId),
        [rows, draft, doneIds],
    );

    return (
        <div dir="rtl" className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
                            <PackageCheck className="h-5 w-5 text-primary" />
                            تأكيد عدد الأشرطة في الباكيت
                        </h1>
                        <p className="mt-1 text-xs text-muted-foreground">
                            مرتّبة بالأكثر مبيعاً خلال {movementDays} يوماً — الأهم أولاً.
                        </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-center">
                        <div className="text-xl font-bold tabular-nums text-foreground">{total}</div>
                        <div className="text-[11px] text-muted-foreground">دواء بلا تأكيد</div>
                    </div>
                </div>

                <p className="mt-3 flex items-start gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    العدد الذي تؤكّده هنا <b>مشترك بين كل الصيدليات</b> ولن يُسأل عنه أحد بعدك، فاعتمد العلبة
                    نفسها لا التقدير. الرقم المقترَح مستنتَج من دفعاتك القديمة وقد لا يكون دقيقاً.
                </p>
            </div>

            {/* مرشّح الشكل: الوحدوية رقمها 1 معروف سلفاً، فتُحسم دفعة واحدة
                بعد نظرة سريعة بدل إدخال رقم واحد مئات المرات. */}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    onClick={() => setFormFilter('ALL')}
                    className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                        formFilter === 'ALL'
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                >
                    الكل
                </button>
                <button
                    onClick={() => setFormFilter('SINGLE')}
                    className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                        formFilter === 'SINGLE'
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                >
                    شكل وحدوي (التعبئة 1)
                    {singleUnitCount > 0 && (
                        <span className="mr-1.5 rounded-full bg-black/10 px-1.5 tabular-nums">{singleUnitCount}</span>
                    )}
                </button>
                {formFilter === 'SINGLE' && (
                    <span className="text-[11px] text-muted-foreground">
                        زجاجة أو أنبوب أو قطرة — العبوة وحدة واحدة بطبيعتها.
                        الأمبول والتحاميل والأكياس مستبعدة — علبتها قد تحوي عدة وحدات.
                    </span>
                )}
            </div>

            {formFilter === 'SINGLE' && selectableIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                    <button
                        onClick={() =>
                            setSelected((prev) =>
                                prev.size === selectableIds.length ? new Set() : new Set(selectableIds),
                            )
                        }
                        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-bold text-foreground hover:bg-muted"
                    >
                        {selected.size === selectableIds.length ? 'إلغاء التحديد' : `تحديد الكل (${selectableIds.length})`}
                    </button>
                    <span className="text-xs text-muted-foreground">محدد: <b className="text-foreground tabular-nums">{selected.size}</b></span>
                    <button
                        onClick={confirmSelectedAsOne}
                        disabled={selected.size === 0 || bulkSaving}
                        className="mr-auto rounded-md bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {bulkSaving ? 'جارٍ…' : `تأكيد المحدد كتعبئة 1`}
                    </button>
                </div>
            )}

            {draftedIds.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
                    <Check className="h-4 w-4 text-success" />
                    <span className="text-xs text-muted-foreground">
                        تمت كتابة التعبئة لـ <b className="text-foreground tabular-nums">{draftedIds.length}</b> أدوية
                    </span>
                    <button
                        onClick={confirmDrafts}
                        disabled={bulkSaving}
                        className="mr-auto rounded-md bg-success px-3 py-1.5 text-xs font-bold text-success-foreground hover:bg-success/90 disabled:opacity-50"
                    >
                        {bulkSaving ? 'جارٍ الحفظ…' : `تأكيد الكل (${draftedIds.length})`}
                    </button>
                </div>
            )}

            <div className="relative">
                <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                {loading && <Loader2 className="absolute left-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />}
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ابحث بالاسم أو الباركود…"
                    className="w-full rounded-lg border border-border bg-muted py-2.5 pr-9 pl-9 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
                />
            </div>

            {error && (
                <p className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {error}
                </p>
            )}

            {!loading && rows.length === 0 ? (
                <p className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                    {debounced ? 'لا نتائج مطابقة.' : 'كل أدوية مخزونك مؤكَّدة التعبئة. لا شيء ينتظر المراجعة.'}
                </p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground">
                            <tr>
                                {formFilter === 'SINGLE' && <th className="w-8 px-3 py-2.5" />}
                                <th className="px-3 py-2.5 text-right font-medium">الدواء</th>
                                <th className="px-3 py-2.5 text-right font-medium">المبيع ({movementDays} يوم)</th>
                                <th className="px-3 py-2.5 text-right font-medium">الرصيد</th>
                                <th className="px-3 py-2.5 text-right font-medium">كلفة الشريط</th>
                                <th className="px-3 py-2.5 text-right font-medium">سعر الباكيت المقترَح</th>
                                <th className="px-3 py-2.5 text-right font-medium">عدد الأشرطة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {rows.map((r) => {
                                const done = doneIds.has(r.drugId);
                                const typed = draft[r.drugId] ?? '';
                                const n = parseInt(typed, 10);
                                // سعر الباكيت يتبع ما كتبه المستخدم الآن، لا الرقم
                                // المقترَح — فيرى أثر رقمه قبل أن يحفظه.
                                const livePacket =
                                    r.lastStripCost !== null && Number.isInteger(n) && n > 0
                                        ? r.lastStripCost * n
                                        : r.derivedPacketPrice;
                                return (
                                    <tr key={r.drugId} className={done ? 'bg-success/5' : 'bg-background'}>
                                        {formFilter === 'SINGLE' && (
                                            <td className="px-3 py-2.5">
                                                <input
                                                    type="checkbox"
                                                    disabled={done}
                                                    checked={selected.has(r.drugId)}
                                                    onChange={(e) =>
                                                        setSelected((prev) => {
                                                            const next = new Set(prev);
                                                            if (e.target.checked) next.add(r.drugId);
                                                            else next.delete(r.drugId);
                                                            return next;
                                                        })
                                                    }
                                                />
                                            </td>
                                        )}
                                        <td className="px-3 py-2.5">
                                            <div className="font-medium text-foreground">{r.tradeName}</div>
                                            <div className="font-mono text-[11px] text-muted-foreground">
                                                {r.barcode || 'بلا باركود'}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 tabular-nums font-bold text-foreground">{r.movement}</td>
                                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{r.stock}</td>
                                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                                            {fmt(r.lastStripCost)}
                                        </td>
                                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                                            {fmt(livePacket)}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {done ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
                                                    <Check className="h-3.5 w-3.5" />
                                                    حُفِظ
                                                </span>
                                            ) : (
                                                <div className="flex items-center gap-1.5">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        step="1"
                                                        value={typed}
                                                        onChange={(e) =>
                                                            setDraft((p) => ({ ...p, [r.drugId]: e.target.value }))
                                                        }
                                                        placeholder={
                                                            r.suggestedUnitsPerPack !== null
                                                                ? String(r.suggestedUnitsPerPack)
                                                                : '—'
                                                        }
                                                        className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
                                                    />
                                                    <button
                                                        onClick={() => save(r)}
                                                        disabled={savingId === r.drugId}
                                                        className="rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                                    >
                                                        {savingId === r.drugId ? '…' : 'تأكيد'}
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && total > rows.length && (
                <p className="text-center text-xs text-muted-foreground">
                    يُعرض أهم {rows.length} من {total}. أكّد هذه أو ابحث عن دواء بعينه.
                </p>
            )}
            {!loading && rows.length > 0 && (
                <p className="text-center text-xs text-muted-foreground">
                    بقي في هذه الصفحة {pending} دواء.
                </p>
            )}
        </div>
    );
}
