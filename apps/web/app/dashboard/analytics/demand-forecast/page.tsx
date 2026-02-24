'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, AlertTriangle, Package, ShoppingCart, Download } from 'lucide-react';
import { exportToExcel } from '@/app/lib/excel-export';

export default function DemandForecastPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/analytics/demand-forecast?days=${days}`)
            .then(r => r.json())
            .then(d => setData(d))
            .finally(() => setLoading(false));
    }, [days]);

    const fmt = (v: number) => new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 0 }).format(v);

    const urgencyBadge = (urgency: string) => {
        switch (urgency) {
            case 'critical': return 'bg-destructive/10 text-destructive border-red-200';
            case 'warning': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            default: return 'bg-success/10 text-success border-green-200';
        }
    };

    const urgencyLabel = (urgency: string) => {
        switch (urgency) {
            case 'critical': return '🔴 حرج';
            case 'warning': return '🟡 تحذير';
            default: return '🟢 طبيعي';
        }
    };

    const handleExport = () => {
        if (!data?.forecasts) return;
        exportToExcel(data.forecasts.map((f: any) => ({
            ...f,
            urgencyText: urgencyLabel(f.urgency).replace(/🔴|🟡|🟢/g, '').trim()
        })), [
            { header: 'الدواء', key: 'drugName', width: 25 },
            { header: 'مبيعات 90 يوم', key: 'totalSold90Days', width: 12 },
            { header: 'معدل يومي', key: 'dailyAverage', width: 10 },
            { header: 'طلب متوقع', key: 'predictedDemand', width: 12 },
            { header: 'المخزون الحالي', key: 'currentStock', width: 12 },
            { header: 'أيام حتى النفاد', key: 'daysUntilStockout', width: 14 },
            { header: 'طلب مقترح', key: 'suggestedOrder', width: 12 },
            { header: 'الثقة %', key: 'confidence', width: 8 },
            { header: 'الحالة', key: 'urgencyText', width: 10 },
        ], 'تنبؤ_الطلب', 'التنبؤ');
    };

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-foreground">🤖 تنبؤ الطلب بالذكاء الاصطناعي</h1>
                <div className="flex items-center gap-3">
                    <select value={days} onChange={e => setDays(Number(e.target.value))}
                        className="border rounded-lg px-3 py-2 text-sm bg-muted">
                        <option value={7}>7 أيام</option>
                        <option value={14}>14 يوم</option>
                        <option value={30}>30 يوم</option>
                        <option value={60}>60 يوم</option>
                        <option value={90}>90 يوم</option>
                    </select>
                    <button onClick={handleExport}
                        className="flex items-center gap-1 px-3 py-2 bg-success text-white rounded-lg text-sm hover:bg-green-700">
                        <Download className="w-4 h-4" /> تصدير
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                </div>
            ) : data?.forecasts?.length > 0 ? (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-destructive/10 border border-red-100 rounded-xl p-4">
                            <div className="text-sm text-destructive mb-1 font-medium">حرج (≤7 أيام)</div>
                            <div className="text-2xl font-bold text-destructive">
                                {data.forecasts.filter((f: any) => f.urgency === 'critical').length}
                            </div>
                        </div>
                        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                            <div className="text-sm text-yellow-600 mb-1 font-medium">تحذير (≤14 يوم)</div>
                            <div className="text-2xl font-bold text-yellow-700">
                                {data.forecasts.filter((f: any) => f.urgency === 'warning').length}
                            </div>
                        </div>
                        <div className="bg-success/10 border border-green-100 rounded-xl p-4">
                            <div className="text-sm text-success mb-1 font-medium">طبيعي</div>
                            <div className="text-2xl font-bold text-success">
                                {data.forecasts.filter((f: any) => f.urgency === 'normal').length}
                            </div>
                        </div>
                        <div className="bg-primary/10 border border-blue-100 rounded-xl p-4">
                            <div className="text-sm text-primary mb-1 font-medium">إجمالي المتابع</div>
                            <div className="text-2xl font-bold text-primary">{data.forecasts.length}</div>
                        </div>
                    </div>

                    {/* Forecast Table */}
                    <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-muted border-b">
                                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">الدواء</th>
                                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">مبيعات 90 يوم</th>
                                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">معدل يومي</th>
                                    <th className="text-right py-3 px-4 font-medium text-primary">طلب متوقع</th>
                                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">المخزون</th>
                                    <th className="text-right py-3 px-4 font-medium text-destructive">أيام حتى النفاد</th>
                                    <th className="text-right py-3 px-4 font-medium text-success">طلب مقترح</th>
                                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">الثقة</th>
                                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">الحالة</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.forecasts.map((f: any) => (
                                    <tr key={f.drugId} className="border-b hover:bg-muted/50">
                                        <td className="py-3 px-4">
                                            <div className="font-medium text-foreground">{f.drugName}</div>
                                            <div className="text-xs text-muted-foreground font-mono">{f.barcode}</div>
                                        </td>
                                        <td className="py-3 px-4 text-foreground">{fmt(f.totalSold90Days)}</td>
                                        <td className="py-3 px-4 text-foreground">{f.dailyAverage}</td>
                                        <td className="py-3 px-4 text-primary font-bold">{fmt(f.predictedDemand)}</td>
                                        <td className="py-3 px-4 text-foreground">{fmt(f.currentStock)}</td>
                                        <td className="py-3 px-4">
                                            <span className={`font-bold ${f.daysUntilStockout <= 7 ? 'text-destructive' : f.daysUntilStockout <= 14 ? 'text-yellow-700' : 'text-success'}`}>
                                                {f.daysUntilStockout >= 999 ? '∞' : f.daysUntilStockout}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            {f.suggestedOrder > 0 ? (
                                                <span className="font-bold text-warning flex items-center gap-1">
                                                    <ShoppingCart className="w-3 h-3" /> {fmt(f.suggestedOrder)}
                                                </span>
                                            ) : <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="w-full bg-muted rounded-full h-2">
                                                <div className="bg-primary h-2 rounded-full" style={{ width: `${f.confidence}%` }}></div>
                                            </div>
                                            <span className="text-xs text-muted-foreground">{f.confidence}%</span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${urgencyBadge(f.urgency)}`}>
                                                {urgencyLabel(f.urgency)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            ) : (
                <div className="text-center py-16 text-muted-foreground">
                    <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>لا توجد بيانات مبيعات كافية لتوليد تنبؤات</p>
                </div>
            )}
        </div>
    );
}
