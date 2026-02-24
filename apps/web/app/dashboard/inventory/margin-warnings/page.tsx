'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, TrendingDown, Settings } from 'lucide-react';

export default function MarginWarningsPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [minMargin, setMinMargin] = useState(5);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/inventory/margin-check')
            .then(r => r.json())
            .then(d => {
                setData(d);
                setMinMargin(d.minMargin || 5);
            })
            .finally(() => setLoading(false));
    }, []);

    const updateMinMargin = async () => {
        setSaving(true);
        try {
            await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ minProfitMargin: minMargin })
            });
            // Refresh data
            const res = await fetch('/api/inventory/margin-check');
            const d = await res.json();
            setData(d);
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    const fmt = (v: number) => new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 0 }).format(v) + ' د.ع';

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <h1 className="text-2xl font-bold text-foreground">⚠️ نظام الحد الأدنى للربح</h1>

            {/* Settings Card */}
            <div className="bg-card rounded-xl shadow-sm border p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Settings className="w-5 h-5 text-muted-foreground" />
                    <h2 className="font-semibold text-foreground">الإعدادات</h2>
                </div>
                <div className="flex items-center gap-4">
                    <label className="text-sm text-muted-foreground">الحد الأدنى لهامش الربح:</label>
                    <input
                        type="number"
                        value={minMargin}
                        onChange={(e) => setMinMargin(Number(e.target.value))}
                        className="w-20 border rounded-lg px-2 py-1 text-center text-sm"
                        min="0" max="100" step="0.5"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                    <button onClick={updateMinMargin} disabled={saving}
                        className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
                        {saving ? 'حفظ...' : 'حفظ'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                </div>
            ) : data ? (
                <>
                    {/* Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-destructive/10 border border-red-100 rounded-xl p-5">
                            <div className="flex items-center gap-2 text-destructive mb-1">
                                <AlertTriangle className="w-5 h-5" />
                                <span className="text-sm font-medium">أدوية تحت الحد الأدنى</span>
                            </div>
                            <div className="text-3xl font-bold text-destructive">{data.totalBelowMin}</div>
                        </div>
                        <div className="bg-primary/10 border border-blue-100 rounded-xl p-5">
                            <div className="text-sm text-primary mb-1 font-medium">إجمالي المخزون</div>
                            <div className="text-3xl font-bold text-primary">{data.totalInventory}</div>
                        </div>
                        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-5">
                            <div className="text-sm text-yellow-600 mb-1 font-medium">الحد الأدنى المعتمد</div>
                            <div className="text-3xl font-bold text-yellow-700">{data.minMargin}%</div>
                        </div>
                    </div>

                    {/* Warnings Table */}
                    {data.warnings?.length > 0 ? (
                        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="bg-destructive/10 border-b">
                                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">#</th>
                                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">الدواء</th>
                                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">الباركود</th>
                                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">التكلفة</th>
                                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">السعر</th>
                                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">الربح</th>
                                        <th className="text-right py-3 px-4 font-medium text-destructive">هامش %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.warnings.map((w: any, i: number) => (
                                        <tr key={w.drugId} className="border-b hover:bg-destructive/10/30">
                                            <td className="py-3 px-4 text-muted-foreground">{i + 1}</td>
                                            <td className="py-3 px-4 font-medium text-foreground">{w.drugName}</td>
                                            <td className="py-3 px-4 text-muted-foreground text-xs font-mono">{w.barcode}</td>
                                            <td className="py-3 px-4 text-warning">{fmt(w.cost)}</td>
                                            <td className="py-3 px-4 text-primary">{fmt(w.price)}</td>
                                            <td className={`py-3 px-4 font-medium ${w.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                                                {fmt(w.profit)}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="px-2 py-0.5 bg-destructive/10 text-destructive rounded-full text-xs font-bold flex items-center gap-1 w-fit">
                                                    <TrendingDown className="w-3 h-3" />
                                                    {w.margin}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="bg-success/10 border border-green-200 rounded-xl p-8 text-center">
                            <div className="text-success text-lg font-bold">✅ ممتاز!</div>
                            <div className="text-success text-sm mt-1">جميع الأدوية فوق الحد الأدنى لهامش الربح</div>
                        </div>
                    )}
                </>
            ) : null}
        </div>
    );
}
