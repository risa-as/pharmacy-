'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Download, TrendingUp, TrendingDown, Store, Crown, Percent,
    AlertTriangle, DollarSign, Building2, Loader2, BarChart3, Receipt,
    Minus, Package, Star
} from 'lucide-react';
import { exportToExcel } from '@/app/lib/excel-export';

const PERIOD_LABELS: Record<string, string> = {
    daily: 'اليوم',
    weekly: 'آخر 7 أيام',
    monthly: 'هذا الشهر',
    custom: 'مخصص',
};

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

    const fmt = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v) + ' د.ع';
    const fmtNum = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);

    const comparison: any[] = data?.comparison ?? [];

    const derived = useMemo(() => {
        if (comparison.length === 0) return null;
        const totals = comparison.reduce(
            (acc, b) => ({
                revenue: acc.revenue + b.revenue,
                cogs: acc.cogs + b.cogs,
                expenses: acc.expenses + b.expenses,
                returns: acc.returns + b.returns,
                netProfit: acc.netProfit + b.netProfit,
                salesCount: acc.salesCount + b.salesCount,
            }),
            { revenue: 0, cogs: 0, expenses: 0, returns: 0, netProfit: 0, salesCount: 0 }
        );
        const avgMargin = totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0;
        const topRevenue = comparison[0]; // API sorts by revenue desc
        const topMargin = [...comparison].sort((a, b) => b.profitMargin - a.profitMargin)[0];
        const needsAttention = [...comparison].sort((a, b) => a.netProfit - b.netProfit)[0];
        const maxRevenue = Math.max(...comparison.map((b) => b.revenue), 1);
        return { totals, avgMargin, topRevenue, topMargin, needsAttention, maxRevenue };
    }, [comparison]);

    const handleExport = () => {
        if (!data?.comparison) return;
        const exportRows = data.comparison.map((b: any) => ({
            ...b,
            topItemName: b.topItem?.name ?? '—',
        }));
        exportToExcel(exportRows, [
            { header: 'الفرع', key: 'branchName', width: 20 },
            { header: 'المبيعات', key: 'revenue', width: 15 },
            { header: 'النمو %', key: 'revenueGrowth', width: 10 },
            { header: 'التكلفة', key: 'cogs', width: 15 },
            { header: 'المصروفات', key: 'expenses', width: 15 },
            { header: 'المرتجعات', key: 'returns', width: 15 },
            { header: 'صافي الربح', key: 'netProfit', width: 15 },
            { header: 'هامش الربح %', key: 'profitMargin', width: 12 },
            { header: 'قيمة المخزون', key: 'inventoryValue', width: 15 },
            { header: 'الأكثر مبيعاً', key: 'topItemName', width: 20 },
            { header: 'عدد الفواتير', key: 'salesCount', width: 12 },
        ], 'مقارنة_الفروع', 'مقارنة');
    };

    const multiBranch = comparison.length >= 2;

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-primary" />
                        مقارنة الفروع
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        بوصلة المالك — مقارنة شاملة لأداء جميع الفروع
                    </p>
                </div>
                <button
                    onClick={handleExport}
                    disabled={!comparison.length}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-success text-success-foreground rounded-lg text-sm font-bold hover:bg-success/90 disabled:opacity-50 transition-colors"
                >
                    <Download className="w-4 h-4" /> تصدير Excel
                </button>
            </div>

            {/* الفلتر */}
            <div className="glass-card p-4 flex flex-wrap gap-3 items-end">
                <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">الفترة</label>
                    <div className="flex flex-wrap gap-1.5">
                        {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setPeriod(key)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                    period === key
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/70'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                {period === 'custom' && (
                    <>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">من</label>
                            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                                className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">إلى</label>
                            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                                className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                        </div>
                    </>
                )}
            </div>

            {loading ? (
                <div className="glass-card flex items-center justify-center h-48">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : derived ? (
                <>
                    {/* ملخص المؤسسة */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <SummaryCard label="إجمالي مبيعات المؤسسة" value={fmt(derived.totals.revenue)} icon={DollarSign} tone="text-primary" bg="bg-primary/10" />
                        <SummaryCard
                            label="إجمالي صافي الربح"
                            value={fmt(derived.totals.netProfit)}
                            icon={derived.totals.netProfit >= 0 ? TrendingUp : TrendingDown}
                            tone={derived.totals.netProfit >= 0 ? 'text-success' : 'text-destructive'}
                            bg={derived.totals.netProfit >= 0 ? 'bg-success/10' : 'bg-destructive/10'}
                        />
                        <SummaryCard label="متوسط هامش الربح" value={`${derived.avgMargin.toFixed(1)}%`} icon={Percent} tone="text-info" bg="bg-info/10" />
                        <SummaryCard label="عدد الفروع" value={String(comparison.length)} icon={Building2} tone="text-warning" bg="bg-warning/10" />
                    </div>

                    {/* أبرز المؤشرات */}
                    {multiBranch && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <HighlightCard
                                title="الأعلى مبيعاً"
                                branch={derived.topRevenue.branchName}
                                value={fmt(derived.topRevenue.revenue)}
                                icon={Crown}
                                tone="text-success"
                                bg="bg-success/10"
                                border="border-success/30"
                            />
                            <HighlightCard
                                title="الأعلى ربحية (هامش)"
                                branch={derived.topMargin.branchName}
                                value={`${derived.topMargin.profitMargin}%`}
                                icon={Percent}
                                tone="text-primary"
                                bg="bg-primary/10"
                                border="border-primary/30"
                            />
                            <HighlightCard
                                title="يحتاج اهتماماً"
                                branch={derived.needsAttention.branchName}
                                value={fmt(derived.needsAttention.netProfit)}
                                icon={AlertTriangle}
                                tone={derived.needsAttention.netProfit >= 0 ? 'text-warning' : 'text-destructive'}
                                bg={derived.needsAttention.netProfit >= 0 ? 'bg-warning/10' : 'bg-destructive/10'}
                                border={derived.needsAttention.netProfit >= 0 ? 'border-warning/30' : 'border-destructive/30'}
                            />
                        </div>
                    )}

                    {/* مقارنة بصرية للمبيعات */}
                    {multiBranch && (
                        <div className="glass-card p-5">
                            <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-primary" />
                                حصة كل فرع من المبيعات
                            </h2>
                            <div className="space-y-3">
                                {comparison.map((b) => {
                                    const share = derived.totals.revenue > 0 ? (b.revenue / derived.totals.revenue) * 100 : 0;
                                    const barWidth = (b.revenue / derived.maxRevenue) * 100;
                                    return (
                                        <div key={b.branchId}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="font-medium text-foreground">{b.branchName}</span>
                                                <span className="text-muted-foreground" dir="ltr">
                                                    {fmt(b.revenue)} · {share.toFixed(0)}%
                                                </span>
                                            </div>
                                            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                                                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${barWidth}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* بطاقات تفصيلية لكل فرع — بديل الجدول العريض (دون تمرير أفقي) */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Store className="w-4 h-4 text-muted-foreground" />
                            <h2 className="font-bold text-foreground">التفاصيل الكاملة</h2>
                            <span className="mr-auto text-xs text-muted-foreground">{PERIOD_LABELS[period]}</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {comparison.map((b, i) => (
                                <div key={b.branchId} className={`glass-card p-5 ${i === 0 ? 'border-success/30' : ''}`}>
                                    {/* رأس البطاقة */}
                                    <div className="flex items-center justify-between gap-2 mb-4">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${i === 0 ? 'bg-success/10' : 'bg-muted'}`}>
                                                {i === 0
                                                    ? <Crown className="w-5 h-5 text-success" />
                                                    : <Store className="w-5 h-5 text-muted-foreground" />}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-foreground truncate">{b.branchName}</p>
                                                {b.topItem ? (
                                                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                                        <Star className="w-3 h-3 text-warning shrink-0" />
                                                        {b.topItem.name} ({b.topItem.quantity})
                                                    </p>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground">لا مبيعات في الفترة</p>
                                                )}
                                            </div>
                                        </div>
                                        {i === 0 && (
                                            <span className="shrink-0 text-xs bg-success/10 text-success rounded-full px-2 py-0.5 font-bold">الأعلى</span>
                                        )}
                                    </div>

                                    {/* المبيعات + صافي الربح */}
                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        <div className="rounded-xl bg-muted/50 p-3">
                                            <p className="text-xs text-muted-foreground mb-0.5">المبيعات</p>
                                            <p className="font-bold text-primary" dir="ltr">{fmt(b.revenue)}</p>
                                            <GrowthBadge value={b.revenueGrowth ?? 0} />
                                        </div>
                                        <div className="rounded-xl bg-muted/50 p-3">
                                            <p className="text-xs text-muted-foreground mb-0.5">صافي الربح</p>
                                            <p className={`font-bold ${b.netProfit >= 0 ? 'text-success' : 'text-destructive'}`} dir="ltr">{fmt(b.netProfit)}</p>
                                            <span className={`inline-block text-xs font-bold mt-0.5 ${b.profitMargin >= 0 ? 'text-success' : 'text-destructive'}`}>
                                                هامش {b.profitMargin}%
                                            </span>
                                        </div>
                                    </div>

                                    {/* تفاصيل */}
                                    <div className="border-t border-border pt-3 space-y-2 text-sm">
                                        <MetricRow label="التكلفة" value={fmt(b.cogs)} tone="text-warning" />
                                        <MetricRow label="المصروفات" value={fmt(b.expenses)} tone="text-destructive" />
                                        <MetricRow label="المرتجعات" value={fmt(b.returns)} />
                                        <MetricRow label="قيمة المخزون" value={fmt(b.inventoryValue ?? 0)} icon={Package} />
                                        <MetricRow label="عدد الفواتير" value={String(b.salesCount)} icon={Receipt} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            ) : (
                <div className="glass-card py-20 text-center">
                    <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <BarChart3 className="w-8 h-8 text-muted-foreground opacity-50" />
                    </div>
                    <p className="text-foreground font-medium">لا توجد بيانات للفترة المحددة</p>
                    <p className="text-sm text-muted-foreground mt-1">جرّب فترة زمنية أخرى</p>
                </div>
            )}
        </div>
    );
}

function MetricRow({ label, value, tone, icon: Icon }: {
    label: string; value: string; tone?: string; icon?: any;
}) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {label}
            </span>
            <span className={`font-medium ${tone ?? 'text-foreground'}`} dir="ltr">{value}</span>
        </div>
    );
}

function GrowthBadge({ value }: { value: number }) {
    if (value === 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground mt-0.5">
                <Minus className="w-3 h-3" /> 0%
            </span>
        );
    }
    const positive = value > 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-bold mt-0.5 ${positive ? 'text-success' : 'text-destructive'}`}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {positive ? '+' : ''}{value}%
        </span>
    );
}

function SummaryCard({ label, value, icon: Icon, tone, bg }: {
    label: string; value: string; icon: any; tone: string; bg: string;
}) {
    return (
        <div className="glass-card p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-6 h-6 ${tone}`} />
            </div>
            <div className="min-w-0">
                <p className="text-sm text-muted-foreground truncate">{label}</p>
                <p className={`text-xl font-bold ${tone}`} dir="ltr">{value}</p>
            </div>
        </div>
    );
}

function HighlightCard({ title, branch, value, icon: Icon, tone, bg, border }: {
    title: string; branch: string; value: string; icon: any; tone: string; bg: string; border: string;
}) {
    return (
        <div className={`glass-card p-5 border ${border}`}>
            <div className="flex items-center gap-2 mb-3">
                <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${tone}`} />
                </div>
                <span className="text-sm font-bold text-muted-foreground">{title}</span>
            </div>
            <p className="text-lg font-bold text-foreground truncate">{branch}</p>
            <p className={`text-sm font-bold mt-0.5 ${tone}`} dir="ltr">{value}</p>
        </div>
    );
}
