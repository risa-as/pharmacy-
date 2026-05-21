import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, ScrollView, RefreshControl,
    TouchableOpacity, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { BranchSelector } from '../../components/BranchSelector';
import { useSyncStatus } from '../../context/SyncContext';
import { formatDate } from '../../utils/date';

const { width: SCREEN_W } = Dimensions.get('window');

type Period = 'daily' | 'weekly' | 'monthly';
const PERIODS: { key: Period; label: string }[] = [
    { key: 'daily',   label: 'يومي' },
    { key: 'weekly',  label: 'أسبوعي' },
    { key: 'monthly', label: 'شهري' },
];

// ── Bar Chart ──────────────────────────────────────────────────────────────────
interface ChartPoint { label: string; value: number; }

const BAR_AREA_H = 130; // height of bars
const BAR_LABEL_H = 24; // height reserved above bars for value labels

function abbreviate(n: number): string {
    if (n === 0) return '';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} مليون`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)} ألف`;
    return String(n);
}

function BarChart({ data, color, isDark }: { data: ChartPoint[]; color: string; isDark: boolean }) {
    const C = Colors(isDark);
    const max = Math.max(...data.map(d => d.value), 1);
    const maxIdx = data.reduce((mi, d, i, arr) => d.value > arr[mi].value ? i : mi, 0);

    return (
        <View style={{ paddingHorizontal: 20 }}>
            {/* Bars row */}
            <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-end', height: BAR_AREA_H + BAR_LABEL_H, gap: data.length > 14 ? 2 : 6 }}>
                {data.map((d, i) => {
                    const isMax = i === maxIdx;
                    const barH = d.value > 0 ? Math.max(6, (d.value / max) * BAR_AREA_H) : 0;
                    return (
                        <View
                            key={i}
                            style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: BAR_AREA_H + BAR_LABEL_H }}
                        >
                            {/* Value label sits above bar, pinned to bar top */}
                            <Text
                                style={{
                                    color: isMax ? color : C.mutedForeground,
                                    fontSize: data.length > 14 ? 7 : 9,
                                    fontWeight: isMax ? '700' : '400',
                                    marginBottom: 3,
                                    height: BAR_LABEL_H,
                                    textAlignVertical: 'bottom',
                                }}
                            >
                                {abbreviate(d.value)}
                            </Text>
                            {/* Bar */}
                            <View style={{
                                width: '100%',
                                height: barH,
                                backgroundColor: isMax ? color : `${color}55`,
                                borderTopLeftRadius: 5,
                                borderTopRightRadius: 5,
                            }} />
                        </View>
                    );
                })}
            </View>
            {/* X-axis labels */}
            <View style={{ flexDirection: 'row-reverse', marginTop: 6, gap: data.length > 14 ? 2 : 6 }}>
                {data.map((d, i) => {
                    // Show at most 8 labels; always show first and last
                    const step = Math.max(1, Math.ceil(data.length / 8));
                    const show = i % step === 0 || i === data.length - 1;
                    return (
                        <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                            {show && (
                                <Text style={{ color: C.mutedForeground, fontSize: data.length > 14 ? 8 : 10, textAlign: 'center' }}>
                                    {d.label}
                                </Text>
                            )}
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

// ── Stat row inside the hero card ──────────────────────────────────────────────
function StatRow({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color, fontSize: 14, fontWeight: '700' }}>{value}</Text>
            <Text style={{ color, fontSize: 12, fontWeight: '500', opacity: 0.75 }}>{label}</Text>
        </View>
    );
}

// ── KPI chip (small pill) ──────────────────────────────────────────────────────
function KpiChip({ icon, label, value, color, bg }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string; value: string | number;
    color: string; bg: string;
}) {
    return (
        <View style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: bg, borderRadius: 14, padding: 12 }}>
            <View style={{ backgroundColor: `${color}20`, borderRadius: 8, padding: 6 }}>
                <Ionicons name={icon} size={15} color={color} />
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

// ── Reports screen ─────────────────────────────────────────────────────────────
export default function ReportsScreen() {
    const { isDarkMode } = useTheme();
    const { isPharmacist, branchId: authBranchId } = useAuth();
    const { triggerSync } = useSyncStatus();
    const router = useRouter();
    const C = Colors(isDarkMode);

    const [report, setReport]         = useState<any>(null);
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [period, setPeriod]         = useState<Period>('daily');
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);

    const fetchReport = useCallback(async () => {
        try {
            const data = await apiService.getReports(period, selectedBranch ?? undefined);
            setReport(data);
        } catch (err) {
            console.error('ReportsScreen:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [period, selectedBranch]);

    useEffect(() => { setLoading(true); fetchReport(); }, [fetchReport]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        triggerSync('stats');
        fetchReport();
    }, [fetchReport, triggerSync]);

    const chartData = useMemo<ChartPoint[]>(() => {
        if (!Array.isArray(report?.chart)) return [];
        const opts: Intl.DateTimeFormatOptions =
            period === 'monthly' ? { day: 'numeric' } :
            period === 'weekly'  ? { day: 'numeric', month: 'short' } :
                                   { weekday: 'short' };
        return report.chart.map((item: any) => ({
            label: item.date ? formatDate(item.date, opts) : '',
            value: item.amount ?? 0,
        }));
    }, [report, period]);

    const bestDay = useMemo(() =>
        chartData.length === 0 ? null
            : chartData.reduce((b, c) => c.value > b.value ? c : b),
    [chartData]);

    const avgSale = useMemo(() => {
        const t = report?.transactions ?? 0, r = report?.revenue ?? 0;
        return t > 0 ? Math.round(r / t) : 0;
    }, [report]);

    const profitMargin = useMemo(() => {
        const r = report?.revenue ?? 0, p = report?.profit ?? 0;
        return r > 0 ? (p / r) * 100 : 0;
    }, [report]);

    // Profit bar: what fraction of revenue is kept as profit
    const profitBarPct = useMemo(() => {
        const r = report?.revenue ?? 0, p = report?.profit ?? 0;
        return r > 0 ? Math.max(0, Math.min(1, p / r)) : 0;
    }, [report]);

    const periodLabel = PERIODS.find(p => p.key === period)?.label ?? '';
    const profit = report?.profit ?? 0;
    const profitPositive = profit >= 0;

    // All hooks called — safe to branch
    if (isPharmacist) {
        return (
            <View style={{ flex: 1, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                <EmptyState
                    icon="lock-closed"
                    title="لا تملك صلاحية الوصول"
                    subtitle="هذه الصفحة مخصصة للمدير فقط"
                    actionLabel="رجوع"
                    onAction={() => router.back()}
                />
            </View>
        );
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ paddingBottom: 110 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            showsVerticalScrollIndicator={false}
        >
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginBottom: 2 }}>
                            {formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
                        </Text>
                        <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '900', textAlign: 'right' }}>
                            التقارير المالية
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => router.push('/reports/financial' as any)}
                        style={{
                            backgroundColor: C.primary, borderRadius: 14, padding: 11,
                            shadowColor: C.primary, shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
                        }}
                    >
                        <Ionicons name="stats-chart" size={22} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Period pills ───────────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
                <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                    {PERIODS.map(({ key, label }) => {
                        const sel = period === key;
                        return (
                            <TouchableOpacity
                                key={key}
                                onPress={() => setPeriod(key)}
                                activeOpacity={0.75}
                                style={{
                                    paddingHorizontal: 18, paddingVertical: 9,
                                    borderRadius: 24,
                                    backgroundColor: sel ? C.primary : C.card,
                                    borderWidth: 1.5,
                                    borderColor: sel ? C.primary : C.border,
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
            </View>

            {/* ── Branch selector (hidden for single-branch pharmacies) ────── */}
            <View style={{ paddingHorizontal: 20 }}>
                <BranchSelector
                    selectedBranchId={selectedBranch}
                    onSelectBranch={setSelectedBranch}
                    hideIfSingle
                />
            </View>

            {/* ── Loading skeleton ───────────────────────────────────────────── */}
            {loading && !refreshing ? (
                <View style={{ paddingHorizontal: 20, gap: 16, marginTop: 4 }}>
                    <Skeleton height={220} radius={20} />
                    <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                        <Skeleton height={80} radius={16} style={{ flex: 1 }} />
                        <Skeleton height={80} radius={16} style={{ flex: 1 }} />
                    </View>
                    <Skeleton height={220} radius={20} />
                </View>
            ) : (
                <View style={{ paddingHorizontal: 20, gap: 16, marginTop: 4 }}>

                    {/* ── Financial summary card (distinct from dashboard) ──── */}
                    <View style={{
                        backgroundColor: C.card,
                        borderRadius: 20,
                        borderWidth: 1, borderColor: C.border,
                        overflow: 'hidden',
                        shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: isDarkMode ? 0.3 : 0.08, shadowRadius: 10,
                        elevation: 4,
                    }}>
                        {/* Coloured header strip */}
                        <View style={{
                            backgroundColor: profitPositive ? C.success : C.danger,
                            paddingHorizontal: 20, paddingVertical: 12,
                            flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                                التحليل المالي — {periodLabel}
                            </Text>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5 }}>
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
                                <Text style={{
                                    color: profitPositive ? C.success : C.danger,
                                    fontSize: 36, fontWeight: '900',
                                }}>
                                    {Math.abs(profit).toLocaleString('en-US')}
                                    {'  '}
                                    <Text style={{ fontSize: 16, fontWeight: '600' }}>د.ع</Text>
                                </Text>
                            </View>

                            {/* Revenue / Expenses split bar */}
                            <View style={{ gap: 6 }}>
                                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                                    <Text style={{ color: C.success, fontSize: 13, fontWeight: '700' }}>
                                        {(report?.revenue ?? 0).toLocaleString('en-US')}
                                    </Text>
                                    <Text style={{ color: C.danger, fontSize: 13, fontWeight: '700' }}>
                                        {(report?.expenses ?? 0).toLocaleString('en-US')}
                                    </Text>
                                </View>
                                {/* Visual bar */}
                                <View style={{ height: 8, borderRadius: 4, backgroundColor: C.dangerBg, overflow: 'hidden', flexDirection: 'row-reverse' }}>
                                    <View style={{
                                        width: `${profitBarPct * 100}%`,
                                        backgroundColor: C.success,
                                        borderRadius: 4,
                                    }} />
                                </View>
                                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                                    <Text style={{ color: C.mutedForeground, fontSize: 10 }}>الإيرادات</Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 10 }}>المصروفات</Text>
                                </View>
                            </View>

                            {/* Divider */}
                            <View style={{ height: 1, backgroundColor: C.border }} />

                            {/* Transaction stats */}
                            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                                <KpiChip
                                    icon="receipt"
                                    label="عدد العمليات"
                                    value={report?.transactions ?? 0}
                                    color={C.info}
                                    bg={C.infoBg}
                                />
                                <KpiChip
                                    icon="calculator"
                                    label="متوسط الفاتورة"
                                    value={avgSale}
                                    color={C.warning}
                                    bg={C.warningBg}
                                />
                            </View>
                        </View>
                    </View>

                    {/* ── Bar chart card ────────────────────────────────────────── */}
                    {chartData.length >= 2 && (
                        <View style={{
                            backgroundColor: C.card,
                            borderRadius: 20, borderWidth: 1, borderColor: C.border,
                            paddingVertical: 20,
                            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: isDarkMode ? 0.25 : 0.06,
                            shadowRadius: 8, elevation: 2,
                        }}>
                            {/* Chart header */}
                            <View style={{
                                flexDirection: 'row-reverse', justifyContent: 'space-between',
                                alignItems: 'center', paddingHorizontal: 20, marginBottom: 16,
                            }}>
                                <View>
                                    <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15, textAlign: 'right' }}>
                                        المبيعات خلال الفترة
                                    </Text>
                                    {bestDay && (
                                        <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                                            أعلى: {bestDay.label} ({bestDay.value.toLocaleString('en-US')} د.ع)
                                        </Text>
                                    )}
                                </View>
                                <View style={{ backgroundColor: C.primaryMuted, borderRadius: 10, padding: 8 }}>
                                    <Ionicons name="bar-chart" size={18} color={C.primary} />
                                </View>
                            </View>

                            <BarChart data={chartData} color={C.primary} isDark={isDarkMode} />
                        </View>
                    )}

                    {/* ── Best-day trophy card ──────────────────────────────────── */}
                    {bestDay && bestDay.value > 0 && (
                        <View style={{
                            flexDirection: 'row-reverse', alignItems: 'center',
                            backgroundColor: C.primaryMuted,
                            borderRadius: 16, padding: 14, gap: 12,
                            borderWidth: 1, borderColor: `${C.primary}30`,
                        }}>
                            <View style={{ backgroundColor: `${C.primary}20`, borderRadius: 12, padding: 10 }}>
                                <Ionicons name="trophy" size={20} color={C.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontWeight: '700', textAlign: 'right', fontSize: 13 }}>
                                    أفضل أداء في الفترة
                                </Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }}>
                                    {bestDay.label} — {bestDay.value.toLocaleString('en-US')} د.ع
                                </Text>
                            </View>
                        </View>
                    )}

                </View>
            )}
        </ScrollView>
    );
}
