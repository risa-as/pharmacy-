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
import { Colors } from '../../constants/colors';
import { BranchSelector } from '../../components/BranchSelector';

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
function RankBadge({ rank }: { rank: number }) {
    const MEDAL = ['#FFD700', '#C0C0C0', '#CD7F32'];
    const color = rank <= 3 ? MEDAL[rank - 1] : '#888888';
    return (
        <View style={{
            width: 28, height: 28, borderRadius: 14,
            backgroundColor: `${color}22`,
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
            <Text style={{ color, fontWeight: '900', fontSize: 12 }}>{rank}</Text>
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
    C: ReturnType<typeof Colors>;
}) {
    return (
        <View style={{
            flexDirection: 'row-reverse', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 16,
        }}>
            <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15 }}>{title}</Text>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                {badge !== undefined && badge > 0 && (
                    <View style={{ backgroundColor: iconColor, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 2 }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{badge}</Text>
                    </View>
                )}
                <View style={{ backgroundColor: iconBg, borderRadius: 10, padding: 7 }}>
                    <Ionicons name={icon} size={16} color={iconColor} />
                </View>
            </View>
        </View>
    );
}

function Divider({ C }: { C: ReturnType<typeof Colors> }) {
    return <View style={{ height: 1, backgroundColor: C.border }} />;
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function FinancialReportScreen() {
    const { isDarkMode } = useTheme();
    const { branchId: authBranchId, isAdmin } = useAuth();
    const C = Colors(isDarkMode);

    const [analysis, setAnalysis]           = useState<AnalysisData | null>(null);
    const [branchComparison, setBranchComp] = useState<BranchRow[]>([]);
    const [loading, setLoading]             = useState(true);
    const [refreshing, setRefreshing]       = useState(false);
    const [compLoading, setCompLoading]     = useState(false);
    const [period, setPeriod]               = useState<Period>('monthly');
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);

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

    const cardStyle = {
        backgroundColor: C.card, borderRadius: 5,
        borderWidth: 1, borderColor: C.border,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 } as const,
        shadowOpacity: isDarkMode ? 0.2 : 0.05,
        shadowRadius: 6, elevation: 2,
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>

            {/* ── Header bar ─────────────────────────────────────────────────── */}
            <View style={{
                backgroundColor: C.card,
                flexDirection: 'row-reverse', alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
                borderBottomWidth: 1, borderBottomColor: C.border,
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isDarkMode ? 0.2 : 0.05, shadowRadius: 4, elevation: 3,
            }}>
                <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '800' }}>
                    تحليل الربحية
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
                {/* ── Period pills ───────────────────────────────────────────── */}
                <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 16 }}>
                    {PERIODS.map(({ key, label }) => {
                        const sel = period === key;
                        return (
                            <TouchableOpacity
                                key={key} onPress={() => setPeriod(key)} activeOpacity={0.75}
                                style={{
                                    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 5,
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

                {/* ── Branch selector ────────────────────────────────────────── */}
                <BranchSelector
                    selectedBranchId={selectedBranch}
                    onSelectBranch={setSelectedBranch}
                    hideIfSingle
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
                        <View style={{ ...cardStyle, overflow: 'hidden', elevation: 4,
                            shadowOpacity: isDarkMode ? 0.3 : 0.08, shadowRadius: 10 }}>
                            {/* Color strip */}
                            <View style={{
                                backgroundColor: profitPositive ? C.success : C.danger,
                                paddingHorizontal: 20, paddingVertical: 14,
                                flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <View>
                                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500' }}>
                                        تحليل الربحية — {periodLabel}
                                    </Text>
                                    <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 2 }}>
                                        {abbr(Math.abs(netProfit))}
                                        {'  '}
                                        <Text style={{ fontSize: 14, fontWeight: '600' }}>د.ع</Text>
                                    </Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 }}>
                                        صافي الربح الإجمالي
                                    </Text>
                                </View>
                                <View style={{ alignItems: 'center', gap: 6 }}>
                                    <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 40, padding: 12 }}>
                                        <Ionicons
                                            name={profitPositive ? 'trending-up' : 'trending-down'}
                                            size={28} color="#fff"
                                        />
                                    </View>
                                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>
                                        {summary?.overallMargin?.toFixed(1) ?? '0'}%
                                    </Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>هامش الربح</Text>
                                </View>
                            </View>

                            {/* Cost breakdown row */}
                            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>
                                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <Text style={{ color: C.success, fontSize: 13, fontWeight: '700' }}>
                                        {abbr(summary?.totalRevenue ?? 0)} د.ع
                                    </Text>
                                    <Text style={{ color: C.danger, fontSize: 13, fontWeight: '700' }}>
                                        {abbr(summary?.totalCost ?? 0)} د.ع
                                    </Text>
                                </View>
                                <View style={{ height: 7, borderRadius: 4, backgroundColor: C.dangerBg, overflow: 'hidden', flexDirection: 'row-reverse' }}>
                                    <View style={{
                                        width: `${(summary?.totalRevenue ?? 0) > 0
                                            ? Math.max(0, Math.min(100, ((summary?.totalRevenue ?? 0) - (summary?.totalCost ?? 0)) / (summary?.totalRevenue ?? 1) * 100))
                                            : 0}%`,
                                        backgroundColor: C.success, borderRadius: 4,
                                    }} />
                                </View>
                                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4, marginBottom: 16 }}>
                                    <Text style={{ color: C.mutedForeground, fontSize: 10 }}>الإيرادات الإجمالية</Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 10 }}>تكلفة البضاعة</Text>
                                </View>
                            </View>

                            <Divider C={C} />

                            {/* Risk KPIs */}
                            <View style={{ flexDirection: 'row-reverse', padding: 16, gap: 10 }}>
                                <View style={{ flex: 1, backgroundColor: C.warningBg, borderRadius: 14, padding: 12, alignItems: 'center', gap: 3 }}>
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
                                <View style={{ flex: 1, backgroundColor: C.dangerBg, borderRadius: 14, padding: 12, alignItems: 'center', gap: 3 }}>
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
                                <View style={{ flex: 1, backgroundColor: C.infoBg, borderRadius: 14, padding: 12, alignItems: 'center', gap: 3 }}>
                                    <Ionicons name="medkit-outline" size={18} color={C.info} />
                                    <Text style={{ color: C.info, fontWeight: '900', fontSize: 18 }}>
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
                            <View style={cardStyle}>
                                <View style={{ padding: 20 }}>
                                    <SectionHeader
                                        title="أكثر الأدوية مبيعاً"
                                        icon="podium"
                                        iconColor={C.success}
                                        iconBg={C.successBg}
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
                                                        <RankBadge rank={idx + 1} />
                                                        <View style={{ flex: 1 }}>
                                                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                                                <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 13, flex: 1, textAlign: 'right' }} numberOfLines={1}>
                                                                    {p.tradeName}
                                                                </Text>
                                                                <View style={{ backgroundColor: `${mc}18`, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 }}>
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
                            </View>
                        )}

                        {/* ══ 3. Highest Profit Margins ════════════════════════ */}
                        {topByMargin.length > 0 && (
                            <View style={cardStyle}>
                                <View style={{ padding: 20 }}>
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
                                                    <View style={{ backgroundColor: `${mc}18`, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, minWidth: 56, alignItems: 'center' }}>
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
                            </View>
                        )}

                        {/* ══ 4. Near-Expiry Risk ═══════════════════════════════ */}
                        {nearExpiry.length > 0 && (
                            <View style={{ ...cardStyle, overflow: 'hidden' }}>
                                {/* Tinted header */}
                                <View style={{
                                    backgroundColor: `${C.danger}12`,
                                    borderBottomWidth: 1, borderBottomColor: `${C.danger}25`,
                                    paddingHorizontal: 20, paddingVertical: 14,
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
                                        backgroundColor: C.dangerBg, borderRadius: 12, padding: 12,
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

                                <View style={{ padding: 20, gap: 14 }}>
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
                                                    <View style={{ backgroundColor: urgentBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center', minWidth: 52 }}>
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
                            <View style={{ ...cardStyle, overflow: 'hidden' }}>
                                <View style={{
                                    backgroundColor: `${C.warning}12`,
                                    borderBottomWidth: 1, borderBottomColor: `${C.warning}25`,
                                    paddingHorizontal: 20, paddingVertical: 14,
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
                                        backgroundColor: C.warningBg, borderRadius: 12, padding: 12,
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

                                <View style={{ padding: 20, gap: 14 }}>
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
                            <View style={cardStyle}>
                                <View style={{ padding: 20 }}>
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
                                                    <View style={{ backgroundColor: mcBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
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
                                                        { label: 'المبيعات',   value: String(branch.salesCount), color: C.info },
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
