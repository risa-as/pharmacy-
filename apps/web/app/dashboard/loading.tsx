/**
 * Dashboard loading skeleton shown while the server renders the page.
 * It renders INSIDE app/dashboard/layout.tsx, which already shows the real
 * sidebar, top bar, padding and background — so this draws the page content
 * only (no sidebar of its own, no full-screen height, no background).
 */
export default function DashboardLoading() {
    return (
        <div className="flex flex-col gap-4 animate-pulse" aria-busy="true" aria-label="جارٍ التحميل">
            {/* Page title */}
            <div className="h-8 bg-muted rounded-lg w-48" />

            {/* KPI cards row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-28 bg-muted rounded-xl" />
                ))}
            </div>

            {/* Chart area */}
            <div className="h-72 bg-muted rounded-xl" />

            {/* Table rows */}
            <div className="flex flex-col gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 bg-muted rounded-lg" style={{ opacity: 1 - i * 0.12 }} />
                ))}
            </div>
        </div>
    );
}
