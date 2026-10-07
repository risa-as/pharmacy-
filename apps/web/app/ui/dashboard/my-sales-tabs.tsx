'use client';

import { useState } from 'react';
import { ShoppingCart, TrendingUp, Undo2 } from 'lucide-react';
import StatCard from '@/app/ui/dashboard/stat-card';

export type MySalesPeriod = {
    key: 'today' | 'week' | 'month';
    label: string;
    /** «عن نفس الوقت أمس» … — what `change` was measured against. */
    compareLabel: string;
    revenue: number;
    salesCount: number;
    returns: number;
    returnsCount: number;
    net: number;
    /** Sales change in percent against the previous period; null without a baseline. */
    change: number | null;
};

const fmt = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);

/** The employee's own sales; all periods come from the server, the tabs only switch. */
export default function MySalesTabs({ periods }: { periods: MySalesPeriod[] }) {
    const [active, setActive] = useState(periods[0]?.key);
    const p = periods.find((x) => x.key === active) ?? periods[0];
    if (!p) return null;
    const up = (p.change ?? 0) >= 0;

    return (
        <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-foreground">مبيعاتي</h2>
                <div role="tablist" aria-label="فترة المبيعات" className="flex rounded-lg bg-muted p-1 text-xs font-semibold">
                    {periods.map((x) => (
                        <button
                            key={x.key}
                            type="button"
                            role="tab"
                            aria-selected={x.key === p.key}
                            onClick={() => setActive(x.key)}
                            className={`rounded-md px-3 py-1.5 transition-colors ${x.key === p.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {x.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                    label="المبيعات" value={fmt(p.revenue)} unit="د.ع" icon={ShoppingCart} tone="primary" bar
                    footer={
                        <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-muted-foreground">{fmt(p.salesCount)} فاتورة</span>
                            {p.change !== null && (
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${up ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                                    {up ? '▲' : '▼'} {fmt(Math.abs(Math.round(p.change)))}٪ {p.compareLabel}
                                </span>
                            )}
                        </div>
                    }
                />
                <StatCard
                    label="المرتجعات" value={fmt(p.returns)} unit="د.ع" icon={Undo2} tone="warning" bar
                    footer={<span className="text-xs text-muted-foreground">{fmt(p.returnsCount)} مرتجع</span>}
                />
                <StatCard
                    label="الصافي" value={fmt(p.net)} unit="د.ع" icon={TrendingUp} tone="success" bar
                    valueClassName={p.net >= 0 ? 'text-success' : 'text-destructive'}
                    footer={<span className="text-xs text-muted-foreground">المبيعات بعد المرتجعات</span>}
                />
            </div>
        </section>
    );
}
