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
const CHART_H    = 160;
const CHART_TOP  = 18;  // top padding inside chart canvas

type Period = 'daily' | 'weekly' | 'monthly';
const PERIODS: { key: Period; label: string }[] = [
    { key: 'daily',   label: 'يومي' },
    { key: 'weekly',  label: 'أسبوعي' },
    { key: 'monthly', label: 'شهري' },
];

// ── Catmull-Rom spline ─────────────────────────────────────────────────────────
type Pt = { x: number; y: number };

function catmullRom(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
    const t2 = t * t, t3 = t2 * t;
    return {
        x: 0.5*(2*p1.x+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
        y: 0.5*(2*p1.y+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
    };
}

function buildSpline(pts: Pt[], steps: number): Pt[] {
    if (pts.length < 2) return pts;
    const out: Pt[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i-1)], p1 = pts[i];
        const p2 = pts[i+1], p3 = pts[Math.min(pts.length-1, i+2)];
        for (let s = 0; s < steps; s++) out.push(catmullRom(p0, p1, p2, p3, s/steps));
    }
    out.push(pts[pts.length - 1]);
    return out;
}

// ── Smooth area chart ──────────────────────────────────────────────────────────
interface ChartPoint { label: string; value: number; }

function SmoothChart({ data, color, isDark }: { data: ChartPoint[]; color: string; isDark: boolean }) {
    const C = Colors(isDark);
    // card has 20px screen padding + 20px internal padding on each side
    const chartW = SCREEN_W - 80;
    const usableH = CHART_H - CHART_TOP - 8;

    if (data.length < 2) {
        return (
            <View style={{ height: CHART_H, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
                <Text style={{ color: C.mutedForeground }}>لا توجد بيانات كافية</Text>
            </View>
        );
    }

    const max = Math.max(...data.map(d => d.value), 1);
    const steps = data.length <= 7 ? 14 : data.length <= 14 ? 8 : 4;

    const ctrlPts: Pt[] = data.map((d, i) => ({
        x: (i / (data.length - 1)) * chartW,
        y: CHART_TOP + (1 - d.value / max) * usableH,
    }));
    const curve = buildSpline(ctrlPts, steps);
    const segW = chartW / Math.max(curve.length - 1, 1) + 0.5;

    // Show at most 7 x-axis labels
    const labelStep = Math.max(1, Math.ceil(data.length / 7));

    return (
        <View style={{ paddingHorizontal: 20 }}>
            {/* Canvas */}
            <View style={{ height: CHART_H, position: 'relative', overflow: 'hidden' }}>

                {/* Horizontal grid lines */}
                {[0.25, 0.5, 0.75].map(frac => (
                    <View key={frac} style={{
                        position: 'absolute', left: 0, right: 0,
                        top: CHART_TOP + (1 - frac) * usableH,
                        height: 1, backgroundColor: C.border, opacity: 0.5,
                    }} />
                ))}

                {/* Area fill: vertical column under each spline point */}
                {curve.map((pt, i) => (
                    <View key={`a${i}`} style={{
                        position: 'absolute',
                        left: pt.x, top: pt.y,
                        width: segW, height: CHART_H - pt.y,
                        backgroundColor: color, opacity: 0.07,
                    }} />
                ))}

                {/* Curve line segments */}
                {curve.slice(0, -1).map((pt, i) => {
                    const nx = curve[i + 1];
                    const dx = nx.x - pt.x, dy = nx.y - pt.y;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    if (len < 0.4) return null;
                    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                    return (
                        <View key={`l${i}`} style={{
                            position: 'absolute',
                            left: (pt.x + nx.x)/2 - len/2,
                            top:  (pt.y + nx.y)/2 - 1.5,
                            width: len, height: 3,
                            backgroundColor: color, borderRadius: 1.5,
                            transform: [{ rotate: `${angle}deg` }],
                        }} />
                    );
                })}

                {/* Dots at original data points */}
                {ctrlPts.map((pt, i) => (
                    <View key={`d${i}`} style={{
                        position: 'absolute',
                        left: pt.x - 5, top: pt.y - 5,
                        width: 10, height: 10, borderRadius: 5,
                        backgroundColor: color,
                        borderWidth: 2.5,
                        borderColor: isDark ? C.card : '#fff',
                        elevation: 2,
                    }} />
                ))}

            </View>

            {/* X-axis labels */}
            <View style={{ flexDirection: 'row-reverse', marginTop: 10 }}>
                {data.map((d, i) => (
                    <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                        {i % labelStep === 0 && (
                            <Text style={{ color: C.mutedForeground, fontSize: 10, textAlign: 'center' }}>
                                {d.label}
                            </Text>
                        )}
                    </View>
                ))}
            </View>
        </View>
    );
}

// ── KPI tile ───────────────────────────────────────────────────────────────────
function KpiTile({ label, value, icon, color, bg }: {
    label: string; value: string | number;
    icon: keyof typeof Ionicons.glyphMap;
    color: string; bg: string;
}) {
    return (
        <View style={{ flex: 1, backgroundColor: bg, borderRadius: 18, padding: 16, alignItems: 'flex-end', gap: 8 }}>
            <View style={{ backgroundColor: `${color}20`, borderRadius: 10, padding: 8 }}>
                <Ionicons name={icon} size={18} color={color} />
            </View>
            <Text
                numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
                style={{ color, fontSize: 18, fontWeight: '900', textAlign: 'right' }}
            >
                {typeof value === 'number' ? value.toLocaleString('en-US') : value}
            </Text>
            <Text style={{ color: `${color}99`, fontSize: 11, fontWeight: '600', textAlign: 'right' }}>
                {label}
            </Text>
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

    const [report, setReport]           = useState<any>(null);
    const [loading, setLoading]         = useState(true);
    const [refreshing, setRefreshing]   = useState(false);
    const [period, setPeriod]           = useState<Period>('daily');
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
            period === 'monthly'  ? { day: 'numeric' } :
            period === 'weekly'   ? { day: 'numeric', month: 'short' } :
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

    const periodLabel = PERIODS.find(p => p.key === period)?.label ?? '';

    // All hooks done — safe to branch here
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
                        <Ionicons name="bar-chart" size={22} color="#fff" />
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

            {/* ── Branch selector ────────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 20 }}>
                <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} />
            </View>

            {/* ── Loading skeleton ───────────────────────────────────────────── */}
            {loading && !refreshing ? (
                <View style={{ paddingHorizontal: 20, gap: 16, marginTop: 4 }}>
                    <Skeleton height={190} radius={24} />
                    <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                        <Skeleton height={96} radius={18} style={{ flex: 1 }} />
                        <Skeleton height={96} radius={18} style={{ flex: 1 }} />
                    </View>
                    <Skeleton height={240} radius={20} />
                </View>
            ) : (
                <View style={{ paddingHorizontal: 20, gap: 20, marginTop: 4 }}>

                    {/* ── Hero net-profit card ───────────────────────────────── */}
                    <View style={{
                        backgroundColor: C.primary, borderRadius: 24, padding: 22,
                        shadowColor: C.primary, shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.35, shadowRadius: 16, elevation: 10,
                    }}>
                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500' }}>
                                صافي الربح ({periodLabel})
                            </Text>
                            <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 10, padding: 6 }}>
                                <Ionicons name="trending-up" size={18} color="#fff" />
                            </View>
                        </View>

                        <Text style={{ color: '#fff', fontSize: 38, fontWeight: '900', textAlign: 'right', marginBottom: 20 }}>
                            {(report?.profit ?? 0).toLocaleString('en-US')}
                            {'  '}
                            <Text style={{ fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>د.ع</Text>
                        </Text>

                        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                            {[
                                { label: 'الإيرادات', value: (report?.revenue  ?? 0).toLocaleString('en-US'), icon: 'arrow-up-circle'   as const },
                                { label: 'المصروفات', value: (report?.expenses ?? 0).toLocaleString('en-US'), icon: 'arrow-down-circle' as const },
                                { label: 'العمليات',  value: String(report?.transactions ?? 0),               icon: 'receipt'          as const },
                            ].map(m => (
                                <View key={m.label} style={{
                                    flex: 1, backgroundColor: 'rgba(255,255,255,0.14)',
                                    borderRadius: 14, padding: 12, alignItems: 'center', gap: 4,
                                }}>
                                    <Ionicons name={m.icon} size={16} color="rgba(255,255,255,0.8)" />
                                    <Text
                                        numberOfLines={1} adjustsFontSizeToFit
                                        style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}
                                    >
                                        {m.value}
                                    </Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600' }}>
                                        {m.label}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* ── Secondary KPIs ───────────────────────────────────────── */}
                    <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                        <KpiTile
                            label="متوسط الفاتورة"
                            value={avgSale}
                            icon="calculator"
                            color={C.info}
                            bg={C.infoBg}
                        />
                        <KpiTile
                            label="هامش الربح"
                            value={`${profitMargin.toFixed(1)}%`}
                            icon="pie-chart"
                            color={profitMargin >= 0 ? C.success : C.danger}
                            bg={profitMargin >= 0 ? C.successBg : C.dangerBg}
                        />
                    </View>

                    {/* ── Smooth spline chart ───────────────────────────────────── */}
                    {chartData.length >= 2 && (
                        <View style={{
                            backgroundColor: C.card, borderRadius: 20,
                            paddingVertical: 20,
                            borderWidth: 1, borderColor: C.border,
                            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: isDarkMode ? 0.25 : 0.06,
                            shadowRadius: 8, elevation: 2,
                        }}>
                            {/* Chart header */}
                            <View style={{
                                flexDirection: 'row-reverse', justifyContent: 'space-between',
                                alignItems: 'center', paddingHorizontal: 20, marginBottom: 16,
                            }}>
                                <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15 }}>
                                    أداء الفترة
                                </Text>
                                {bestDay && (
                                    <View style={{
                                        flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
                                        backgroundColor: C.successBg, borderRadius: 10,
                                        paddingHorizontal: 10, paddingVertical: 5,
                                    }}>
                                        <Ionicons name="star" size={11} color={C.success} />
                                        <Text style={{ color: C.success, fontSize: 11, fontWeight: '700' }}>
                                            أعلى: {bestDay.label}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            <SmoothChart data={chartData} color={C.primary} isDark={isDarkMode} />
                        </View>
                    )}

                    {/* ── Best day insight ──────────────────────────────────────── */}
                    {bestDay && bestDay.value > 0 && (
                        <View style={{
                            flexDirection: 'row-reverse', alignItems: 'center',
                            backgroundColor: C.primaryMuted,
                            borderRadius: 16, padding: 16, gap: 12,
                            borderWidth: 1, borderColor: `${C.primary}30`,
                        }}>
                            <View style={{ backgroundColor: `${C.primary}25`, borderRadius: 12, padding: 10 }}>
                                <Ionicons name="trophy" size={22} color={C.primary} />
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
