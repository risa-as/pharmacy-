'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

interface ChartProps {
    data: { date: string; total: number }[];
}

export default function EmployeeSalesChart({ data }: ChartProps) {
    if (data.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-muted-foreground">
                لا توجد بيانات كافية للرسم البياني
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis
                    dataKey="date"
                    tickFormatter={(val) => format(new Date(val), 'dd MMM')}
                    stroke="#9CA3AF"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                />
                <YAxis
                    stroke="#9CA3AF"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `${val / 1000}k`}
                />
                <Tooltip
                    cursor={{ stroke: '#3B82F6', strokeWidth: 1, strokeDasharray: '4 4' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelFormatter={(val) => format(new Date(val), 'dd MMMM yyyy', { locale: ar })}
                    formatter={(val: any) => [`${(val || 0).toLocaleString()} د.ع`, 'المبيعات']}
                />
                <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#3B82F6"
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                    strokeWidth={3}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
