"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";

interface SalesData {
    day: string;
    amount: number;
}

interface SalesChartProps {
    data: SalesData[];
    title?: string;
}

export default function SalesChart({ data, title = "المبيعات اليومية" }: SalesChartProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;
    }

    const maxAmount = Math.max(...data.map(d => d.amount), 1);
    const total = data.reduce((acc, d) => acc + d.amount, 0);
    const average = total / data.length || 0;

    // Calculate trend (compare last day with first day)
    const trend = data.length > 1
        ? ((data[data.length - 1].amount - data[0].amount) / (data[0].amount || 1)) * 100
        : 0;

    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="font-bold text-gray-800">{title}</h3>
                    <p className="text-sm text-gray-500">آخر {data.length} أيام</p>
                </div>
                <div className="text-left">
                    <div className="text-2xl font-bold text-gray-900">{total.toFixed(2)}</div>
                    <div className={`flex items-center gap-1 text-sm ${trend >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {trend >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {Math.abs(trend).toFixed(1)}%
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="flex items-end gap-2 h-40" suppressHydrationWarning>
                {data.map((item, index) => {
                    const height = (item.amount / maxAmount) * 100;
                    return (
                        <div key={index} className="flex-1 flex flex-col items-center gap-2">
                            <div
                                className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-lg transition-all hover:from-blue-600 hover:to-blue-500"
                                style={{ height: `${height}%`, minHeight: "4px" }}
                                title={`${item.amount.toFixed(2)}`}
                            />
                            <span className="text-xs text-gray-500">{item.day}</span>
                        </div>
                    );
                })}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-gray-100">
                <div className="text-center">
                    <div className="text-sm text-gray-500">المتوسط اليومي</div>
                    <div className="font-bold text-gray-800">{average.toFixed(2)}</div>
                </div>
                <div className="text-center">
                    <div className="text-sm text-gray-500">أعلى مبيعات</div>
                    <div className="font-bold text-gray-800">{maxAmount.toFixed(2)}</div>
                </div>
            </div>
        </div>
    );
}
