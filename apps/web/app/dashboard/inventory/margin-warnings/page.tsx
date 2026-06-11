'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    AlertTriangle, TrendingDown, Settings, Building2, Search,
    Package, Percent, CheckCircle2, Loader2, Save
} from 'lucide-react';

interface Branch { id: string; name: string; }

export default function MarginWarningsPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [minMargin, setMinMargin] = useState(5);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState('');
    const [query, setQuery] = useState('');

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
        setSaved(false);
        try {
            await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ minProfitMargin: minMargin })
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
            fetchData(selectedBranchId || undefined);
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    const fmt = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v) + ' د.ع';

    const filteredWarnings = useMemo(() => {
        const list: any[] = data?.warnings ?? [];
        const q = query.trim().toLowerCase();
        if (!q) return list;
        return list.filter(
            (w) => w.drugName.toLowerCase().includes(q) || (w.barcode || '').toLowerCase().includes(q)
        );
    }, [data, query]);

    const statCards = data ? [
        { label: 'أدوية تحت الحد الأدنى', value: String(data.totalBelowMin), icon: AlertTriangle, tone: 'text-destructive', bg: 'bg-destructive/10' },
        { label: 'إجمالي المخزون', value: String(data.totalInventory), icon: Package, tone: 'text-primary', bg: 'bg-primary/10' },
        { label: 'الحد الأدنى المعتمد', value: `${data.minMargin}%`, icon: Percent, tone: 'text-warning', bg: 'bg-warning/10' },
    ] : [];

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <TrendingDown className="w-6 h-6 text-destructive" />
                        الحد الأدنى لهامش الربح
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        الأدوية التي يقل هامش ربحها عن النسبة المعتمدة
                    </p>
                </div>

                {/* فلتر الفرع */}
                {branches.length > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="flex items-center gap-1 text-sm text-muted-foreground font-medium ml-1">
                            <Building2 className="w-4 h-4" />
                            الفرع:
                        </span>
                        <button
                            onClick={() => handleBranchSelect('')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!selectedBranchId
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-muted/70'
                            }`}
                        >
                            كل الفروع
                        </button>
                        {branches.map(b => (
                            <button
                                key={b.id}
                                onClick={() => handleBranchSelect(b.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${selectedBranchId === b.id
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                                }`}
                            >
                                {b.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* بطاقة الإعدادات */}
            <div className="glass-card p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    <h2 className="font-bold text-foreground text-sm">إعداد الحد الأدنى</h2>
                    <span className="text-xs text-muted-foreground mr-auto">يُطبَّق على كامل المؤسسة</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <label className="text-sm text-muted-foreground">الحد الأدنى لهامش الربح:</label>
                    <div className="relative">
                        <input
                            type="number"
                            value={minMargin}
                            onChange={(e) => setMinMargin(Number(e.target.value))}
                            className="w-24 border border-border rounded-lg pl-7 pr-3 py-2 text-center text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                            min="0" max="100" step="0.5"
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    </div>
                    <button
                        onClick={updateMinMargin}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                        {saving
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري الحفظ...</>
                            : <><Save className="w-4 h-4" /> حفظ</>
                        }
                    </button>
                    {saved && (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
                            <CheckCircle2 className="w-4 h-4" />
                            تم الحفظ
                        </span>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="glass-card flex items-center justify-center h-40">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : data ? (
                <>
                    {/* بطاقات الإحصائيات */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {statCards.map((card) => {
                            const Icon = card.icon;
                            return (
                                <div key={card.label} className="glass-card p-5 flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                                        <Icon className={`w-6 h-6 ${card.tone}`} />
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">{card.label}</p>
                                        <p className={`text-2xl font-bold ${card.tone}`} dir="ltr">{card.value}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* الجدول */}
                    {data.warnings?.length > 0 ? (
                        <div className="glass-card overflow-hidden">
                            {/* البحث */}
                            <div className="p-4 border-b border-border">
                                <div className="relative max-w-sm">
                                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="بحث بالاسم أو الباركود..."
                                        className="w-full pr-10 pl-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                                    />
                                </div>
                            </div>

                            {filteredWarnings.length === 0 ? (
                                <div className="py-10 text-center text-muted-foreground">
                                    <p className="text-sm">لا توجد نتائج مطابقة</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                                            <tr>
                                                <th className="px-6 py-3.5 text-right font-medium font-cairo">الدواء</th>
                                                <th className="px-6 py-3.5 text-right font-medium font-cairo">التكلفة</th>
                                                <th className="px-6 py-3.5 text-right font-medium font-cairo">السعر</th>
                                                <th className="px-6 py-3.5 text-right font-medium font-cairo">الربح</th>
                                                <th className="px-6 py-3.5 text-right font-medium font-cairo">الهامش</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border bg-card">
                                            {filteredWarnings.map((w: any) => (
                                                <tr key={w.drugId} className="hover:bg-muted/40 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-9 h-9 bg-destructive/10 rounded-lg flex items-center justify-center shrink-0">
                                                                <Package className="w-4 h-4 text-destructive" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-semibold text-foreground truncate">{w.drugName}</p>
                                                                {w.barcode && (
                                                                    <p className="text-xs text-muted-foreground" dir="ltr">{w.barcode}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-muted-foreground" dir="ltr">{fmt(w.cost)}</td>
                                                    <td className="px-6 py-4 text-foreground" dir="ltr">{fmt(w.price)}</td>
                                                    <td className={`px-6 py-4 font-bold ${w.profit >= 0 ? 'text-success' : 'text-destructive'}`} dir="ltr">
                                                        {fmt(w.profit)}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex items-center gap-1 bg-destructive/10 text-destructive border border-destructive/20 rounded-md px-2.5 py-1 text-xs font-bold">
                                                            <TrendingDown className="w-3 h-3" />
                                                            {w.margin}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="glass-card py-16 text-center">
                            <div className="w-16 h-16 bg-success/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <CheckCircle2 className="w-8 h-8 text-success" />
                            </div>
                            <p className="text-foreground font-medium">جميع الأدوية فوق الحد الأدنى</p>
                            <p className="text-sm text-muted-foreground mt-1">لا توجد أدوية بهامش ربح أقل من {data.minMargin}%</p>
                        </div>
                    )}
                </>
            ) : null}
        </div>
    );
}
