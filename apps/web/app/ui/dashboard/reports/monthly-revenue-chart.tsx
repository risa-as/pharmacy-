"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface MonthlyRevenueChartProps {
    data: { month: string; revenue: number }[];
    currentMonthIndex: number;
}

export default function MonthlyRevenueChart({ data, currentMonthIndex }: MonthlyRevenueChartProps) {
    if (!data || data.length === 0) {
        return <div className="flex h-[220px] items-center justify-center text-muted-foreground text-sm">لا توجد بيانات كافية</div>;
    }
    return (
        <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : v}
                        width={45}
                    />
                    <Tooltip
                        formatter={(value: any) => [`${Number(value).toLocaleString()} د.ع`, 'الإيرادات']}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                        labelStyle={{ fontWeight: 'bold' }}
                    />
                    <Bar dataKey="revenue" radius={[4, 4, 0, 0]} barSize={32}>
                        {data.map((_: any, index: number) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={index === currentMonthIndex ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.3)'}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
