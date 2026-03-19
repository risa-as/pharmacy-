/**
 * Dashboard loading skeleton shown while the server renders the page.
 * This Suspense boundary fires during both cold-start compilation (dev mode)
 * and normal SSR hydration, preventing a fully blank white screen.
 */
export default function DashboardLoading() {
    return (
        <div className="flex h-screen flex-col md:flex-row md:overflow-hidden animate-pulse">
            {/* Sidebar skeleton */}
            <div className="hidden md:flex flex-col w-64 flex-none bg-card border-r border-border p-4 gap-4">
                <div className="h-10 bg-muted rounded-lg w-3/4" />
                <div className="flex flex-col gap-2 mt-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-9 bg-muted rounded-lg" style={{ opacity: 1 - i * 0.08 }} />
                    ))}
                </div>
            </div>

            {/* Main content skeleton */}
            <div className="flex-grow flex flex-col gap-4 p-6 bg-background overflow-hidden">
                {/* Top bar */}
                <div className="h-10 bg-muted rounded-lg w-full" />

                {/* KPI cards row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-28 bg-muted rounded-xl" />
                    ))}
                </div>

                {/* Chart area */}
                <div className="flex-1 bg-muted rounded-xl min-h-48" />

                {/* Table rows */}
                <div className="flex flex-col gap-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-10 bg-muted rounded-lg" style={{ opacity: 1 - i * 0.12 }} />
                    ))}
                </div>
            </div>
        </div>
    );
}
