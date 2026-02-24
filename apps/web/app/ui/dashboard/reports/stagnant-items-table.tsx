"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Package, Filter, AlertCircle } from "lucide-react";

interface StagnantItem {
    id: string;
    tradeName: string;
    stock: number;
    lastSaleDate: Date | null;
    daysSinceLastSale: number;
}

interface StagnantItemsTableProps {
    items: StagnantItem[];
    currentPeriod: number;
}

export default function StagnantItemsTable({ items, currentPeriod }: StagnantItemsTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("stagnantPeriod", e.target.value);
        router.push(`?${params.toString()}`, { scroll: false });
    };

    return (
        <div className="bg-transparent rounded-xl border border-border shadow-sm overflow-hidden">
            {/* Header & Filter */}
            <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-destructive" />
                        الأصناف الراكدة
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        أصناف لم تبع خلال الفترة المحددة ولديها رصيد مخزني
                    </p>
                </div>

                <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-lg border border-border">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">لم تبع منذ:</span>
                    <select
                        value={currentPeriod}
                        onChange={handlePeriodChange}
                        className="bg-transparent border-none text-sm font-bold text-foreground focus:ring-0 cursor-pointer"
                    >
                        <option value="30">30 يوم</option>
                        <option value="60">60 يوم</option>
                        <option value="90">90 يوم</option>
                        <option value="120">120 يوم</option>
                        <option value="180">180 يوم</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-right">
                    <thead className="bg-card/50 text-muted-foreground text-sm">
                        <tr>
                            <th className="px-6 py-4">اسم الصنف</th>
                            <th className="px-6 py-4 text-center">الرصيد الحالي</th>
                            <th className="px-6 py-4">آخر عملية بيع</th>
                            <th className="px-6 py-4 text-center">مدة الركود</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {items.map((item) => (
                            <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                                <td className="px-6 py-4 font-medium text-foreground">
                                    <div className="flex items-center gap-2">
                                        <Package className="w-4 h-4 text-muted-foreground" />
                                        {item.tradeName}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.stock > 50 ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'
                                        }`}>
                                        {item.stock}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-muted-foreground text-sm">
                                    {item.lastSaleDate ? (
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(item.lastSaleDate).toLocaleDateString('ar-IQ')}
                                        </div>
                                    ) : (
                                        <span className="text-muted-foreground/60">لا يوجد مبيعات</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-center font-bold text-destructive">
                                    {item.daysSinceLastSale > 365 ? 'أكثر من سنة' : `${item.daysSinceLastSale} يوم`}
                                </td>
                            </tr>
                        ))}
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-muted-foreground">
                                    ممتاز! لا توجد أصناف راكدة خلال هذه الفترة ({currentPeriod} يوم).
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="bg-muted/30 p-3 border-t border-border text-xs text-center text-muted-foreground">
                يعرض التقرير فقط الأصناف التي تحتوي على رصيد مخزني أكبر من صفر
            </div>
        </div>
    );
}
