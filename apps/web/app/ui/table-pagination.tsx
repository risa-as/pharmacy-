import Link from "next/link";

/**
 * Numbered pagination under a list table (batches, sales): the current page, its neighbours,
 * the first and last pages, and an ellipsis for the gaps. Server pages pass `hrefFor` (links);
 * client lists that fetch their own data pass `onPageChange` (buttons) instead.
 */
export default function TablePagination({
  currentPage,
  totalPages,
  totalCount,
  unit,
  hrefFor,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  /** Plural noun after the total, e.g. «دفعة» or «فاتورة». */
  unit: string;
  hrefFor?: (page: number) => string;
  onPageChange?: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages)
    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
      acc.push(p);
      return acc;
    }, []);

  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-border gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">
        صفحة {currentPage} من {totalPages} — {totalCount.toLocaleString("en-US")} {unit}
      </span>
      <div className="flex items-center gap-1">
        {currentPage > 1 && <PaginationLink page={currentPage - 1} label="السابق" hrefFor={hrefFor} onPageChange={onPageChange} />}
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <PaginationLink
              key={p}
              page={p}
              label={String(p)}
              active={p === currentPage}
              hrefFor={hrefFor}
              onPageChange={onPageChange}
            />
          ),
        )}
        {currentPage < totalPages && (
          <PaginationLink page={currentPage + 1} label="التالي" hrefFor={hrefFor} onPageChange={onPageChange} />
        )}
      </div>
    </div>
  );
}

function PaginationLink({
  page,
  label,
  active,
  hrefFor,
  onPageChange,
}: {
  page: number;
  label: string;
  active?: boolean;
  hrefFor?: (page: number) => string;
  onPageChange?: (page: number) => void;
}) {
  const className = `px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted border border-border"
  }`;
  if (onPageChange) {
    return (
      <button type="button" onClick={() => onPageChange(page)} className={className} aria-current={active ? "page" : undefined}>
        {label}
      </button>
    );
  }
  return (
    <Link href={hrefFor ? hrefFor(page) : "#"} className={className}>
      {label}
    </Link>
  );
}
