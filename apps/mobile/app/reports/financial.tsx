import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, ActivityIndicator,
    TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { request } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { managerPalette, Radius } from '../../constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BranchSelector } from '../../components/BranchSelector';

type Palette = ReturnType<typeof managerPalette>;

// ── Types ──────────────────────────────────────────────────────────────────────
type Period = 'daily' | 'weekly' | 'monthly';
const PERIODS: { key: Period; label: string }[] = [
    { key: 'daily',   label: 'يومي' },
    { key: 'weekly',  label: 'أسبوعي' },
    { key: 'monthly', label: 'شهري' },
];

interface ProductProfit {
    drugId: string;
    tradeName: string;
    totalRevenue: number;
    totalCost: number;
    totalQuantitySold: number;
    profitMargin: number;
}
interface DeadStockItem {
    drugId: string;
    tradeName: string;
    currentStock: number;
    estimatedValue: number;
    branch?: string;
}
interface NearExpiryItem {
    tradeName: string;
    quantity: number;
    expiryDate: string;
    daysRemaining: number;
    estimatedLoss: number;
    batchNumber?: string;
}
interface BranchRow {
    branchId: string; branchName: string;
    revenue: number; expenses: number;
    netProfit: number; profitMargin: number; salesCount: number;
}
interface AnalysisData {
    summary: {
        totalRevenue: number;
        totalCost: number;
        netProfit: number;
        overallMargin: number;
        deadStockCount: number;
        totalDeadStockValue: number;
        nearExpiryCount: number;
        totalNearExpiryLoss: number;
    };
    profitByProduct: ProductProfit[];
    deadStock: DeadStockItem[];
    nearExpiryLoss: NearExpiryItem[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function abbr(n: number): string {
    if (n === 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} مليون`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)} ألف`;
    return n.toLocaleString('en-US');
}

function periodQuery(period: Period, branchId?: string | null): string {
    const now = new Date();
    const from = new Date();
    if (period === 'daily') {
        from.setHours(0, 0, 0, 0);
    } else if (period === 'weekly') {
        from.setDate(from.getDate() - 6);
        from.setHours(0, 0, 0, 0);
    } else {
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
    }
    let q = `?from=${from.toISOString()}&to=${now.toISOString()}`;
    if (branchId) q += `&branchId=${branchId}`;
    return q;
}

// ── Sub-components ─────────────────────────────────────────────────────────────
// Ranks use the brand accent (blue) so the page stays colour-coherent.
function RankBadge({ rank, C }: { rank: number; C: Palette }) {
    return (
        <View style={{
            width: 28, height: 28, borderRadius: Radius.xs,
            backgroundColor: `${C.primary}1A`,
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
            <Text style={{ color: C.primary, fontWeight: '900', fontSize: 12 }}>{rank}</Text>
        </View>
    );
}

function SectionHeader({
    title, icon, iconColor, iconBg, badge, C,
}: {
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string; iconBg: string;
    badge?: number;
    C: Palette;
}) {
    return (
        <View style={{
            flexDirection: 'row-reverse', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 16,
        }}>
            <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15 }}>{title}</Text>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                {badge !== undefined && badge > 0 && (
                    <View style={{ backgroundColor: iconColor, borderRadius: Radius.xs, paddingHorizontal: 9, paddingVertical: 2 }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{badge}</Text>
                    </View>
                )}
                <View style={{ backgroundColor: iconBg, borderRadius: Radius.xs, padding: 7 }}>
                    <Ionicons name={icon} size={16} color={iconColor} />
                </View>
            </View>
        </View>
    );
}

function Divider({ C }: { C: Palette }) {
    return <View style={{ height: 1, backgroundColor: C.border }} />;
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function FinancialReportScreen() {
    const { isDarkMode } = useTheme();
    const { branchId: authBranchId, isAdmin } = useAuth();
    const C = managerPalette(isDarkMode);
    const insets = useSafeAreaInsets();

    const [analysis, setAnalysis]           = useState<AnalysisData | null>(null);
    const [branchComparison, setBranchComp] = useState<BranchRow[]>([]);
    const [loading, setLoading]             = useState(true);
    const [refreshing, setRefreshing]       = useState(false);
    const [compLoading, setCompLoading]     = useState(false);
    const [period, setPeriod]               = useState<Period>('monthly');
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);

    // Outlined card matching the manager home — light surface, soft tinted accent border.
    const card = (accent: string) => ({
        backgroundColor: C.card,
        borderRadius: Radius.sm,
        borderWidth: 1.5,
        borderColor: `${accent}33`,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 } as const,
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
    });

    const fetchAnalysis = useCallback(async () => {
        try {
            const q = periodQuery(period, selectedBranch);
            const data = await request<AnalysisData>(`/reports/profit-analysis${q}`);
            setAnalysis(data);
        } catch (err) {
            console.error('FinancialReportScreen:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [period, selectedBranch]);

    useEffect(() => { setLoading(true); fetchAnalysis(); }, [fetchAnalysis]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchAnalysis(); }, [fetchAnalysis]);

    const fetchComparison = useCallback(async () => {
        if (!isAdmin) return;
        setCompLoading(true);
        try {
            const res = await request<{ comparison: BranchRow[] }>('/reports/branch-comparison');
            setBranchComp(Array.isArray(res.comparison) ? res.comparison : []);
        } catch {
            setBranchComp([]);
        } finally {
            setCompLoading(false);
        }
    }, [isAdmin]);

    useEffect(() => { fetchComparison(); }, [fetchComparison]);

    // ── Derived ────────────────────────────────────────────────────────────────
    const summary        = analysis?.summary;
    const netProfit      = summary?.netProfit ?? 0;
    const profitPositive = netProfit >= 0;
    const profitColor    = profitPositive ? C.success : C.danger;
    const profitBg       = profitPositive ? C.successBg : C.dangerBg;
    const showComparison = isAdmin && branchComparison.length > 1;

    const topByRevenue = useMemo(() =>
        (analysis?.profitByProduct ?? [])
            .slice()
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, 5),
    [analysis]);

    const topByMargin = useMemo(() =>
        (analysis?.profitByProduct ?? [])
            .filter(p => p.totalRevenue > 0)
            .slice()
            .sort((a, b) => b.profitMargin - a.profitMargin)
            .slice(0, 5),
    [analysis]);

    const nearExpiry = useMemo(() =>
        [...(analysis?.nearExpiryLoss ?? [])]
            .sort((a, b) => a.daysRemaining - b.daysRemaining)
            .slice(0, 6),
    [analysis]);

    const deadStock = useMemo(() =>
        (analysis?.deadStock ?? []).slice(0, 6),
    [analysis]);

    const periodLabel = PERIODS.find(p => p.key === period)?.label ?? '';
    const revenueBarPct = (summary?.totalRevenue ?? 0) > 0
        ? Math.max(0, Math.min(100, ((summary?.totalRevenue ?? 0) - (summary?.totalCost ?? 0)) / (summary?.totalRevenue ?? 1) * 100))
        : 0;

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>

            {/* ── Header bar (matches the purchases sub-page header) ──────────── */}
            <View style={{
                paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 10,
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: C.background,
            }}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    activeOpacity={0.8}
                    style={{ width: 40, height: 40, borderRadius: Radius.xs, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Ionicons name="arrow-forward" size={20} color={C.foreground} />
                </TouchableOpacity>
                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }}>تحليل الربحية</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            >
                {/* ── Period segmented control ───────────────────────────────── */}
                <View style={{
                    flexDirection: 'row-reverse',
                    backgroundColor: C.card,
                    borderRadius: Radius.sm,
                    borderWidth: 1.5,
                    borderColor: `${C.primary}33`,
                    padding: 4, gap: 4, marginBottom: 16,
                }}>
                    {PERIODS.map(({ key, label }) => {
                        const sel = period === key;
                        return (
                            <TouchableOpacity
                                key={key} onPress={() => setPeriod(key)} activeOpacity={0.8}
                                style={{
                                    flex: 1, paddingVertical: 9, borderRadius: Radius.xs,
                                    alignItems: 'center',
                                    backgroundColor: sel ? C.primary : 'transparent',
                                }}
                            >
                                <Text style={{ fontSize: 13, fontWeight: sel ? '800' : '600', color: sel ? '#fff' : C.mutedForeground }}>
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* ── Branch selector ────────────────────────────────────────── */}
                <BranchSelector
                    selectedBranchId={selectedBranch}
                    onSelectBranch={setSelectedBranch}
                    hideIfSingle
                    accent={C.primary}
                    accentMuted={C.primaryMuted}
                />

                {/* ── Loading ────────────────────────────────────────────────── */}
                {loading && !refreshing ? (
                    <View style={{ paddingVertical: 60, alignItems: 'center', gap: 12 }}>
                        <ActivityIndicator size="large" color={C.primary} />
                        <Text style={{ color: C.mutedForeground, fontSize: 13 }}>جاري تحليل البيانات...</Text>
                    </View>
                ) : (
                    <View style={{ gap: 16 }}>

                        {/* ══ 1. Profit Overview Card ═══════════════════════════ */}
                        <View style={{ ...card(C.primary), padding: 18, gap: 16 }}>
                            {/* Header: title + profit-margin badge */}
                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ color: C.foreground, fontSize: 13, fontWeight: '800' }}>
                                    تحليل الربحية — {periodLabel}
                                </Text>
                                <View style={{
                                    flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
                                    backgroundColor: profitBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.xs,
                                }}>
                                    <Ionicons name={profitPositive ? 'trending-up' : 'trending-down'} size={14} color={profitColor} />
                                    <Text style={{ color: profitColor, fontSize: 11, fontWeight: '800' }}>
                                        {summary?.overallMargin?.toFixed(1) ?? '0'}% هامش
                                    </Text>
                                </View>
                            </View>

                            {/* Net profit – large number */}
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>
                                    صافي الربح الإجمالي
                                </Text>
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6 }}>
                                    <Text style={{ color: profitColor, fontSize: 32, fontWeight: '900' }}>
                                        {abbr(Math.abs(netProfit))}
                                    </Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 14, fontWeight: '700' }}>د.ع</Text>
                                </View>
                            </View>

                            {/* Revenue / Cost split bar */}
                            <View style={{ gap: 6 }}>
                                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                                    <Text style={{ color: C.success, fontSize: 13, fontWeight: '800' }}>
                                        {abbr(summary?.totalRevenue ?? 0)} د.ع
                                    </Text>
                                    <Text style={{ color: C.danger, fontSize: 13, fontWeight: '800' }}>
                                        {abbr(summary?.totalCost ?? 0)} د.ع
                                    </Text>
                                </View>
                                <View style={{ height: 8, borderRadius: 4, backgroundColor: C.dangerBg, overflow: 'hidden', flexDirection: 'row-reverse' }}>
                                    <View style={{ width: `${revenueBarPct}%`, backgroundColor: C.success, borderRadius: 4 }} />
                                </View>
                                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                                    <Text style={{ color: C.mutedForeground, fontSize: 10 }}>الإيرادات الإجمالية</Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 10 }}>تكلفة البضاعة</Text>
                                </View>
                            </View>

                            <Divider C={C} />

                            {/* Risk KPIs */}
                            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                                <View style={{ flex: 1, backgroundColor: C.warningBg, borderRadius: Radius.sm, padding: 12, alignItems: 'center', gap: 3 }}>
                                    <Ionicons name="cube-outline" size={18} color={C.warning} />
                                    <Text style={{ color: C.warning, fontWeight: '900', fontSize: 18 }}>
                                        {summary?.deadStockCount ?? 0}
                                    </Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 9, fontWeight: '600', textAlign: 'center' }}>
                                        مخزون راكد
                                    </Text>
                                    <Text style={{ color: C.warning, fontSize: 10, fontWeight: '700' }}>
                                        {abbr(summary?.totalDeadStockValue ?? 0)} د.ع
                                    </Text>
                                </View>
                                <View style={{ flex: 1, backgroundColor: C.dangerBg, borderRadius: Radius.sm, padding: 12, alignItems: 'center', gap: 3 }}>
                                    <Ionicons name="time-outline" size={18} color={C.danger} />
                                    <Text style={{ color: C.danger, fontWeight: '900', fontSize: 18 }}>
                                        {summary?.nearExpiryCount ?? 0}
                                    </Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 9, fontWeight: '600', textAlign: 'center' }}>
                                        تنتهي قريباً
                                    </Text>
                                    <Text style={{ color: C.danger, fontSize: 10, fontWeight: '700' }}>
                                        {abbr(summary?.totalNearExpiryLoss ?? 0)} د.ع
                                    </Text>
                                </View>
                                <View style={{ flex: 1, backgroundColor: C.primaryMuted, borderRadius: Radius.sm, padding: 12, alignItems: 'center', gap: 3 }}>
                                    <Ionicons name="medkit-outline" size={18} color={C.primary} />
                                    <Text style={{ color: C.primary, fontWeight: '900', fontSize: 18 }}>
                                        {analysis?.profitByProduct?.length ?? 0}
                                    </Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 9, fontWeight: '600', textAlign: 'center' }}>
                                        صنف محلل
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* ══ 2. Top Products by Revenue ════════════════════════ */}
                        {topByRevenue.length > 0 && (
                            <View style={{ ...card(C.primary), padding: 18 }}>
                                <SectionHeader
                                    title="أكثر الأدوية مبيعاً"
                                    icon="podium"
                                    iconColor={C.primary}
                                    iconBg={C.primaryMuted}
                                    C={C}
                                />
                                <View style={{ gap: 14 }}>
                                    {topByRevenue.map((p, idx) => {
                                        const mc = p.profitMargin >= 20 ? C.success
                                                 : p.profitMargin >= 10 ? C.warning : C.danger;
                                        return (
                                            <View key={p.drugId}>
                                                {idx > 0 && <Divider C={C} />}
                                                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingTop: idx > 0 ? 14 : 0 }}>
                                                    <RankBadge rank={idx + 1} C={C} />
                                                    <View style={{ flex: 1 }}>
                                                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                                            <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 13, flex: 1, textAlign: 'right' }} numberOfLines={1}>
                                                                {p.tradeName}
                                                            </Text>
                                                            <View style={{ backgroundColor: `${mc}18`, borderRadius: Radius.xs, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 }}>
                                                                <Text style={{ color: mc, fontSize: 10, fontWeight: '800' }}>
                                                                    {p.profitMargin.toFixed(0)}% هامش
                                                                </Text>
                                                            </View>
                                                        </View>
                                                        {/* Margin progress bar */}
                                                        <View style={{ height: 4, backgroundColor: `${mc}22`, borderRadius: 2, overflow: 'hidden', flexDirection: 'row-reverse', marginBottom: 5 }}>
                                                            <View style={{ width: `${Math.min(100, Math.max(0, p.profitMargin))}%`, height: '100%', backgroundColor: mc, borderRadius: 2 }} />
                                                        </View>
                                                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                                                            <Text style={{ color: C.success, fontSize: 12, fontWeight: '700' }}>
                                                                {abbr(p.totalRevenue)} د.ع
                                                            </Text>
                                                            <Text style={{ color: C.mutedForeground, fontSize: 11 }}>
                                                                {p.totalQuantitySold.toLocaleString('en-US')} وحدة مباعة
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {/* ══ 3. Highest Profit Margins ════════════════════════ */}
                        {topByMargin.length > 0 && (
                            <View style={{ ...card(C.primary), padding: 18 }}>
                                <SectionHeader
                                    title="أعلى هوامش الربح"
                                    icon="ribbon"
                                    iconColor={C.primary}
                                    iconBg={C.primaryMuted}
                                    C={C}
                                />
                                {topByMargin.map((p, idx) => {
                                    const mc = p.profitMargin >= 20 ? C.success
                                             : p.profitMargin >= 10 ? C.warning : C.danger;
                                    return (
                                        <View key={p.drugId} style={{ marginBottom: idx < topByMargin.length - 1 ? 12 : 0 }}>
                                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                                                {/* Margin pill */}
                                                <View style={{ backgroundColor: `${mc}18`, borderRadius: Radius.xs, paddingHorizontal: 10, paddingVertical: 5, minWidth: 56, alignItems: 'center' }}>
                                                    <Text style={{ color: mc, fontSize: 14, fontWeight: '900' }}>
                                                        {p.profitMargin.toFixed(0)}%
                                                    </Text>
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 13, textAlign: 'right' }} numberOfLines={1}>
                                                        {p.tradeName}
                                                    </Text>
                                                    <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 1 }}>
                                                        ربح: {abbr(p.totalRevenue - p.totalCost)} د.ع · {p.totalQuantitySold} وحدة
                                                    </Text>
                                                </View>
                                            </View>
                                            {idx < topByMargin.length - 1 && (
                                                <View style={{ height: 1, backgroundColor: C.border, marginTop: 12 }} />
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        {/* ══ 4. Near-Expiry Risk ═══════════════════════════════ */}
                        {nearExpiry.length > 0 && (
                            <View style={{ ...card(C.danger), overflow: 'hidden' }}>
                                {/* Tinted header */}
                                <View style={{
                                    backgroundColor: `${C.danger}12`,
                                    borderBottomWidth: 1, borderBottomColor: `${C.danger}25`,
                                    paddingHorizontal: 18, paddingVertical: 14,
                                }}>
                                    <SectionHeader
                                        title="خطر انتهاء الصلاحية"
                                        icon="skull-outline"
                                        iconColor={C.danger}
                                        iconBg={C.dangerBg}
                                        badge={analysis?.nearExpiryLoss?.length}
                                        C={C}
                                    />
                                    {/* Total loss banner */}
                                    <View style={{
                                        flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                                        backgroundColor: C.dangerBg, borderRadius: Radius.sm, padding: 12,
                                    }}>
                                        <Ionicons name="warning" size={16} color={C.danger} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: C.danger, fontWeight: '700', fontSize: 12, textAlign: 'right' }}>
                                                إجمالي الخسائر المحتملة
                                            </Text>
                                            <Text style={{ color: C.danger, fontWeight: '900', fontSize: 16, textAlign: 'right' }}>
                                                {abbr(summary?.totalNearExpiryLoss ?? 0)} د.ع
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                <View style={{ padding: 18, gap: 14 }}>
                                    {nearExpiry.map((item, idx) => {
                                        const expired = item.daysRemaining <= 0;
                                        const urgentC = expired ? C.danger
                                                      : item.daysRemaining <= 30 ? C.warning
                                                      : C.mutedForeground;
                                        const urgentBg = expired ? C.dangerBg
                                                       : item.daysRemaining <= 30 ? C.warningBg
                                                       : C.border;
                                        return (
                                            <View key={idx}>
                                                {idx > 0 && <Divider C={C} />}
                                                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingTop: idx > 0 ? 14 : 0 }}>
                                                    {/* Days pill */}
                                                    <View style={{ backgroundColor: urgentBg, borderRadius: Radius.xs, paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center', minWidth: 52 }}>
                                                        <Text style={{ color: urgentC, fontWeight: '900', fontSize: 14 }}>
                                                            {expired ? '!' : item.daysRemaining}
                                                        </Text>
                                                        <Text style={{ color: urgentC, fontSize: 8, fontWeight: '600', marginTop: 1 }}>
                                                            {expired ? 'منتهي' : 'يوم'}
                                                        </Text>
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 13, textAlign: 'right' }} numberOfLines={1}>
                                                            {item.tradeName}
                                                        </Text>
                                                        <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                                                            {item.quantity} وحدة
                                                        </Text>
                                                    </View>
                                                    <Text style={{ color: C.danger, fontWeight: '800', fontSize: 13 }}>
                                                        {abbr(item.estimatedLoss)} د.ع
                                                    </Text>
                                                </View>
                                            </View>
                                        );
                                    })}
                                    {(analysis?.nearExpiryLoss?.length ?? 0) > 6 && (
                                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                                            و {(analysis?.nearExpiryLoss?.length ?? 0) - 6} دفعات أخرى...
                                        </Text>
                                    )}
                                </View>
                            </View>
                        )}

                        {/* ══ 5. Dead Stock ════════════════════════════════════ */}
                        {deadStock.length > 0 && (
                            <View style={{ ...card(C.warning), overflow: 'hidden' }}>
                                <View style={{
                                    backgroundColor: `${C.warning}12`,
                                    borderBottomWidth: 1, borderBottomColor: `${C.warning}25`,
                                    paddingHorizontal: 18, paddingVertical: 14,
                                }}>
                                    <SectionHeader
                                        title="مخزون راكد"
                                        icon="cube-outline"
                                        iconColor={C.warning}
                                        iconBg={C.warningBg}
                                        badge={analysis?.deadStock?.length}
                                        C={C}
                                    />
                                    <View style={{
                                        flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                                        backgroundColor: C.warningBg, borderRadius: Radius.sm, padding: 12,
                                    }}>
                                        <Ionicons name="information-circle" size={16} color={C.warning} />
                                        <Text style={{ color: C.mutedForeground, fontSize: 12, flex: 1, textAlign: 'right' }}>
                                            أصناف لم تُباع منذ أكثر من 90 يوماً
                                        </Text>
                                        <Text style={{ color: C.warning, fontWeight: '900', fontSize: 14 }}>
                                            {abbr(summary?.totalDeadStockValue ?? 0)} د.ع
                                        </Text>
                                    </View>
                                </View>

                                <View style={{ padding: 18, gap: 14 }}>
                                    {deadStock.map((item, idx) => (
                                        <View key={item.drugId}>
                                            {idx > 0 && <Divider C={C} />}
                                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingTop: idx > 0 ? 14 : 0 }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 13, textAlign: 'right' }} numberOfLines={1}>
                                                        {item.tradeName}
                                                    </Text>
                                                    <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                                                        {item.currentStock.toLocaleString('en-US')} وحدة متبقية
                                                        {item.branch ? ` · ${item.branch}` : ''}
                                                    </Text>
                                                </View>
                                                <View style={{ alignItems: 'flex-start', gap: 2 }}>
                                                    <Text style={{ color: C.warning, fontWeight: '800', fontSize: 13 }}>
                                                        {abbr(item.estimatedValue)} د.ع
                                                    </Text>
                                                    <Text style={{ color: C.mutedForeground, fontSize: 9 }}>قيمة مجمدة</Text>
                                                </View>
                                            </View>
                                        </View>
                                    ))}
                                    {(analysis?.deadStock?.length ?? 0) > 6 && (
                                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                                            و {(analysis?.deadStock?.length ?? 0) - 6} أصناف أخرى...
                                        </Text>
                                    )}
                                </View>
                            </View>
                        )}

                        {/* ══ 6. Branch Comparison (admin, >1 branch) ═══════════ */}
                        {showComparison && (
                            <View style={{ ...card(C.primary), padding: 18 }}>
                                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15 }}>
                                        مقارنة الفروع
                                    </Text>
                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                                        {compLoading && <ActivityIndicator size="small" color={C.primary} />}
                                        <View style={{ backgroundColor: C.primaryMuted, borderRadius: Radius.xs, padding: 7 }}>
                                            <Ionicons name="git-compare" size={16} color={C.primary} />
                                        </View>
                                    </View>
                                </View>
                                {branchComparison.map((branch, idx) => {
                                    const maxRev  = Math.max(...branchComparison.map(b => b.revenue), 1);
                                    const barPct  = branch.revenue / maxRev;
                                    const mc      = branch.profitMargin >= 20 ? C.success
                                                  : branch.profitMargin >= 10 ? C.warning : C.danger;
                                    const mcBg    = branch.profitMargin >= 20 ? C.successBg
                                                  : branch.profitMargin >= 10 ? C.warningBg : C.dangerBg;
                                    return (
                                        <View key={branch.branchId} style={{
                                            borderTopWidth: idx === 0 ? 0 : 1,
                                            borderTopColor: C.border,
                                            paddingTop: idx === 0 ? 0 : 14,
                                            marginTop: idx === 0 ? 0 : 14,
                                        }}>
                                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 13 }}>
                                                    {branch.branchName}
                                                </Text>
                                                <View style={{ backgroundColor: mcBg, borderRadius: Radius.xs, paddingHorizontal: 8, paddingVertical: 3 }}>
                                                    <Text style={{ color: mc, fontSize: 11, fontWeight: '700' }}>
                                                        {branch.profitMargin}% هامش
                                                    </Text>
                                                </View>
                                            </View>
                                            <View style={{ height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden', flexDirection: 'row-reverse', marginBottom: 10 }}>
                                                <View style={{ width: `${barPct * 100}%`, backgroundColor: C.primary, borderRadius: 3 }} />
                                            </View>
                                            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                                                {[
                                                    { label: 'الإيرادات',  value: abbr(branch.revenue),    color: C.success },
                                                    { label: 'صافي الربح', value: abbr(branch.netProfit),   color: branch.netProfit >= 0 ? C.success : C.danger },
                                                    { label: 'المبيعات',   value: String(branch.salesCount), color: C.primary },
                                                ].map(s => (
                                                    <View key={s.label} style={{
                                                        flex: 1, backgroundColor: C.background,
                                                        borderRadius: Radius.xs, padding: 8, alignItems: 'center',
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

                        {/* ── Empty state ────────────────────────────────────── */}
                        {!loading
                            && !topByRevenue.length
                            && !nearExpiry.length
                            && !deadStock.length
                            && (
                            <View style={{ paddingVertical: 40, alignItems: 'center', gap: 10 }}>
                                <Ionicons name="analytics-outline" size={48} color={C.mutedForeground} />
                                <Text style={{ color: C.mutedForeground, fontSize: 14, fontWeight: '600' }}>
                                    لا توجد بيانات للفترة المحددة
                                </Text>
                            </View>
                        )}

                    </View>
                )}
            </ScrollView>
        </View>
    );
}
