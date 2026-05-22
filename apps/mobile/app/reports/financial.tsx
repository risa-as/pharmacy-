import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, ActivityIndicator,
    TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { apiService, request } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { BranchSelector } from '../../components/BranchSelector';
import { formatDate } from '../../utils/date';

// ── Types ──────────────────────────────────────────────────────────────────────
type Period = 'daily' | 'weekly' | 'monthly';
const PERIODS: { key: Period; label: string }[] = [
    { key: 'daily',   label: 'يومي' },
    { key: 'weekly',  label: 'أسبوعي' },
    { key: 'monthly', label: 'شهري' },
];

interface BranchRow {
    branchId: string; branchName: string;
    revenue: number; expenses: number;
    netProfit: number; profitMargin: number; salesCount: number;
}
interface ChartPt { label: string; value: number; }

// ── Helpers ────────────────────────────────────────────────────────────────────
function abbr(n: number): string {
    if (n === 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} مليون`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)} ألف`;
    return n.toLocaleString('en-US');
}

// ── Bar Chart ──────────────────────────────────────────────────────────────────
const BAR_H = 130, BAR_LBL_H = 24;

function BarChart({ data, color, isDark }: { data: ChartPt[]; color: string; isDark: boolean }) {
    const C = Colors(isDark);
    if (data.length === 0) return null;
    const max = Math.max(...data.map(d => d.value), 1);
    const maxIdx = data.reduce((mi, d, i, a) => d.value > a[mi].value ? i : mi, 0);
    const gap = data.length > 14 ? 2 : 6;
    const step = Math.max(1, Math.ceil(data.length / 7));

    return (
        <View>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-end', height: BAR_H + BAR_LBL_H, gap }}>
                {data.map((d, i) => {
                    const isMax = i === maxIdx;
                    const h = d.value > 0 ? Math.max(4, (d.value / max) * BAR_H) : 0;
                    return (
                        <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: BAR_H + BAR_LBL_H }}>
                            <Text style={{
                                color: isMax ? color : C.mutedForeground,
                                fontSize: data.length > 14 ? 7 : 9,
                                fontWeight: isMax ? '700' : '400',
                                marginBottom: 3,
                                height: BAR_LBL_H,
                                textAlignVertical: 'bottom',
                            }}>
                                {d.value > 0 ? abbr(d.value) : ''}
                            </Text>
                            <View style={{
                                width: '100%', height: h,
                                backgroundColor: isMax ? color : `${color}55`,
                                borderTopLeftRadius: 5, borderTopRightRadius: 5,
                            }} />
                        </View>
                    );
                })}
            </View>
            <View style={{ flexDirection: 'row-reverse', marginTop: 6, gap }}>
                {data.map((d, i) => (
                    <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                        {i % step === 0 && (
                            <Text style={{ color: C.mutedForeground, fontSize: data.length > 14 ? 8 : 10, textAlign: 'center' }}>
                                {d.label}
                            </Text>
                        )}
                    </View>
                ))}
            </View>
        </View>
    );
}

// ── Stat chip ──────────────────────────────────────────────────────────────────
function StatChip({ icon, label, value, color, bg }: {
    icon: keyof typeof Ionicons.glyphMap; label: string;
    value: string | number; color: string; bg: string;
}) {
    return (
        <View style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: bg, borderRadius: 14, padding: 12 }}>
            <View style={{ backgroundColor: `${color}20`, borderRadius: 8, padding: 6 }}>
                <Ionicons name={icon} size={14} color={color} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ color, fontSize: 13, fontWeight: '800', textAlign: 'right' }}>
                    {typeof value === 'number' ? value.toLocaleString('en-US') : value}
                </Text>
                <Text style={{ color: `${color}AA`, fontSize: 10, fontWeight: '500', textAlign: 'right', marginTop: 1 }}>
                    {label}
                </Text>
            </View>
        </View>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function FinancialReportScreen() {
    const { isDarkMode } = useTheme();
    const { branchId: authBranchId, isAdmin } = useAuth();
    const C = Colors(isDarkMode);

    const [data, setData]             = useState<any>(null);
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [period, setPeriod]         = useState<Period>('monthly');
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);
    const [branchComparison, setBranchComparison] = useState<BranchRow[]>([]);
    const [compLoading, setCompLoading] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const json = await apiService.getReports(period, selectedBranch ?? undefined);
            setData(json);
        } catch (err) {
            console.error('FinancialReportScreen:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [period, selectedBranch]);

    useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

    const fetchComparison = useCallback(async () => {
        if (!isAdmin) return;
        setCompLoading(true);
        try {
            const res = await request<{ comparison: BranchRow[] }>('/reports/branch-comparison');
            setBranchComparison(Array.isArray(res.comparison) ? res.comparison : []);
        } catch {
            setBranchComparison([]);
        } finally {
            setCompLoading(false);
        }
    }, [isAdmin]);

    useEffect(() => { fetchComparison(); }, [fetchComparison]);

    // ── Derived values ─────────────────────────────────────────────────────────
    const profit        = data?.profit ?? 0;
    const profitPositive = profit >= 0;

    const profitMargin = useMemo(() =>
        data?.revenue ? (data.profit / data.revenue) * 100 : 0,
    [data]);

    const avgSale = useMemo(() => {
        const t = data?.transactions ?? 0, r = data?.revenue ?? 0;
        return t > 0 ? Math.round(r / t) : 0;
    }, [data]);

    const profitBarPct = useMemo(() => {
        const r = data?.revenue ?? 0, p = data?.profit ?? 0;
        return r > 0 ? Math.max(0, Math.min(1, p / r)) : 0;
    }, [data]);

    const chartData = useMemo<ChartPt[]>(() => {
        if (!Array.isArray(data?.chart)) return [];
        const opts: Intl.DateTimeFormatOptions =
            period === 'monthly' ? { day: 'numeric' } :
            period === 'weekly'  ? { day: 'numeric', month: 'short' } :
                                   { weekday: 'short' };
        return data.chart.map((item: any) => ({
            label: item.date ? formatDate(item.date, opts) : '',
            value: item.amount ?? 0,
        }));
    }, [data, period]);

    // Expense breakdown sorted by amount, with percentage of total
    const expenseEntries = useMemo(() => {
        if (!data?.expenseBreakdown) return [];
        const entries = Object.entries(data.expenseBreakdown as Record<string, number>);
        const total = entries.reduce((s, [, v]) => s + v, 0);
        return entries
            .map(([cat, amt]) => ({ cat, amt, pct: total > 0 ? amt / total : 0 }))
            .sort((a, b) => b.amt - a.amt);
    }, [data]);

    const periodLabel = PERIODS.find(p => p.key === period)?.label ?? '';
    // Only show branch comparison if admin AND more than 1 branch returned
    const showComparison = isAdmin && branchComparison.length > 1;

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <View style={{
                backgroundColor: C.card,
                flexDirection: 'row-reverse', alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
                borderBottomWidth: 1, borderBottomColor: C.border,
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isDarkMode ? 0.2 : 0.05, shadowRadius: 6,
                elevation: 3,
            }}>
                <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '800' }}>
                    التقرير المالي التفصيلي
                </Text>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={{ backgroundColor: C.border, borderRadius: 10, padding: 8 }}
                >
                    <Ionicons name="arrow-back" size={20} color={C.foreground} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            >
                {/* ── Period pills ──────────────────────────────────────────── */}
                <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 16 }}>
                    {PERIODS.map(({ key, label }) => {
                        const sel = period === key;
                        return (
                            <TouchableOpacity
                                key={key}
                                onPress={() => setPeriod(key)}
                                activeOpacity={0.75}
                                style={{
                                    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 24,
                                    backgroundColor: sel ? C.primary : C.card,
                                    borderWidth: 1.5, borderColor: sel ? C.primary : C.border,
                                    elevation: sel ? 3 : 0,
                                }}
                            >
                                <Text style={{ fontSize: 13, fontWeight: sel ? '700' : '500', color: sel ? '#fff' : C.foreground }}>
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* ── Branch selector (hidden for single-branch pharmacies) ── */}
                <BranchSelector
                    selectedBranchId={selectedBranch}
                    onSelectBranch={setSelectedBranch}
                    hideIfSingle
                />

                {loading && !refreshing ? (
                    <View style={{ paddingVertical: 60, alignItems: 'center', gap: 12 }}>
                        <ActivityIndicator size="large" color={C.primary} />
                        <Text style={{ color: C.mutedForeground, fontSize: 13 }}>جاري تحميل التقرير...</Text>
                    </View>
                ) : (
                    <View style={{ gap: 16 }}>

                        {/* ── Financial summary card ────────────────────────── */}
                        <View style={{
                            backgroundColor: C.card, borderRadius: 20,
                            borderWidth: 1, borderColor: C.border, overflow: 'hidden',
                            shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
                            shadowOpacity: isDarkMode ? 0.3 : 0.08, shadowRadius: 10,
                            elevation: 4,
                        }}>
                            {/* Color-coded header strip */}
                            <View style={{
                                backgroundColor: profitPositive ? C.success : C.danger,
                                paddingHorizontal: 20, paddingVertical: 12,
                                flexDirection: 'row-reverse',
                                justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                                    التحليل المالي — {periodLabel}
                                </Text>
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                                    <Ionicons
                                        name={profitPositive ? 'trending-up' : 'trending-down'}
                                        size={16} color="#fff"
                                    />
                                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' }}>
                                        {profitMargin.toFixed(1)}% هامش
                                    </Text>
                                </View>
                            </View>

                            <View style={{ padding: 20, gap: 16 }}>
                                {/* Net profit – large number */}
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ color: C.mutedForeground, fontSize: 12, marginBottom: 4 }}>
                                        صافي الربح
                                    </Text>
                                    <Text style={{ color: profitPositive ? C.success : C.danger, fontSize: 36, fontWeight: '900' }}>
                                        {Math.abs(profit).toLocaleString('en-US')}
                                        {'  '}
                                        <Text style={{ fontSize: 16, fontWeight: '600' }}>د.ع</Text>
                                    </Text>
                                </View>

                                {/* Revenue / Expenses split bar */}
                                <View style={{ gap: 6 }}>
                                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                                        <Text style={{ color: C.success, fontSize: 13, fontWeight: '700' }}>
                                            {(data?.revenue ?? 0).toLocaleString('en-US')}
                                        </Text>
                                        <Text style={{ color: C.danger, fontSize: 13, fontWeight: '700' }}>
                                            {(data?.expenses ?? 0).toLocaleString('en-US')}
                                        </Text>
                                    </View>
                                    <View style={{ height: 8, borderRadius: 4, backgroundColor: C.dangerBg, overflow: 'hidden', flexDirection: 'row-reverse' }}>
                                        <View style={{ width: `${profitBarPct * 100}%`, backgroundColor: C.success, borderRadius: 4 }} />
                                    </View>
                                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                                        <Text style={{ color: C.mutedForeground, fontSize: 10 }}>الإيرادات</Text>
                                        <Text style={{ color: C.mutedForeground, fontSize: 10 }}>المصروفات</Text>
                                    </View>
                                </View>

                                <View style={{ height: 1, backgroundColor: C.border }} />

                                {/* Stat chips */}
                                <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                                    <StatChip
                                        icon="receipt" label="عدد العمليات"
                                        value={data?.transactions ?? 0}
                                        color={C.info} bg={C.infoBg}
                                    />
                                    <StatChip
                                        icon="calculator" label="متوسط الفاتورة"
                                        value={avgSale}
                                        color={C.warning} bg={C.warningBg}
                                    />
                                </View>
                            </View>
                        </View>

                        {/* ── Expense breakdown ─────────────────────────────────── */}
                        {expenseEntries.length > 0 && (
                            <View style={{
                                backgroundColor: C.card, borderRadius: 20,
                                borderWidth: 1, borderColor: C.border, padding: 20,
                                shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: isDarkMode ? 0.2 : 0.05, shadowRadius: 6, elevation: 2,
                            }}>
                                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15 }}>
                                        تفاصيل المصروفات
                                    </Text>
                                    <View style={{ backgroundColor: C.dangerBg, borderRadius: 10, padding: 7 }}>
                                        <Ionicons name="receipt" size={16} color={C.danger} />
                                    </View>
                                </View>
                                <View style={{ gap: 14 }}>
                                    {expenseEntries.map(({ cat, amt, pct }) => (
                                        <View key={cat}>
                                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 5 }}>
                                                <Text style={{ color: C.foreground, fontSize: 13, fontWeight: '600' }}>{cat}</Text>
                                                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                                                    <Text style={{ color: C.mutedForeground, fontSize: 11 }}>
                                                        {(pct * 100).toFixed(0)}%
                                                    </Text>
                                                    <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>
                                                        {amt.toLocaleString('en-US')} د.ع
                                                    </Text>
                                                </View>
                                            </View>
                                            <View style={{ height: 5, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden', flexDirection: 'row-reverse' }}>
                                                <View style={{ width: `${pct * 100}%`, backgroundColor: C.danger, borderRadius: 3, opacity: 0.65 }} />
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* ── Sales bar chart ──────────────────────────────────── */}
                        {chartData.length >= 2 && (
                            <View style={{
                                backgroundColor: C.card, borderRadius: 20,
                                borderWidth: 1, borderColor: C.border, paddingVertical: 20,
                                shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: isDarkMode ? 0.2 : 0.05, shadowRadius: 6, elevation: 2,
                            }}>
                                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 }}>
                                    <View>
                                        <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15, textAlign: 'right' }}>
                                            أداء المبيعات
                                        </Text>
                                        <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                                            {chartData.length} نقطة بيانات
                                        </Text>
                                    </View>
                                    <View style={{ backgroundColor: C.primaryMuted, borderRadius: 10, padding: 7 }}>
                                        <Ionicons name="bar-chart" size={16} color={C.primary} />
                                    </View>
                                </View>
                                <View style={{ paddingHorizontal: 20 }}>
                                    <BarChart data={chartData} color={C.primary} isDark={isDarkMode} />
                                </View>
                            </View>
                        )}

                        {/* ── Branch comparison (admin, >1 branch only) ─────────── */}
                        {showComparison && (
                            <View style={{
                                backgroundColor: C.card, borderRadius: 20,
                                borderWidth: 1, borderColor: C.border, padding: 20,
                                shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: isDarkMode ? 0.2 : 0.05, shadowRadius: 6, elevation: 2,
                            }}>
                                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15 }}>
                                        مقارنة الفروع
                                    </Text>
                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                                        {compLoading && <ActivityIndicator size="small" color={C.primary} />}
                                        <View style={{ backgroundColor: C.infoBg, borderRadius: 10, padding: 7 }}>
                                            <Ionicons name="git-compare" size={16} color={C.info} />
                                        </View>
                                    </View>
                                </View>

                                {branchComparison.map((branch, idx) => {
                                    const maxRev = Math.max(...branchComparison.map(b => b.revenue), 1);
                                    const barPct = branch.revenue / maxRev;
                                    const marginColor =
                                        branch.profitMargin >= 20 ? C.success :
                                        branch.profitMargin >= 10 ? C.warning : C.danger;
                                    const marginBg =
                                        branch.profitMargin >= 20 ? C.successBg :
                                        branch.profitMargin >= 10 ? C.warningBg : C.dangerBg;

                                    return (
                                        <View key={branch.branchId} style={{
                                            borderTopWidth: idx === 0 ? 0 : 1,
                                            borderTopColor: C.border,
                                            paddingTop: idx === 0 ? 0 : 14,
                                            marginTop: idx === 0 ? 0 : 14,
                                        }}>
                                            {/* Branch header */}
                                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 13 }}>
                                                    {branch.branchName}
                                                </Text>
                                                <View style={{ backgroundColor: marginBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                                                    <Text style={{ color: marginColor, fontSize: 11, fontWeight: '700' }}>
                                                        {branch.profitMargin}% هامش
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Relative revenue bar */}
                                            <View style={{ height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden', flexDirection: 'row-reverse', marginBottom: 10 }}>
                                                <View style={{ width: `${barPct * 100}%`, backgroundColor: C.primary, borderRadius: 3 }} />
                                            </View>

                                            {/* Stats grid */}
                                            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                                                {[
                                                    { label: 'الإيرادات',  value: branch.revenue.toLocaleString('en-US'),     color: C.success },
                                                    { label: 'صافي الربح', value: branch.netProfit.toLocaleString('en-US'),    color: branch.netProfit >= 0 ? C.success : C.danger },
                                                    { label: 'المبيعات',   value: String(branch.salesCount),                  color: C.info },
                                                ].map(s => (
                                                    <View key={s.label} style={{
                                                        flex: 1, backgroundColor: C.background,
                                                        borderRadius: 10, padding: 8, alignItems: 'center',
                                                    }}>
                                                        <Text style={{ color: s.color, fontWeight: '700', fontSize: 12 }}>{s.value}</Text>
                                                        <Text style={{ color: C.mutedForeground, fontSize: 10, marginTop: 2 }}>{s.label}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                    </View>
                )}
            </ScrollView>
        </View>
    );
}
