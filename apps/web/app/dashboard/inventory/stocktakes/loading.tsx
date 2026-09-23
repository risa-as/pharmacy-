export default function StocktakeLoading() {
  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-border bg-card p-6 space-y-4">
      <p className="font-semibold text-foreground">جاري تحميل الجرد…</p>
      <div aria-hidden="true" className="animate-pulse space-y-3">
        <div className="h-12 rounded-lg bg-muted" />
        <div className="h-32 rounded-lg bg-muted" />
      </div>
    </div>
  );
}
