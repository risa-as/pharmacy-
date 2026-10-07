'use client';

import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Point = { day: string; sales: number; profit: number };

const fmt = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);

/** Sales and net profit for the same days on one chart. */
export default function SalesProfitChart({ data }: { data: Point[] }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    return (
        <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-foreground">المبيعات وصافي الربح — آخر 7 أيام</h2>
                <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" />المبيعات</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-success" />صافي الربح</span>
                </div>
            </div>
            <div className="h-64 w-full" dir="ltr">
                {!mounted ? (
                    <div className="h-full animate-pulse rounded-lg bg-muted" />
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                            <defs>
                                <linearGradient id="grad-sales" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="day" reversed axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} dy={8} />
                            <YAxis orientation="right" axisLine={false} tickLine={false} width={70} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={fmt} />
                            <Tooltip
                                formatter={(value, name) => [`${fmt(Number(value))} د.ع`, name === 'sales' ? 'المبيعات' : 'صافي الربح']}
                                contentStyle={{
                                    borderRadius: '12px',
                                    border: '1px solid hsl(var(--border))',
                                    background: 'hsl(var(--popover))',
                                    color: 'hsl(var(--popover-foreground))',
                                    direction: 'rtl',
                                }}
                                cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1 }}
                            />
                            <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#grad-sales)" />
                            <Area type="monotone" dataKey="profit" stroke="hsl(var(--success))" strokeWidth={2.5} fill="transparent" />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
