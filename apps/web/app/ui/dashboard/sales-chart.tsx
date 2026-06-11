"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface SalesData {
    day: string;
    amount: number;
}

interface SalesChartProps {
    data: SalesData[];
    title?: string;
    /** CSS design token to color the chart (e.g. "primary", "success"). */
    colorVar?: string;
}

export default function SalesChart({ data, title = "المبيعات اليومية", colorVar = "primary" }: SalesChartProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="animate-pulse h-64 bg-muted rounded-xl" />;
    }

    const total = data.reduce((acc: any, d: any) => acc + d.amount, 0);
    const trend = data.length > 1
        ? ((data[data.length - 1].amount - data[0].amount) / (data[0].amount || 1)) * 100
        : 0;

    return (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm h-[400px] flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="font-bold text-foreground">{title}</h3>
                    <p className="text-sm text-muted-foreground">آخر {data.length} أيام</p>
                </div>
                <div className="text-left">
                    <div className="text-2xl font-bold text-foreground tabular-nums">{total.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">د.ع</span></div>
                    <div className={`flex items-center gap-1 text-sm ${trend >= 0 ? "text-success" : "text-destructive"}`}>
                        {trend >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {Math.abs(trend).toFixed(1)}%
                    </div>
                </div>
            </div>

            <div className="flex-1 w-full min-h-0" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id={`grad-${colorVar}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={`hsl(var(--${colorVar}))`} stopOpacity={0.35} />
                                <stop offset="95%" stopColor={`hsl(var(--${colorVar}))`} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis
                            dataKey="day"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                            dy={10}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                            tickFormatter={(value) => `${value}`}
                        />
                        <Tooltip
                            contentStyle={{
                                borderRadius: '12px',
                                border: '1px solid hsl(var(--border))',
                                background: 'hsl(var(--popover))',
                                color: 'hsl(var(--popover-foreground))',
                                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            }}
                            cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1 }}
                        />
                        <Area
                            type="monotone"
                            dataKey="amount"
                            stroke={`hsl(var(--${colorVar}))`}
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill={`url(#grad-${colorVar})`}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
