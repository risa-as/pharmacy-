"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface WeekdaySalesChartProps {
    data: { day: string; avg: number }[];
}

export default function WeekdaySalesChart({ data }: WeekdaySalesChartProps) {
    if (!data || data.every(d => d.avg === 0)) {
        return <div className="flex h-[220px] items-center justify-center text-muted-foreground text-sm">لا توجد بيانات كافية</div>;
    }
    const maxAvg = Math.max(...data.map(d => d.avg));
    return (
        <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                        dataKey="day"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                        formatter={(value: any) => [`${Number(value).toLocaleString()} د.ع`, 'متوسط الإيرادات']}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                        labelStyle={{ fontWeight: 'bold' }}
                    />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]} barSize={26}>
                        {data.map((entry: any, index: number) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.avg === maxAvg
                                    ? 'hsl(var(--success))'
                                    : entry.avg >= maxAvg * 0.7
                                        ? 'hsl(var(--success) / 0.5)'
                                        : 'hsl(var(--muted-foreground) / 0.3)'}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
