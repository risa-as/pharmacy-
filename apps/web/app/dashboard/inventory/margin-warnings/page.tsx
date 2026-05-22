'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, TrendingDown, Settings, Building2 } from 'lucide-react';

interface Branch { id: string; name: string; }

export default function MarginWarningsPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [minMargin, setMinMargin] = useState(5);
    const [saving, setSaving] = useState(false);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState('');

    const fetchData = (branchId?: string) => {
        setLoading(true);
        const url = branchId
            ? `/api/inventory/margin-check?branchId=${branchId}`
            : '/api/inventory/margin-check';
        fetch(url)
            .then(r => r.json())
            .then(d => { setData(d); setMinMargin(d.minMargin || 5); })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetch('/api/branches')
            .then(r => r.json())
            .then(b => setBranches(Array.isArray(b) ? b : []));
        fetchData();
    }, []);

    const handleBranchSelect = (branchId: string) => {
        setSelectedBranchId(branchId);
        fetchData(branchId || undefined);
    };

    const updateMinMargin = async () => {
        setSaving(true);
        try {
            await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ minProfitMargin: minMargin })
            });
            fetchData(selectedBranchId || undefined);
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    const fmt = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v) + ' د.ع';

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <h1 className="text-2xl font-bold text-foreground">⚠️ نظام الحد الأدنى للربح</h1>

            {/* Branch Filter — pill style matching BranchFilter component */}
            {branches.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1 text-sm text-muted-foreground font-bold">
                        <Building2 className="w-4 h-4" />
                        الفرع:
                    </span>
                    <button
                        onClick={() => handleBranchSelect('')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!selectedBranchId
                            ? 'bg-primary text-primary-foreground shadow-md'
                            : 'bg-card border border-border text-muted-foreground hover:border-primary/50'
                        }`}
                    >
                        كل الفروع
                    </button>
                    {branches.map(b => (
                        <button
                            key={b.id}
                            onClick={() => handleBranchSelect(b.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedBranchId === b.id
                                ? 'bg-primary text-primary-foreground shadow-md'
                                : 'bg-card border border-border text-muted-foreground hover:border-primary/50'
                            }`}
                        >
                            {b.name}
                        </button>
                    ))}
                </div>
            )}

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
                        className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
                        {saving ? 'حفظ...' : 'حفظ'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
            ) : data ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-destructive/10 border border-red-100 rounded-xl p-5">
                            <div className="flex items-center gap-2 text-destructive mb-1">
                                <AlertTriangle className="w-5 h-5" />
                                <span className="text-sm font-medium">أدوية تحت الحد الأدنى</span>
                            </div>
                            <div className="text-3xl font-bold text-destructive">{data.totalBelowMin}</div>
                        </div>
                        <div className="bg-primary/10 border border-primary rounded-xl p-5">
                            <div className="text-sm text-primary mb-1 font-medium">إجمالي المخزون</div>
                            <div className="text-3xl font-bold text-primary">{data.totalInventory}</div>
                        </div>
                        <div className="bg-warning/10 border border-warning/20 rounded-xl p-5">
                            <div className="text-sm text-warning mb-1 font-medium">الحد الأدنى المعتمد</div>
                            <div className="text-3xl font-bold text-warning">{data.minMargin}%</div>
                        </div>
                    </div>

                    {data.warnings?.length > 0 ? (
                        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="bg-destructive/10 border-b">
                                        <th className="text-right py-3 px-4 font-bold text-muted-foreground">#</th>
                                        <th className="text-right py-3 px-4 font-bold text-muted-foreground">الدواء</th>
                                        <th className="text-right py-3 px-4 font-bold text-muted-foreground">الباركود</th>
                                        <th className="text-right py-3 px-4 font-bold text-muted-foreground">التكلفة</th>
                                        <th className="text-right py-3 px-4 font-bold text-muted-foreground">السعر</th>
                                        <th className="text-right py-3 px-4 font-bold text-muted-foreground">الربح</th>
                                        <th className="text-right py-3 px-4 font-bold text-destructive">هامش %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.warnings.map((w: any, i: number) => (
                                        <tr key={w.drugId} className="border-b hover:bg-muted/50">
                                            <td className="py-3 px-4 text-muted-foreground">{i + 1}</td>
                                            <td className="py-3 px-4 font-bold text-foreground">{w.drugName}</td>
                                            <td className="py-3 px-4 text-muted-foreground text-xs font-mono">{w.barcode}</td>
                                            <td className="py-3 px-4 text-warning">{fmt(w.cost)}</td>
                                            <td className="py-3 px-4 text-primary">{fmt(w.price)}</td>
                                            <td className={`py-3 px-4 font-bold ${w.profit >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(w.profit)}</td>
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
