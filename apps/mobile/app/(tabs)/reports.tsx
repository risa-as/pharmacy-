import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { apiService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Radius } from '../../constants/colors';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { BranchSelector, ALL_BRANCHES_LABEL } from '../../components/BranchSelector';
import { useSyncStatus } from '../../context/SyncContext';
import { usePalette, Surface, IconTile, SegmentedTabs, ListRow, StateBlock } from '../../components/ui/Kit';
import { formatDate } from '../../utils/date';
import { formatNumber, CURRENCY } from '../../utils/format';

type Period = 'daily' | 'weekly' | 'monthly';

/**
 * `label` is the short axis text, `detail` the full description shown above
 * the chart for the active bar, and `tick` marks which bars get an axis label.
 */
interface ChartPoint { label: string; value: number; detail?: string; tick?: boolean }

/** Hourly bars get an axis label every 4 hours (8ص، 12م، 4م، 8م). */
const HOUR_TICK_EVERY = 4;

function hourText(h: number): { time: string; period: string } {
    const display = h % 12 === 0 ? 12 : h % 12;
    return { time: `${display}:00`, period: h < 12 ? 'صباحاً' : 'مساءً' };
}

/** "10:00 – 11:00 صباحاً", or "11:00 صباحاً – 12:00 مساءً" across noon. */
function hourRangeText(h: number): string {
    const from = hourText(h);
    const to = hourText(h + 1);
    return from.period === to.period
        ? `${from.time} – ${to.time} ${to.period}`
        : `${from.time} ${from.period} – ${to.time} ${to.period}`;
}

/**
 * Splits the label row into flex segments measured in bar columns, so each
 * label box spans several columns centred on its bar instead of being
 * squeezed into one bar's width.
 */
function labelSegments(n: number, ticks: number[]): { flex: number; index: number | null }[] {
    if (n === 0) return [];
    const minGap = ticks.slice(1).reduce((g, t, k) => Math.min(g, t - ticks[k]), n);
    const span = Math.max(1, minGap % 2 === 0 ? minGap - 1 : minGap);
    const half = Math.floor(span / 2);
    const segments: { flex: number; index: number | null }[] = [];
    let cursor = 0;
    for (const t of ticks) {
        const start = Math.max(cursor, t - half);
        const end = Math.min(n - 1, t + half);
        if (end < start) continue;
        if (start > cursor) segments.push({ flex: start - cursor, index: null });
        segments.push({ flex: end - start + 1, index: t });
        cursor = end + 1;
    }
    if (cursor < n) segments.push({ flex: n - cursor, index: null });
    return segments;
}

function niceMax(v: number): number {
    if (v <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * pow;
}

/**
 * Bar chart, flat colours, chronological right-to-left (earliest bar on the
 * right, as Arabic readers scan). Tap a bar to read its value.
 */
function BarChart({ data }: { data: ChartPoint[] }) {
    const C = usePalette();
    const [selected, setSelected] = useState<number | null>(null);
    useEffect(() => setSelected(null), [data]);

    const max = niceMax(Math.max(...data.map(d => d.value), 0));
    const ticks = [max, max / 2, 0];
    const CHART_H = 150;
    const barGap = data.length > 14 ? 2 : 6;
    const active = selected ?? data.reduce((mi, d, i, arr) => (d.value > arr[mi].value ? i : mi), 0);
    const segments = useMemo(() => {
        const hasTicks = data.some(d => d.tick !== undefined);
        const step = Math.max(1, Math.ceil(data.length / 7));
        const ticks = data.map((d, i) => i).filter(i => (hasTicks ? data[i].tick : i % step === 0));
        return labelSegments(data.length, ticks);
    }, [data]);
    const activePoint = data[active];

    return (
        <View style={{ gap: 8 }}>
            <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right' }}>
                {activePoint?.detail ?? activePoint?.label} · <Text style={{ color: C.foreground, fontWeight: '800' }}>{formatNumber(activePoint?.value ?? 0)} {CURRENCY}</Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
                {/* y-axis */}
                <View style={{ height: CHART_H, justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    {ticks.map(t => <Text key={t} style={{ color: C.mutedForeground, fontSize: 10.5 }}>{formatNumber(Math.round(t))}</Text>)}
                </View>
                <View style={{ flex: 1 }}>
                    {/* Columns are equal-width (gap is inner padding) so the label row's flex segments line up with the bars. */}
                    <View style={{ height: CHART_H, flexDirection: 'row-reverse', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: C.border }}>
                        {data.map((d, i) => (
                            <TouchableOpacity
                                key={i}
                                onPress={() => setSelected(i)}
                                activeOpacity={0.8}
                                accessibilityLabel={`${d.detail ?? d.label}: ${formatNumber(d.value)} ${CURRENCY}`}
                                style={{ flex: 1, height: '100%', justifyContent: 'flex-end', paddingHorizontal: barGap / 2 }}
                            >
                                <View style={{
                                    height: `${Math.max(d.value > 0 ? 3 : 0, (d.value / max) * 100)}%`,
                                    backgroundColor: i === active ? C.primary : `${C.primary}66`,
                                    borderTopLeftRadius: 3, borderTopRightRadius: 3,
                                }} />
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={{ flexDirection: 'row-reverse', marginTop: 4 }}>
                        {segments.map((s, k) => (
                            <Text key={k} numberOfLines={1} style={{ flex: s.flex, color: s.index === active ? C.primary : C.mutedForeground, fontSize: 11, textAlign: 'center' }}>
                                {s.index === null ? '' : data[s.index].label}
                            </Text>
                        ))}
                    </View>
                </View>
            </View>
        </View>
    );
}

/** Reports (design reports.png). */
export default function ReportsScreen() {
    const C = usePalette();
    const router = useRouter();
    const { isPharmacistShell, isAdmin, branchId: authBranchId } = useAuth();
    const { triggerSync } = useSyncStatus();

    const [report, setReport] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [period, setPeriod] = useState<Period>('daily');
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);
    const [branchName, setBranchName] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedBranch) { setBranchName(ALL_BRANCHES_LABEL); return; }
        apiService.getBranches().then(list => {
            setBranchName((Array.isArray(list) ? list : []).find((b: any) => b.id === selectedBranch)?.name ?? null);
        }).catch(() => {});
    }, [selectedBranch]);

    const fetchReport = useCallback(async () => {
        try {
            const data = await apiService.getReports(period, selectedBranch ?? undefined);
            setReport(data);
            setFailed(!data);
        } catch (err) {
            console.error('ReportsScreen:', err);
            setFailed(true);
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
        if (period === 'daily') {
            return report.chart.map((item: any) => {
                // Server sends hourly points as date "HH:00" with label "7ص".
                const hour = parseInt(String(item.date ?? ''), 10);
                const valid = Number.isFinite(hour);
                return {
                    label: item.label ?? '',
                    value: item.amount ?? 0,
                    detail: valid ? hourRangeText(hour) : undefined,
                    tick: valid && hour % HOUR_TICK_EVERY === 0,
                };
            });
        }
        const opts: Intl.DateTimeFormatOptions = period === 'weekly' ? { weekday: 'short' } : { day: 'numeric' };
        return report.chart.map((item: any) => ({
            label: item.date ? formatDate(item.date, opts) : '',
            value: item.amount ?? 0,
            detail: item.date ? formatDate(item.date, { weekday: 'long', day: 'numeric', month: 'long' }) : undefined,
        }));
    }, [report, period]);

    if (isPharmacistShell) {
        return (
            <View style={{ flex: 1, backgroundColor: C.background, justifyContent: 'center', padding: 24 }}>
                <EmptyState icon="lock-closed" title="لا تملك صلاحية الوصول" subtitle="هذه الصفحة مخصصة للإدارة" actionLabel="رجوع" onAction={() => router.back()} />
            </View>
        );
    }

    const revenue = report?.revenue ?? 0;
    const profit = report?.profit ?? 0;
    const transactions = report?.transactions ?? 0;
    const avgSale = transactions > 0 ? Math.round(revenue / transactions) : 0;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 14 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            showsVerticalScrollIndicator={false}
        >
            {isAdmin && <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} hideIfSingle />}

            <SegmentedTabs<Period>
                items={[{ key: 'daily', label: 'يومي' }, { key: 'weekly', label: 'أسبوعي' }, { key: 'monthly', label: 'شهري' }]}
                value={period}
                onChange={setPeriod}
            />

            {loading && !refreshing ? (
                <View style={{ gap: 14 }}>
                    <Skeleton height={300} radius={Radius.card} />
                    <Skeleton height={100} radius={Radius.card} />
                </View>
            ) : failed ? (
                <StateBlock icon="cloud-offline-outline" title="تعذّر تحميل التقرير" message="تحقق من الاتصال ثم أعد المحاولة." actionLabel="إعادة المحاولة" onAction={onRefresh} />
            ) : (
                <>
                    <Surface style={{ gap: 14 }}>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right' }}>إيراد الفترة</Text>
                                {branchName ? <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }}>{branchName}</Text> : null}
                            </View>
                            <IconTile icon="stats-chart-outline" />
                        </View>
                        <Text style={{ color: C.primary, fontSize: 34, fontWeight: '900', textAlign: 'right' }}>
                            {formatNumber(revenue)} <Text style={{ fontSize: 15, color: C.mutedForeground }}>{CURRENCY}</Text>
                        </Text>
                        {chartData.length >= 2 ? <BarChart data={chartData} /> : (
                            <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right' }}>لا توجد بيانات كافية لعرض المخطط في هذه الفترة.</Text>
                        )}
                    </Surface>

                    <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                        <Surface style={{ flex: 1, gap: 6 }}>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 14 }}>الفواتير</Text>
                                <IconTile icon="receipt-outline" size={36} />
                            </View>
                            <Text style={{ color: C.foreground, fontSize: 26, fontWeight: '900', textAlign: 'right' }}>{formatNumber(transactions)}</Text>
                            <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right' }}>متوسط الفاتورة {formatNumber(avgSale)} {CURRENCY}</Text>
                        </Surface>
                        <Surface style={{ flex: 1, gap: 6 }}>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 14 }}>الربح</Text>
                                <IconTile icon="cash-outline" tone={profit >= 0 ? 'success' : 'danger'} size={36} />
                            </View>
                            <Text style={{ color: profit >= 0 ? C.success : C.danger, fontSize: 26, fontWeight: '900', textAlign: 'right' }}>
                                {profit < 0 ? '−' : ''}{formatNumber(Math.abs(profit))}
                            </Text>
                            <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right' }}>المصروفات {formatNumber(report?.expenses ?? 0)} {CURRENCY}</Text>
                        </Surface>
                    </View>

                    <Surface padded={false} style={{ overflow: 'hidden' }}>
                        <ListRow icon="pie-chart-outline" tone="warning" title="تحليل الربحية" subtitle="المنتجات والراكد والصلاحية" divider onPress={() => router.push('/reports/financial' as Href)} />
                        <ListRow icon="people-outline" title="أداء الموظفين" subtitle="المبيعات والمعاملات" onPress={() => router.push('/reports/employees' as Href)} />
                    </Surface>
                </>
            )}
        </ScrollView>
    );
}
