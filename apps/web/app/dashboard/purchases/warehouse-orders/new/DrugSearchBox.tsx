'use client';

// المرحلة 3: بحث الأدوية لقائمة الاحتياج.
//
// قواعد ملزمة من الخطة مطبَّقة هنا:
//  §65 بحث بالاسم التجاري والعلمي والباركود، بتأخير قصير وإلغاء نتيجة قديمة.
//  §66 النتائج تُظهر ما يميّز الصنف، ولا يُختار دواء تلقائياً عند تشابه الاسم.
//  §67 النص الحر غير المطابق يبقى بحثاً ولا يتحوّل إلى صنف قابل للإرسال.
//  §68 لا يُحصر البحث في الأصناف ذات المخزون الموجب — الدواء النافد أول ما يُطلب.
//      الافتراضي أدوية مخزونك (بما فيها النافدة)؛ كتالوج المنصة كاملاً بخيار صريح
//      لطلب دواء جديد لم تخزّنه من قبل.
import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, PackageX, AlertTriangle } from 'lucide-react';
import type { DrugSearchResult } from './types';

const MIN_QUERY = 2;

export default function DrugSearchBox({
    onPick,
    disabled,
}: {
    onPick: (drug: DrugSearchResult) => void;
    disabled?: boolean;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<DrugSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [catalogWide, setCatalogWide] = useState(false);
    // رقم متزايد لكل طلب: استجابة طلب أقدم تُهمَل إن صدر بعده طلب أحدث، فلا
    // تستبدل نتائج بطيئة نتائجَ أحدث منها (§394).
    const requestSeq = useRef(0);

    useEffect(() => {
        const mySeq = ++requestSeq.current;
        const q = query.trim();
        if (q.length < MIN_QUERY) {
            setResults([]);
            setSearched(false);
            setLoading(false);
            return;
        }

        setLoading(true);
        const timer = setTimeout(async () => {
            try {
                const url = new URL('/api/purchases/drug-search', window.location.origin);
                url.searchParams.set('query', q);
                if (catalogWide) url.searchParams.set('scope', 'all');
                const res = await fetch(url.toString());
                const data = await res.json();
                if (mySeq !== requestSeq.current) return; // نتيجة قديمة — تُهمَل
                setResults(res.ok ? data.items ?? [] : []);
                setSearched(true);
            } catch {
                if (mySeq === requestSeq.current) {
                    setResults([]);
                    setSearched(true);
                }
            } finally {
                if (mySeq === requestSeq.current) setLoading(false);
            }
        }, 300);

        return () => { clearTimeout(timer); requestSeq.current++; };
    }, [query, catalogWide]);

    return (
        <div className="space-y-3">
            <div className="relative">
                <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                {loading && <Loader2 className="absolute left-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />}
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={disabled}
                    placeholder="اكتب اسم الدواء أو مادته الفعالة أو باركوده…"
                    className="w-full rounded-lg border border-border bg-muted py-2.5 pr-9 pl-9 text-sm outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                />
            </div>

            <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
                <input
                    type="checkbox"
                    checked={catalogWide}
                    onChange={(e) => setCatalogWide(e.target.checked)}
                    disabled={disabled}
                />
                البحث أيضاً في أدوية المنصة غير الموجودة في مخزوني (لطلب دواء جديد)
            </label>

            {query.trim().length > 0 && query.trim().length < MIN_QUERY && (
                <p className="text-xs text-muted-foreground">اكتب حرفين على الأقل للبحث.</p>
            )}

            {searched && results.length === 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                    <PackageX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        {catalogWide
                            ? 'لا صنف مطابق في كتالوج المنصة. الكتابة الحرة وحدها لا تُنشئ صنفاً — أضف الدواء من صفحة الأدوية أولاً.'
                            : 'لا صنف مطابق في مخزونك. إن كان دواءً جديداً لم تخزّنه من قبل، فعّل «البحث أيضاً في أدوية المنصة» أعلاه.'}
                    </span>
                </div>
            )}

            {results.length > 0 && (
                <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                    {results.map((d) => (
                        <li key={d.id}>
                            <button
                                onClick={() => onPick(d)}
                                disabled={disabled}
                                className="flex w-full items-start justify-between gap-3 bg-background px-3 py-2.5 text-right transition-colors hover:bg-muted/50 disabled:opacity-50"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-foreground">
                                        {d.tradeName}
                                    </span>
                                    {d.scientificName && (
                                        <span className="block truncate text-xs text-muted-foreground">{d.scientificName}</span>
                                    )}
                                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                                        <span className="font-mono">{d.barcode || 'بلا باركود'}</span>
                                        {d.origin && <span>· {d.origin}</span>}
                                        {d.isOrgPrivate && (
                                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-600">صنف خاص بمؤسستك</span>
                                        )}
                                    </span>
                                </span>
                                <span className="shrink-0 text-left">
                                    {d.inInventory === false ? (
                                        <span className="block rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                            ليس في مخزونك
                                        </span>
                                    ) : (
                                        <span
                                            className={`block text-xs font-bold tabular-nums ${
                                                d.currentStock > 0 ? 'text-foreground' : 'text-destructive'
                                            }`}
                                        >
                                            {d.currentStock > 0 ? `الرصيد ${d.currentStock}` : 'نفد'}
                                        </span>
                                    )}
                                    {d.orderabilityReason && (
                                        <span className="mt-1 flex items-center gap-1 text-[11px] text-amber-600">
                                            <AlertTriangle className="h-3 w-3" />
                                            غير قابل للإرسال
                                        </span>
                                    )}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
