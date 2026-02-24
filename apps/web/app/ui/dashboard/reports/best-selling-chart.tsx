"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface BestSellingChartProps {
    data: {
        name: string;
        quantity: number;
        total: number;
    }[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1', '#a4de6c', '#d0ed57'];

export default function BestSellingChart({ data }: BestSellingChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                لا توجد بيانات كافية للعرض
            </div>
        );
    }

    return (
        <div className="w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" hide />
                    <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{ fontSize: 12 }}
                        interval={0}
                    />
                    <Tooltip
                        formatter={(value: any, name: any) => [
                            name === 'total' ? `${(value || 0).toLocaleString()} د.ع` : value,
                            name === 'total' ? 'الإجمالي' : 'الكمية'
                        ]}
                        labelStyle={{ textAlign: 'right', fontWeight: 'bold' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="quantity" name="الكمية" radius={[0, 4, 4, 0]} barSize={20}>
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
