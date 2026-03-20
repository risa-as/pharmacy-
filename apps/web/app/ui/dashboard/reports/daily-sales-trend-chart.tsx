"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface DailySalesTrendChartProps {
    data: { date: string; revenue: number }[];
}

export default function DailySalesTrendChart({ data }: DailySalesTrendChartProps) {
    if (!data || data.length === 0) {
        return <div className="flex h-[240px] items-center justify-center text-muted-foreground text-sm">لا توجد بيانات كافية</div>;
    }
    return (
        <div className="w-full h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <defs>
                        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        interval={4}
                    />
                    <YAxis
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v}
                        width={40}
                    />
                    <Tooltip
                        formatter={(value: any) => [`${Number(value).toLocaleString()} د.ع`, 'الإيرادات']}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                        labelStyle={{ fontWeight: 'bold' }}
                    />
                    <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fill="url(#revenueGradient)"
                        dot={false}
                        activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
