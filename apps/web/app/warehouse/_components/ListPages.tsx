'use client';
export default function ListPages({ page, total, loading, error, setPage }: {
    page: number; total: number; loading: boolean; error: string; setPage: (page: number) => void;
}) {
    if (!loading && !error && total === 0) return null;
    return <div className="my-3 flex flex-wrap items-center justify-between gap-3 text-sm" aria-live="polite">
        <span>{loading ? 'جارٍ تحميل النتائج…' : error || `${total.toLocaleString('ar-IQ-u-nu-latn')} نتيجة · صفحة ${page.toLocaleString('ar-IQ-u-nu-latn')} من ${Math.max(1, Math.ceil(total / 50)).toLocaleString('ar-IQ-u-nu-latn')}`}</span>
        {total > 50 && <div className="flex gap-2">
            <button className="rounded-md border px-3 py-1.5 disabled:opacity-40" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
            <button className="rounded-md border px-3 py-1.5 disabled:opacity-40" disabled={loading || page * 50 >= total} onClick={() => setPage(page + 1)}>التالي</button>
        </div>}
    </div>;
}
