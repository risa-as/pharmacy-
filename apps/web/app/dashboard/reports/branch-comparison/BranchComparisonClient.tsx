'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, TrendingUp, TrendingDown, Store } from 'lucide-react';
import { exportToExcel } from '@/app/lib/excel-export';

export default function BranchComparisonClient() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('monthly');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            let url = `/api/reports/branch-comparison?period=${period}`;
            if (period === 'custom' && from && to) url += `&from=${from}&to=${to}`;
            const res = await fetch(url);
            const json = await res.json();
            setData(json);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [period, from, to]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const fmt = (v: number) => new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 0 }).format(v) + ' د.ع';

    const handleExport = () => {
        if (!data?.comparison) return;
        exportToExcel(data.comparison, [
            { header: 'الفرع', key: 'branchName', width: 20 },
            { header: 'المبيعات', key: 'revenue', width: 15 },
            { header: 'التكلفة', key: 'cogs', width: 15 },
            { header: 'المصروفات', key: 'expenses', width: 15 },
            { header: 'المرتجعات', key: 'returns', width: 15 },
            { header: 'صافي الربح', key: 'netProfit', width: 15 },
            { header: 'هامش الربح %', key: 'profitMargin', width: 12 },
            { header: 'عدد الفواتير', key: 'salesCount', width: 12 },
        ], 'مقارنة_الفروع', 'مقارنة');
    };

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-foreground">📊 مقارنة الفروع</h1>
                <button onClick={handleExport}
                    className="flex items-center gap-1 px-3 py-2 bg-success text-success-foreground rounded-lg text-sm hover:bg-success/90">
                    <Download className="w-4 h-4" /> تصدير Excel
                </button>
            </div>

            {/* Filter */}
            <div className="bg-card rounded-xl shadow-sm border p-4 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="block text-sm text-muted-foreground mb-1">الفترة</label>
                    <select value={period} onChange={(e) => setPeriod(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm bg-muted">
                        <option value="daily">اليوم</option>
                        <option value="weekly">آخر 7 أيام</option>
                        <option value="monthly">هذا الشهر</option>
                        <option value="custom">مخصص</option>
                    </select>
                </div>
                {period === 'custom' && (
                    <>
                        <div>
                            <label className="block text-sm text-muted-foreground mb-1">من</label>
                            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                                className="border rounded-lg px-3 py-2 text-sm bg-muted" />
                        </div>
                        <div>
                            <label className="block text-sm text-muted-foreground mb-1">إلى</label>
                            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                                className="border rounded-lg px-3 py-2 text-sm bg-muted" />
                        </div>
                    </>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
            ) : data?.comparison?.length > 0 ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {data.comparison.map((b: any, i: number) => (
                            <div key={b.branchId} className={`bg-card rounded-xl border shadow-sm p-5 ${i === 0 ? 'ring-2 ring-blue-400' : ''}`}>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${i === 0 ? 'bg-primary/10' : 'bg-muted'}`}>
                                        <Store className={`w-5 h-5 ${i === 0 ? 'text-primary' : 'text-muted-foreground'}`} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-foreground">{b.branchName}</h3>
                                        {i === 0 && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">الأعلى مبيعاً</span>}
                                    </div>
                                </div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between"><span className="text-muted-foreground">المبيعات</span><span className="font-bold text-primary">{fmt(b.revenue)}</span></div>
                                    <div className="flex justify-between"><span className="text-muted-foreground">التكلفة</span><span className="text-warning">{fmt(b.cogs)}</span></div>
                                    <div className="flex justify-between"><span className="text-muted-foreground">المصروفات</span><span className="text-destructive">{fmt(b.expenses)}</span></div>
                                    <div className="flex justify-between"><span className="text-muted-foreground">المرتجعات</span><span className="text-warning">{fmt(b.returns)}</span></div>
                                    <div className="flex justify-between border-t pt-2 mt-2">
                                        <span className="text-foreground font-medium">صافي الربح</span>
                                        <span className={`font-bold flex items-center gap-1 ${b.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                                            {b.netProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                            {fmt(b.netProfit)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">هامش الربح</span>
                                        <span className={`font-bold ${b.profitMargin >= 0 ? 'text-success' : 'text-destructive'}`}>{b.profitMargin}%</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                        <span>{b.salesCount} فاتورة</span>
                                        <span>{b.inventoryCount} منتج</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-muted border-b">
                                    <th className="text-right py-3 px-4 font-bold text-muted-foreground">الفرع</th>
                                    <th className="text-right py-3 px-4 font-bold text-primary">المبيعات</th>
                                    <th className="text-right py-3 px-4 font-bold text-warning">التكلفة</th>
                                    <th className="text-right py-3 px-4 font-bold text-destructive">المصروفات</th>
                                    <th className="text-right py-3 px-4 font-bold text-success">صافي الربح</th>
                                    <th className="text-right py-3 px-4 font-bold text-info">هامش %</th>
                                    <th className="text-right py-3 px-4 font-bold text-muted-foreground">الفواتير</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.comparison.map((b: any) => (
                                    <tr key={b.branchId} className="border-b hover:bg-muted/50">
                                        <td className="py-3 px-4 font-bold">{b.branchName}</td>
                                        <td className="py-3 px-4 text-primary">{fmt(b.revenue)}</td>
                                        <td className="py-3 px-4 text-warning">{fmt(b.cogs)}</td>
                                        <td className="py-3 px-4 text-destructive">{fmt(b.expenses)}</td>
                                        <td className={`py-3 px-4 font-bold ${b.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(b.netProfit)}</td>
                                        <td className="py-3 px-4 text-info">{b.profitMargin}%</td>
                                        <td className="py-3 px-4 text-muted-foreground">{b.salesCount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            ) : (
                <div className="text-center py-20 text-muted-foreground">لا توجد بيانات للفترة المحددة</div>
            )}
        </div>
    );
}
