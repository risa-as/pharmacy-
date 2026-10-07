'use client';

// منتقي الدواء لصفحة «إضافة للمخزون»: بحث في الخادم أثناء الكتابة بدل تحميل
// الكتالوج كاملاً في <select>. يعمل مع قارئ الباركود: Enter يختار النتيجة
// المظلّلة ولا يرسل النموذج.
//
// Enter قبل وصول نتائج النص الحالي (القارئ يرسله فور آخر رقم، أو كتابة سريعة)
// لا يختار من نتائج نص سابق: يُؤجَّل، وعند وصول النتائج يُختار تلقائياً فقط
// صنف باركوده مطابق تماماً — تشابه الاسم وحده لا يختار دواءً.
import { useEffect, useId, useRef, useState } from 'react';
import { Barcode, Check, Loader2, PackageX, Pill, Search, X } from 'lucide-react';
import type { DrugOption } from '@/app/api/inventory/drug-options/route';

const MIN_QUERY = 2;

export default function DrugCombobox({
    branchId,
    value,
    onChange,
    invalid,
}: {
    branchId: string;
    value: DrugOption | null;
    onChange: (drug: DrugOption | null) => void;
    invalid?: boolean;
}) {
    const listId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<DrugOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    // النص الذي تخصّه `results`؛ يختلف عن النص الحالي حتى تصل النتائج الجديدة.
    const [resultsFor, setResultsFor] = useState('');
    const pendingEnter = useRef(false);

    useEffect(() => {
        const q = query.trim();
        pendingEnter.current = false;
        if (q.length < MIN_QUERY) {
            setResults([]);
            setSearched(false);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        const timer = setTimeout(async () => {
            try {
                const params = new URLSearchParams({ query: q });
                if (branchId) params.set('branchId', branchId);
                const res = await fetch(`/api/inventory/drug-options?${params}`, { signal: controller.signal });
                const data = await res.json();
                const items: DrugOption[] = res.ok ? data.items ?? [] : [];
                if (pendingEnter.current) {
                    pendingEnter.current = false;
                    const scanned = items.find((d) => d.barcode === q && !d.inBranch);
                    if (scanned) { pick(scanned); setLoading(false); return; }
                    setOpen(true);
                }
                setResults(items);
                setResultsFor(q);
                setActive(Math.max(0, items.findIndex((d) => !d.inBranch)));
                setSearched(true);
                setLoading(false);
            } catch (e) {
                if ((e as Error).name === 'AbortError') return;
                pendingEnter.current = false;
                setResults([]);
                setResultsFor(q);
                setSearched(true);
                setLoading(false);
            }
        }, 250);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [query, branchId]);

    // تغيير الفرع: الصنف المختار قد يكون موجوداً في مخزون الفرع الجديد.
    useEffect(() => {
        if (!value || !branchId) return;
        const controller = new AbortController();
        fetch(`/api/inventory/drug-options?${new URLSearchParams({ query: value.barcode || value.tradeName, branchId })}`, { signal: controller.signal })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                const match = (data?.items as DrugOption[] | undefined)?.find((d) => d.id === value.id);
                if (match && match.inBranch !== value.inBranch) onChange(match);
            })
            .catch(() => {});
        return () => controller.abort();
    }, [branchId]);

    const pick = (drug: DrugOption) => {
        if (drug.inBranch) return;
        onChange(drug);
        setQuery('');
        setResults([]);
        setResultsFor('');
        setSearched(false);
        setOpen(false);
    };

    const move = (step: number) => {
        if (!results.length) return;
        let i = active;
        for (let n = 0; n < results.length; n++) {
            i = (i + step + results.length) % results.length;
            if (!results[i].inBranch) break;
        }
        setActive(i);
        document.getElementById(`${listId}-${i}`)?.scrollIntoView({ block: 'nearest' });
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const q = query.trim();
            if (q.length < MIN_QUERY) return;
            if (loading || resultsFor !== q) { pendingEnter.current = true; return; }
            const drug = results[active];
            if (drug) pick(drug);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            move(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            move(-1);
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    if (value) {
        return (
            <div className={`flex items-center gap-3 rounded-lg border bg-primary/5 px-4 py-3 ${value.inBranch ? 'border-destructive/50' : 'border-primary/30'}`}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Pill className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-foreground">{value.tradeName}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {value.scientificName && <span className="truncate">{value.scientificName}</span>}
                        <span className="font-mono" dir="ltr">{value.barcode || 'بلا باركود'}</span>
                    </p>
                    {value.inBranch && (
                        <p className="mt-1 text-xs font-semibold text-destructive">هذا الدواء موجود بالفعل في مخزون الفرع المختار.</p>
                    )}
                </div>
                <button
                    id="drugSearch"
                    type="button"
                    onClick={() => { onChange(null); requestAnimationFrame(() => inputRef.current?.focus()); }}
                    className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <X className="h-3.5 w-3.5" />
                    تغيير
                </button>
            </div>
        );
    }

    const q = query.trim();
    const showList = open && q.length >= MIN_QUERY && (results.length > 0 || searched);

    return (
        <div className="relative">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            {loading
                ? <Loader2 className="absolute end-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                : <Barcode className="pointer-events-none absolute end-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />}
            <input
                ref={inputRef}
                id="drugSearch"
                type="text"
                role="combobox"
                aria-expanded={showList}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
                autoComplete="off"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onKeyDown={onKeyDown}
                placeholder="ابحث بالاسم التجاري أو العلمي أو امسح الباركود…"
                className={`w-full rounded-lg border bg-background py-3 pe-10 ps-10 text-foreground outline-none transition-colors focus:ring-2 ${invalid ? 'border-destructive focus:ring-destructive/20' : 'border-border focus:border-ring focus:ring-ring/20'}`}
            />
            {q.length > 0 && q.length < MIN_QUERY && (
                <p className="mt-1.5 text-xs text-muted-foreground">اكتب حرفين على الأقل للبحث.</p>
            )}

            {showList && (
                <div className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                    {results.length === 0 ? (
                        <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                            <PackageX className="h-4 w-4 shrink-0" />
                            لا يوجد دواء مطابق. أضف الدواء من صفحة الأدوية أولاً إن كان جديداً.
                        </div>
                    ) : (
                        <ul id={listId} role="listbox" className="max-h-80 divide-y divide-border overflow-y-auto">
                            {results.map((d, i) => (
                                <li
                                    key={d.id}
                                    id={`${listId}-${i}`}
                                    role="option"
                                    aria-selected={i === active}
                                    aria-disabled={d.inBranch}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onMouseEnter={() => !d.inBranch && setActive(i)}
                                    onClick={() => pick(d)}
                                    className={`flex items-center gap-3 px-4 py-2.5 ${d.inBranch ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${i === active && !d.inBranch ? 'bg-primary/10' : ''}`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-foreground">{d.tradeName}</p>
                                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                            {d.scientificName && <span className="truncate">{d.scientificName}</span>}
                                            <span className="font-mono" dir="ltr">{d.barcode || 'بلا باركود'}</span>
                                            {d.origin && <span>· {d.origin}</span>}
                                        </p>
                                    </div>
                                    {d.inBranch ? (
                                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">موجود في مخزون الفرع</span>
                                    ) : i === active ? (
                                        <Check className="h-4 w-4 shrink-0 text-primary" />
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
