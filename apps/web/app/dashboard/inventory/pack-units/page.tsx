'use client';

// ميزة وحدة التسعير: شاشة حسم عدد الأشرطة للأدوية غير المؤكَّدة، مرتّبة بحركتها.
//
// التأكيد يحدث طبيعياً عند إضافة دفعة، لكن دواءً يُطلب مرة كل شهرين يبقى بلا
// تعبئة مؤكَّدة فصولاً. هذه الشاشة تسبق ذلك الانتظار، والترتيب بالبيع يجعل
// «المهم» رقماً لا انطباعاً.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Check, PackageCheck, AlertTriangle, Info, Pencil, X } from 'lucide-react';
import { toPacketPrice } from '@/app/lib/pack-units';
import TablePagination from '@/app/ui/table-pagination';
import {
    TableCard, TableToolbar, SearchField, DataTable, THead, Th, TBody, rowClass, cellClass,
    PrimaryCell, StatusPill, EmptyState, DateTimeCell, actionClass,
} from '@/app/ui/data-table';

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
    /** متى أُكِّد العدد (ISO)؛ null في قائمة غير المؤكَّدة. */
    confirmedAt: string | null;
}

const fmt = (n: number | null) =>
    n === null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function PackUnitsPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [total, setTotal] = useState(0);
    const [singleUnitCount, setSingleUnitCount] = useState(0);
    /** عدّادا الحالتين في كل المخزون، بلا بحث — للبطاقة والتبويبات. */
    const [unconfirmedCount, setUnconfirmedCount] = useState(0);
    const [confirmedCount, setConfirmedCount] = useState(0);
    /**
     * التبويب المعروض:
     * - 'ALL': كل غير المؤكَّدة.
     * - 'SINGLE': ما تعبئته 1 يقيناً (زجاجة، أنبوب، قطرة). مراجعة هذه تدقيق لا
     *   إدخال — الرقم معروف سلفاً والعين تمرّ عليه سريعاً.
     * - 'CONFIRMED': ما حُسم عدده، للاطلاع فقط.
     */
    const [view, setView] = useState<'ALL' | 'SINGLE' | 'CONFIRMED'>('ALL');
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
    /** مدير الصيدلية وحده يصحّح عدداً مؤكَّداً — القرار من الخادم، ويُعاد فحصه عند الحفظ. */
    const [canCorrect, setCanCorrect] = useState(false);
    /** الصف قيد التصحيح والرقم المكتوب له. */
    const [editing, setEditing] = useState<{ drugId: string; value: string } | null>(null);
    const [correctingId, setCorrectingId] = useState<string | null>(null);
    /** يُزاد لإعادة جلب القائمة (بعد تعارض في التصحيح). */
    const [reloadKey, setReloadKey] = useState(0);
    /**
     * الصفحة المعروضة وإزاحتها في القائمة الحية. الإزاحة لا تساوي دائماً
     * (الصفحة − 1) × حجمها: ما يُؤكَّد يخرج من قائمة غير المؤكَّدة فتتقدّم
     * الصفوف التالية، فتُطرح من إزاحة الصفحات اللاحقة كي لا يُتخطّى دواء.
     */
    const [page, setPage] = useState(1);
    const [offset, setOffset] = useState(0);
    const [pageSize, setPageSize] = useState(200);

    useEffect(() => {
        const t = setTimeout(() => {
            setDebounced(query.trim());
            setPage(1);
            setOffset(0);
        }, 300);
        return () => clearTimeout(t);
    }, [query]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const url = new URL('/api/inventory/pack-units', window.location.origin);
        if (debounced) url.searchParams.set('query', debounced);
        if (view === 'SINGLE') url.searchParams.set('form', 'SINGLE');
        if (view === 'CONFIRMED') url.searchParams.set('status', 'confirmed');
        if (offset > 0) url.searchParams.set('offset', String(offset));
        fetch(url.toString())
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (cancelled || !d) return;
                setRows(d.items ?? []);
                setPageSize(d.pageSize ?? 200);
                // علامات «حُفِظ» تخصّ الصفوف السابقة؛ المؤكَّد منها لم يعد في القائمة.
                setDoneIds(new Set());
                setTotal(d.total ?? 0);
                setUnconfirmedCount(d.unconfirmedCount ?? 0);
                setConfirmedCount(d.confirmedCount ?? 0);
                // قائمة المؤكَّدة لا تحسب الوحدوية، فيبقى عدّاد تبويبها كما كان.
                if (typeof d.singleUnitCount === 'number') setSingleUnitCount(d.singleUnitCount);
                setMovementDays(d.movementDays ?? 90);
                setCanCorrect(Boolean(d.canCorrect));
                setEditing(null);
                setSelected(new Set());
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [debounced, view, reloadKey, page, offset]);

    /**
     * يصحّح عدداً مؤكَّداً. يُرسَل الرقم المعروض (expected) فيرفض الخادم التصحيح
     * إن غيّره أحد منذ فتح الصفحة، بدل أن يدهس قراراً أحدث.
     */
    const correct = async (row: Row) => {
        if (!editing || row.suggestedUnitsPerPack === null) return;
        const n = parseInt(editing.value, 10);
        if (!Number.isInteger(n) || n <= 0) {
            setError(`اكتب عدد أشرطة صحيحاً لـ${row.tradeName}.`);
            return;
        }
        if (n === row.suggestedUnitsPerPack) { setEditing(null); return; }
        setError('');
        setCorrectingId(row.drugId);
        try {
            const res = await fetch('/api/inventory/pack-units', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drugId: row.drugId, unitsPerPack: n, expected: row.suggestedUnitsPerPack }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error ?? 'فشل تصحيح عدد الأشرطة');
                if (res.status === 409) setReloadKey((k) => k + 1);
                return;
            }
            // يُحدَّث الصف في مكانه دون إعادة ترتيب، فلا تقفز الصفوف تحت المؤشر.
            setRows((prev) => prev.map((r) => r.drugId === row.drugId
                ? {
                    ...r,
                    suggestedUnitsPerPack: n,
                    confirmedAt: data.confirmedAt ?? r.confirmedAt,
                    derivedPacketPrice: r.lastStripCost !== null ? toPacketPrice(r.lastStripCost, n) : null,
                }
                : r));
            setEditing(null);
        } finally {
            setCorrectingId(null);
        }
    };

    /** بعد كل حفظ: ينتقل العدد من «بلا تأكيد» إلى «المؤكَّدة». */
    const moveToConfirmed = (n: number) => {
        setTotal((t) => Math.max(0, t - n));
        setUnconfirmedCount((c) => Math.max(0, c - n));
        setConfirmedCount((c) => c + n);
    };

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
            moveToConfirmed(data.confirmed ?? 1);
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
            moveToConfirmed(data.confirmed ?? ids.length);
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
            moveToConfirmed(data.confirmed ?? items.length);
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

    const changeView = (next: typeof view) => {
        setView(next);
        setPage(1);
        setOffset(0);
    };

    // ما أُكِّد في هذه الصفحة خرج من القائمة الحية (في المؤكَّدة لا شيء يخرج).
    const doneHere = view === 'CONFIRMED' ? 0 : rows.length - pending;
    const remainingAfter = Math.max(0, total - offset - (rows.length - doneHere));
    const totalPages = page + Math.ceil(remainingAfter / pageSize);

    const goToPage = (target: number) => {
        if (target === page) return;
        const next = target === 1
            ? 0
            : offset + (target - page) * pageSize - (target > page ? doneHere : 0);
        setPage(target);
        setOffset(Math.max(0, next));
    };
    const draftedIds = useMemo(
        () => rows.filter((r) => !doneIds.has(r.drugId) && Number.isInteger(parseInt(draft[r.drugId] ?? '', 10)) && parseInt(draft[r.drugId] ?? '', 10) > 0).map((r) => r.drugId),
        [rows, draft, doneIds],
    );

    return (
        <div dir="rtl" className="space-y-6">
            {/* الرأس */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <PackageCheck className="w-6 h-6 text-primary" />
                        تأكيد عدد الأشرطة في الباكيت
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        مرتّبة بالأكثر مبيعاً خلال {movementDays} يوماً — الأهم أولاً.
                    </p>
                </div>
            </div>

            {/* بطاقة العدد + التنبيه */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_2fr] gap-4">
                <div className="glass-card p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                        <PackageCheck className="w-6 h-6 text-warning" />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">دواء بلا تأكيد</p>
                        <p className={`text-2xl font-bold ${unconfirmedCount > 0 ? 'text-warning' : 'text-foreground'}`}>{unconfirmedCount}</p>
                    </div>
                </div>
                <div className="glass-card p-5 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p>
                        العدد الذي تؤكّده هنا <b className="text-foreground">مشترك بين كل الصيدليات</b> ولن يُسأل عنه أحد بعدك، فاعتمد العلبة
                        نفسها لا التقدير. الرقم المقترَح مستنتَج من دفعاتك القديمة وقد لا يكون دقيقاً.
                    </p>
                </div>
            </div>

            {view === 'SINGLE' && selectableIds.length > 0 && (
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

            {error && (
                <p className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {error}
                </p>
            )}

            {/* الجدول — بنفس تصميم جدول الدفعات */}
            <TableCard>
                <TableToolbar>
                    <div className="relative flex-1 min-w-[200px]">
                        <SearchField value={query} onChange={setQuery} placeholder="ابحث بالاسم أو الباركود…" />
                        {loading && <Loader2 aria-label="جارٍ البحث" className="absolute left-3 top-3 h-4 w-4 animate-spin text-primary" />}
                    </div>
                    {/* مرشّح الشكل: الوحدوية رقمها 1 معروف سلفاً، فتُحسم دفعة واحدة
                        بعد نظرة سريعة بدل إدخال رقم واحد مئات المرات. */}
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
                        <button
                            onClick={() => changeView('ALL')}
                            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold transition-all ${
                                view === 'ALL' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-background'
                            }`}
                        >
                            بانتظار التأكيد
                            {unconfirmedCount > 0 && (
                                <span className={`text-xs rounded-full px-1.5 py-0.5 font-mono ${view === 'ALL' ? 'bg-white/20' : 'bg-muted'}`}>
                                    {unconfirmedCount}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => changeView('SINGLE')}
                            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold transition-all ${
                                view === 'SINGLE' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-background'
                            }`}
                        >
                            شكل وحدوي (التعبئة 1)
                            {singleUnitCount > 0 && (
                                <span className={`text-xs rounded-full px-1.5 py-0.5 font-mono ${view === 'SINGLE' ? 'bg-white/20' : 'bg-muted'}`}>
                                    {singleUnitCount}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => changeView('CONFIRMED')}
                            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold transition-all ${
                                view === 'CONFIRMED' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-background'
                            }`}
                        >
                            <Check className="h-4 w-4" />
                            المؤكَّدة
                            {confirmedCount > 0 && (
                                <span className={`text-xs rounded-full px-1.5 py-0.5 font-mono ${view === 'CONFIRMED' ? 'bg-white/20' : 'bg-muted'}`}>
                                    {confirmedCount}
                                </span>
                            )}
                        </button>
                    </div>
                    {!loading && (
                        <span className="text-sm text-muted-foreground">
                            {total.toLocaleString('en-US')} دواء
                        </span>
                    )}
                </TableToolbar>
                {view === 'SINGLE' && (
                    <p className="px-4 py-2 border-b border-border text-xs text-muted-foreground bg-muted/20">
                        زجاجة أو أنبوب أو قطرة — العبوة وحدة واحدة بطبيعتها.
                        الأمبول والتحاميل والأكياس مستبعدة — علبتها قد تحوي عدة وحدات.
                    </p>
                )}
                {view === 'CONFIRMED' && (
                    <p className="px-4 py-2 border-b border-border text-xs text-muted-foreground bg-muted/20">
                        أدوية مخزونك التي حُسم عدد أشرطتها، الأحدث تأكيداً أولاً. العدد مشترك بين كل الصيدليات،
                        فقد يكون أكّده صيدلاني آخر.
                        {canCorrect && ' التصحيح متاح لمدير الصيدلية، ويُطبَّق على كل الصيدليات ويُسجَّل في سجل العمليات.'}
                    </p>
                )}

                {view === 'CONFIRMED' ? (
                    !loading && rows.length === 0 ? (
                        <EmptyState
                            icon={debounced ? <Search /> : <PackageCheck />}
                            title={debounced ? 'لا توجد نتائج للبحث' : 'لا توجد أدوية مؤكَّدة التعبئة بعد'}
                            hint={debounced ? 'جرّب اسماً أو باركوداً آخر' : 'ما تؤكّده في تبويب «بانتظار التأكيد» يظهر هنا.'}
                        />
                    ) : (
                        <DataTable>
                            <THead>
                                <Th>الدواء</Th>
                                <Th>المبيع ({movementDays} يوم)</Th>
                                <Th>الرصيد</Th>
                                <Th>كلفة الشريط</Th>
                                <Th>سعر الباكيت</Th>
                                <Th>عدد الأشرطة</Th>
                                <Th>تاريخ التأكيد</Th>
                                {canCorrect && <Th center>تصحيح</Th>}
                            </THead>
                            <TBody>
                                {rows.map((r) => (
                                    <tr key={r.drugId} className={rowClass}>
                                        <td className={cellClass}>
                                            <PrimaryCell title={r.tradeName} subtitle={r.barcode || 'بلا باركود'} subtitleLtr={Boolean(r.barcode)} />
                                        </td>
                                        <td className={`${cellClass} tabular-nums font-bold text-foreground`}>{r.movement}</td>
                                        <td className={`${cellClass} tabular-nums text-muted-foreground`}>{r.stock}</td>
                                        <td className={`${cellClass} tabular-nums text-muted-foreground whitespace-nowrap`} dir="ltr">
                                            {fmt(r.lastStripCost)}
                                        </td>
                                        <td className={`${cellClass} tabular-nums font-bold text-foreground whitespace-nowrap`} dir="ltr">
                                            {fmt(r.derivedPacketPrice)}
                                        </td>
                                        <td className={cellClass}>
                                            {editing?.drugId === r.drugId ? (
                                                <div className="flex items-center gap-1.5">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        step="1"
                                                        autoFocus
                                                        value={editing.value}
                                                        onChange={(e) => setEditing({ drugId: r.drugId, value: e.target.value })}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') correct(r);
                                                            if (e.key === 'Escape') setEditing(null);
                                                        }}
                                                        title="يُطبَّق على كل الصيدليات"
                                                        className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                                                    />
                                                    <button
                                                        onClick={() => correct(r)}
                                                        disabled={correctingId === r.drugId}
                                                        className="whitespace-nowrap rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
                                                    >
                                                        {correctingId === r.drugId ? '…' : 'حفظ'}
                                                    </button>
                                                    <button onClick={() => setEditing(null)} aria-label="إلغاء" className={actionClass()}>
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <StatusPill tone="success">
                                                    <Check className="h-3.5 w-3.5" />
                                                    {r.suggestedUnitsPerPack ?? '—'}
                                                </StatusPill>
                                            )}
                                        </td>
                                        <td className={cellClass}>
                                            {r.confirmedAt ? <DateTimeCell date={r.confirmedAt} /> : '—'}
                                        </td>
                                        {canCorrect && (
                                            <td className={`${cellClass} text-center`}>
                                                {r.suggestedUnitsPerPack !== null && editing?.drugId !== r.drugId && (
                                                    <button
                                                        onClick={() => setEditing({ drugId: r.drugId, value: String(r.suggestedUnitsPerPack) })}
                                                        aria-label={`تصحيح عدد أشرطة ${r.tradeName}`}
                                                        title="تصحيح العدد (لكل الصيدليات)"
                                                        className={actionClass('warning')}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </TBody>
                        </DataTable>
                    )
                ) : !loading && rows.length === 0 ? (
                    <EmptyState
                        icon={debounced ? <Search /> : <PackageCheck />}
                        title={debounced ? 'لا توجد نتائج للبحث' : 'كل أدوية مخزونك مؤكَّدة التعبئة'}
                        hint={debounced ? 'جرّب اسماً أو باركوداً آخر' : 'لا شيء ينتظر المراجعة.'}
                    />
                ) : (
                    <DataTable>
                        <THead>
                            {view === 'SINGLE' && <Th />}
                            <Th>الدواء</Th>
                            <Th>المبيع ({movementDays} يوم)</Th>
                            <Th>الرصيد</Th>
                            <Th>كلفة الشريط</Th>
                            <Th>سعر الباكيت المقترَح</Th>
                            <Th>عدد الأشرطة</Th>
                        </THead>
                        <TBody>
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
                                    <tr key={r.drugId} className={done ? 'bg-success/5' : rowClass}>
                                        {view === 'SINGLE' && (
                                            <td className={`${cellClass} w-8`}>
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
                                        <td className={cellClass}>
                                            <PrimaryCell title={r.tradeName} subtitle={r.barcode || 'بلا باركود'} subtitleLtr={Boolean(r.barcode)} />
                                        </td>
                                        <td className={`${cellClass} tabular-nums font-bold text-foreground`}>{r.movement}</td>
                                        <td className={`${cellClass} tabular-nums text-muted-foreground`}>{r.stock}</td>
                                        <td className={`${cellClass} tabular-nums text-muted-foreground whitespace-nowrap`} dir="ltr">
                                            {fmt(r.lastStripCost)}
                                        </td>
                                        <td className={`${cellClass} tabular-nums font-bold text-foreground whitespace-nowrap`} dir="ltr">
                                            {fmt(livePacket)}
                                        </td>
                                        <td className={cellClass}>
                                            {done ? (
                                                <StatusPill tone="success">
                                                    <Check className="h-3.5 w-3.5" />
                                                    حُفِظ
                                                </StatusPill>
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
                                                        className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                                                    />
                                                    <button
                                                        onClick={() => save(r)}
                                                        disabled={savingId === r.drugId}
                                                        className="whitespace-nowrap rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
                                                    >
                                                        {savingId === r.drugId ? '…' : 'تأكيد'}
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </TBody>
                    </DataTable>
                )}

                {!loading && rows.length > 0 && view !== 'CONFIRMED' && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-border gap-2 flex-wrap text-xs text-muted-foreground">
                        <span>بقي في هذه الصفحة {pending} دواء.</span>
                    </div>
                )}
                {!loading && (
                    <TablePagination
                        currentPage={page}
                        totalPages={totalPages}
                        totalCount={total}
                        unit="دواء"
                        onPageChange={goToPage}
                    />
                )}
            </TableCard>
        </div>
    );
}
