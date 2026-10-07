'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Banknote, Receipt, ShoppingCart, TrendingUp } from 'lucide-react';

export type PerformancePeriod = {
    key: 'today' | 'week' | 'month';
    label: string;
    /** «عن نفس الوقت أمس» … — what `change` was measured against. */
    compareLabel: string;
    revenue: number;
    salesCount: number;
    purchases: number;
    purchasesCount: number;
    expenses: number;
    net: number;
    /** Sales change in percent against the previous period; null without a baseline. */
    change: number | null;
};

function fmt(v: number) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);
}

/** All periods are computed on the server; the tabs only switch which one is shown. */
export default function PerformanceTabs({ periods }: { periods: PerformancePeriod[] }) {
    const [active, setActive] = useState(periods[0]?.key);
    const p = periods.find((x) => x.key === active) ?? periods[0];
    if (!p) return null;

    const rev = p.revenue;
    const share = (n: number) => (rev > 0 ? `${Math.round((n / rev) * 100)}٪ من المبيعات` : null);
    const positive = p.net >= 0;
    const up = (p.change ?? 0) >= 0;

    const cards = [
        {
            label: 'المبيعات', value: p.revenue, sub: `${fmt(p.salesCount)} فاتورة`, icon: ShoppingCart,
            href: '/dashboard/reports/sales', bar: 'bg-primary', chip: 'bg-primary/10 text-primary',
            badge: p.change === null ? null : `${up ? '▲' : '▼'} ${fmt(Math.abs(Math.round(p.change)))}٪ ${p.compareLabel}`,
            badgeTone: up ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
            valueTone: 'text-foreground',
        },
        {
            label: 'المشتريات', value: p.purchases, sub: `${fmt(p.purchasesCount)} فاتورة شراء`, icon: Receipt,
            href: '/dashboard/purchases', bar: 'bg-info', chip: 'bg-info/10 text-info',
            badge: share(p.purchases), badgeTone: 'bg-info/10 text-info', valueTone: 'text-foreground',
        },
        {
            label: 'المصروفات', value: p.expenses, sub: 'مصروفات تشغيلية', icon: Banknote,
            href: '/dashboard/expenses', bar: 'bg-warning', chip: 'bg-warning/10 text-warning',
            badge: share(p.expenses), badgeTone: 'bg-warning/10 text-warning', valueTone: 'text-foreground',
        },
        {
            label: 'صافي الربح', value: p.net, sub: 'بعد التكلفة والمصروفات والمرتجعات', icon: TrendingUp,
            href: '/dashboard/reports/profit',
            bar: positive ? 'bg-success' : 'bg-destructive',
            chip: positive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
            badge: rev > 0 ? `هامش ${Math.round((p.net / rev) * 100)}٪` : null,
            badgeTone: positive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
            valueTone: positive ? 'text-success' : 'text-destructive',
        },
    ];

    return (
        <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-foreground">الأداء</h2>
                <div role="tablist" aria-label="فترة الأداء" className="flex rounded-lg bg-muted p-1 text-xs font-semibold">
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((c) => {
                    const Icon = c.icon;
                    return (
                        <Link
                            key={c.label}
                            href={c.href}
                            className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                        >
                            <span className={`absolute inset-y-0 start-0 w-1 ${c.bar}`} aria-hidden="true" />
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                                    <p className={`mt-2 truncate text-2xl font-bold tabular-nums ${c.valueTone}`}>
                                        {fmt(c.value)} <span className="text-sm font-normal text-muted-foreground">د.ع</span>
                                    </p>
                                </div>
                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.chip}`}>
                                    <Icon className="h-5 w-5" />
                                </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                                <span className="truncate text-xs text-muted-foreground">{c.sub}</span>
                                {c.badge && (
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${c.badgeTone}`}>
                                        {c.badge}
                                    </span>
                                )}
                            </div>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
