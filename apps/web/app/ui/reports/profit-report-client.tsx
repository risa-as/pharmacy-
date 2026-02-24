'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Undo2, Receipt, Download } from 'lucide-react';
import { exportToExcel } from '@/app/lib/excel-export';

interface ProfitReportClientProps {
    branches: { id: string; name: string }[];
    defaultBranchId: string;
    defaultPeriod: string;
}

export default function ProfitReportClient({ branches, defaultBranchId, defaultPeriod }: ProfitReportClientProps) {
    const [branchId, setBranchId] = useState(defaultBranchId);
    const [period, setPeriod] = useState(defaultPeriod);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            let url = `/api/reports/profit?period=${period}`;
            if (branchId) url += `&branchId=${branchId}`;
            if (period === 'custom' && from && to) {
                url += `&from=${from}&to=${to}`;
            }
            const res = await fetch(url);
            const json = await res.json();
            setData(json);
        } catch (error) {
            console.error('Failed to load profit report:', error);
        } finally {
            setLoading(false);
        }
    }, [branchId, period, from, to]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('ar-IQ', { style: 'decimal', maximumFractionDigits: 0 }).format(val) + ' د.ع';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const s = data?.summary;

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="bg-card rounded-xl shadow-sm border border-border p-4">
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">الفرع</label>
                        <select
                            value={branchId}
                            onChange={(e) => setBranchId(e.target.value)}
                            className="border border-border rounded-lg px-3 py-2 text-sm bg-muted focus:ring-2 focus:ring-ring focus:border-transparent"
                        >
                            <option value="">كل الفروع</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">الفترة</label>
                        <select
                            value={period}
                            onChange={(e) => setPeriod(e.target.value)}
                            className="border border-border rounded-lg px-3 py-2 text-sm bg-muted focus:ring-2 focus:ring-ring focus:border-transparent"
                        >
                            <option value="daily">اليوم</option>
                            <option value="weekly">آخر 7 أيام</option>
                            <option value="monthly">هذا الشهر</option>
                            <option value="custom">مخصص</option>
                        </select>
                    </div>
                    {period === 'custom' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1">من</label>
                                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                                    className="border border-border rounded-lg px-3 py-2 text-sm bg-muted" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1">إلى</label>
                                <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                                    className="border border-border rounded-lg px-3 py-2 text-sm bg-muted" />
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            {s && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SummaryCard icon={<ShoppingCart className="w-5 h-5" />} label="إجمالي المبيعات" value={formatCurrency(s.totalRevenue)} color="blue" sub={`${s.salesCount} فاتورة`} />
                    <SummaryCard icon={<DollarSign className="w-5 h-5" />} label="تكلفة البضاعة" value={formatCurrency(s.totalCOGS)} color="orange" />
                    <SummaryCard icon={<Receipt className="w-5 h-5" />} label="المصروفات" value={formatCurrency(s.totalExpenses)} color="red" />
                    <SummaryCard icon={<Undo2 className="w-5 h-5" />} label="المرتجعات" value={formatCurrency(s.totalReturns)} color="yellow" sub={`${s.returnsCount} مرتجع`} />
                    <SummaryCard icon={<TrendingUp className="w-5 h-5" />} label="إجمالي الربح" value={formatCurrency(s.grossProfit)} color="emerald" />
                    <SummaryCard
                        icon={s.netProfit >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                        label="صافي الربح"
                        value={formatCurrency(s.netProfit)}
                        color={s.netProfit >= 0 ? 'green' : 'red'}
                        sub={`هامش الربح: ${s.profitMargin}%`}
                        highlight
                    />
                    <SummaryCard icon={<DollarSign className="w-5 h-5" />} label="الخصومات" value={formatCurrency(s.totalDiscount)} color="purple" />
                    <SummaryCard icon={<DollarSign className="w-5 h-5" />} label="دفعات الموردين" value={formatCurrency(s.totalSupplierPayments)} color="indigo" />
                </div>
            )}

            {/* Chart */}
            {data?.chart && data.chart.length > 0 && (
                <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-foreground">📈 الرسم البياني اليومي</h2>
                        <button
                            onClick={() => exportToExcel(data.chart, [
                                { header: 'التاريخ', key: 'date', width: 14 },
                                { header: 'المبيعات', key: 'revenue', width: 14 },
                                { header: 'التكلفة', key: 'cogs', width: 14 },
                                { header: 'المصروفات', key: 'expenses', width: 14 },
                                { header: 'المرتجعات', key: 'returns', width: 14 },
                                { header: 'صافي الربح', key: 'netProfit', width: 14 },
                            ], 'تقرير_الأرباح', 'الأرباح')}
                            className="flex items-center gap-1 px-3 py-1.5 bg-success text-white rounded-lg text-xs font-medium hover:bg-green-700"
                        >
                            <Download className="w-3 h-3" /> تصدير Excel
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">التاريخ</th>
                                    <th className="text-right py-2 px-3 font-medium text-primary">المبيعات</th>
                                    <th className="text-right py-2 px-3 font-medium text-warning">التكلفة</th>
                                    <th className="text-right py-2 px-3 font-medium text-destructive">المصروفات</th>
                                    <th className="text-right py-2 px-3 font-medium text-yellow-600">المرتجعات</th>
                                    <th className="text-right py-2 px-3 font-medium text-success">صافي الربح</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.chart.map((day: any) => (
                                    <tr key={day.date} className="border-b border-border/40 hover:bg-muted/50">
                                        <td className="py-2 px-3 text-foreground">{day.date}</td>
                                        <td className="py-2 px-3 text-primary font-medium">{formatCurrency(day.revenue)}</td>
                                        <td className="py-2 px-3 text-warning">{formatCurrency(day.cogs)}</td>
                                        <td className="py-2 px-3 text-destructive">{formatCurrency(day.expenses)}</td>
                                        <td className="py-2 px-3 text-yellow-700">{formatCurrency(day.returns)}</td>
                                        <td className={`py-2 px-3 font-bold ${day.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                                            {formatCurrency(day.netProfit)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Expenses by Category */}
            {data?.expensesByCategory && data.expensesByCategory.length > 0 && (
                <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                    <h2 className="text-lg font-semibold text-foreground mb-4">💰 المصروفات حسب التصنيف</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {data.expensesByCategory.map((cat: any, i: number) => (
                            <div key={i} className="bg-muted rounded-lg p-3 border border-border">
                                <div className="text-sm text-muted-foreground">{cat.category}</div>
                                <div className="text-lg font-bold text-destructive">{formatCurrency(cat.amount)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryCard({
    icon, label, value, color, sub, highlight
}: {
    icon: React.ReactNode; label: string; value: string; color: string; sub?: string; highlight?: boolean
}) {
    const bgMap: Record<string, string> = {
        blue: 'bg-primary/10 border-blue-100',
        orange: 'bg-warning/10 border-orange-100',
        red: 'bg-destructive/10 border-red-100',
        yellow: 'bg-yellow-50 border-yellow-100',
        green: 'bg-success/10 border-green-100',
        emerald: 'bg-success/10 border-emerald-100',
        purple: 'bg-purple-50 border-purple-100',
        indigo: 'bg-indigo-50 border-indigo-100',
    };
    const textMap: Record<string, string> = {
        blue: 'text-primary',
        orange: 'text-warning',
        red: 'text-destructive',
        yellow: 'text-yellow-600',
        green: 'text-success',
        emerald: 'text-success',
        purple: 'text-purple-600',
        indigo: 'text-indigo-600',
    };

    return (
        <div className={`rounded-xl border p-4 ${bgMap[color] || bgMap.blue} ${highlight ? 'ring-2 ring-offset-1 ring-green-400' : ''}`}>
            <div className={`flex items-center gap-2 mb-1 ${textMap[color] || textMap.blue}`}>
                {icon}
                <span className="text-xs font-medium">{label}</span>
            </div>
            <div className={`text-xl font-bold ${textMap[color] || textMap.blue}`}>{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        </div>
    );
}
