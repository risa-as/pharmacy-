"use client";

import { useState, useEffect } from "react";
import { PieChart, Wallet, CreditCard, Smartphone, Clock } from "lucide-react";

interface RevenueData {
    cash: number;
    card: number;
    mobile: number;
    total: number;
}

interface RevenueWidgetProps {
    data: RevenueData;
    title?: string;
}

export default function RevenueWidget({ data, title = "إيرادات اليوم" }: RevenueWidgetProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="animate-pulse h-48 bg-muted rounded-xl" />;
    }

    const methods = [
        { label: "نقداً", value: data.cash, icon: Wallet, color: "bg-success", bgLight: "bg-success/10", textColor: "text-success", iconColor: "text-success-foreground" },
        { label: "بطاقة", value: data.card, icon: CreditCard, color: "bg-primary", bgLight: "bg-primary/10", textColor: "text-primary", iconColor: "text-primary-foreground" },
        { label: "محفظة", value: data.mobile, icon: Smartphone, color: "bg-info", bgLight: "bg-info/10", textColor: "text-info", iconColor: "text-info-foreground" },
    ];

    return (
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-foreground flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-primary" />
                    {title}
                </h3>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    اليوم
                </div>
            </div>

            {/* Total */}
            <div className="text-center mb-6 py-4 bg-gradient-to-r from-primary/5 to-info/5 rounded-xl">
                <div className="text-sm text-muted-foreground mb-1">إجمالي الإيرادات</div>
                <div className="text-3xl font-bold text-foreground">{data.total.toFixed(2)}</div>
            </div>

            {/* Breakdown */}
            <div className="space-y-3">
                {methods.map((method: any, index: any) => {
                    const percent = data.total > 0 ? (method.value / data.total) * 100 : 0;
                    const Icon = method.icon;
                    return (
                        <div key={index} className={`flex items-center gap-3 p-3 rounded-lg ${method.bgLight}`}>
                            <div className={`w-8 h-8 ${method.color} rounded-lg flex items-center justify-center`}>
                                <Icon className={`w-4 h-4 ${method.iconColor}`} />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground">{method.label}</span>
                                    <span className={`text-sm font-bold ${method.textColor}`}>
                                        {method.value.toFixed(2)}
                                    </span>
                                </div>
                                <div className="h-1.5 bg-card rounded-full mt-1 overflow-hidden">
                                    <div
                                        className={`h-full ${method.color} rounded-full`}
                                        style={{ width: `${percent}%` }}
                                    />
                                </div>
                            </div>
                            <span className="text-xs text-muted-foreground w-10 text-left">
                                {percent.toFixed(0)}%
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
