import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { request } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Radius } from '../../constants/colors';
import { BranchSelector } from '../../components/BranchSelector';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { usePalette, Surface, IconTile, SegmentedTabs, StatusBadge, SectionTitle, InfoNote, StateBlock, AppButton, Tone } from '../../components/ui/Kit';
import { formatDate } from '../../utils/date';
import { formatNumber, formatIQD, CURRENCY } from '../../utils/format';

type Period = 'daily' | 'weekly' | 'monthly';
type Section = 'products' | 'dead' | 'expiry';

interface ProductProfit { drugId: string; tradeName: string; totalRevenue: number; totalCost: number; totalQuantitySold: number; profitMargin: number }
interface DeadStockItem { drugId: string; tradeName: string; currentStock: number; estimatedValue: number; branch?: string }
interface NearExpiryItem { tradeName: string; quantity: number; expiryDate: string; daysRemaining: number; estimatedLoss: number; batchNumber?: string }
interface BranchRow { branchId: string; branchName: string; revenue: number; expenses: number; netProfit: number; profitMargin: number; salesCount: number }
interface AnalysisData {
    summary: {
        totalRevenue: number; totalCost: number; netProfit: number; overallMargin: number;
        deadStockCount: number; totalDeadStockValue: number; nearExpiryCount: number; totalNearExpiryLoss: number;
    };
    profitByProduct: ProductProfit[];
    deadStock: DeadStockItem[];
    nearExpiryLoss: NearExpiryItem[];
}

function periodRange(period: Period): { from: Date; to: Date } {
    const to = new Date();
    const from = new Date();
    if (period === 'weekly') from.setDate(from.getDate() - 6);
    else if (period === 'monthly') from.setDate(1);
    from.setHours(0, 0, 0, 0);
    return { from, to };
}

const marginTone = (m: number): Tone => (m >= 20 ? 'success' : m >= 10 ? 'warning' : 'danger');

type DrugSort = 'quantity' | 'profit' | 'margin';

const DRUG_SORTS: { key: DrugSort; label: string }[] = [
    { key: 'quantity', label: 'الأكثر بيعاً' },
    { key: 'profit',   label: 'الأعلى ربحاً' },
    { key: 'margin',   label: 'أعلى هامش' },
];

/** Drugs shown before «عرض المزيد». */
const DRUGS_PAGE = 10;

/** Financial analysis (design financial.png): sections per topic, explicit period, no forecasts. */
export default function FinancialReportScreen() {
    const C = usePalette();
    const insets = useSafeAreaInsets();
    const { branchId: authBranchId, isAdmin } = useAuth();

    const [analysis, setAnalysis]           = useState<AnalysisData | null>(null);
    const [branchComparison, setBranchComp] = useState<BranchRow[]>([]);
    const [loading, setLoading]             = useState(true);
    const [failed, setFailed]               = useState(false);
    const [refreshing, setRefreshing]       = useState(false);
    const [compLoading, setCompLoading]     = useState(false);
    const [period, setPeriod]               = useState<Period>('daily');
    const [section, setSection]             = useState<Section>('products');
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);
    const [drugSort, setDrugSort]           = useState<DrugSort>('quantity');
    const [drugLimit, setDrugLimit]         = useState(DRUGS_PAGE);
    const [showComparison, setShowComparison] = useState(false);

    const range = useMemo(() => periodRange(period), [period, refreshing]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchAnalysis = useCallback(async () => {
        try {
            let q = `?from=${range.from.toISOString()}&to=${range.to.toISOString()}`;
            if (selectedBranch) q += `&branchId=${selectedBranch}`;
            setAnalysis(await request<AnalysisData>(`/reports/profit-analysis${q}`));
            setFailed(false);
        } catch (err) {
            console.error('FinancialReportScreen:', err);
            setFailed(true);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [range, selectedBranch]);

    useEffect(() => { setLoading(true); fetchAnalysis(); }, [fetchAnalysis]);
    const onRefresh = useCallback(() => { setRefreshing(true); }, []);

    useEffect(() => {
        if (!isAdmin) return;
        setCompLoading(true);
        request<{ comparison: BranchRow[] }>('/reports/branch-comparison')
            .then(res => setBranchComp(Array.isArray(res.comparison) ? res.comparison : []))
            .catch(() => setBranchComp([]))
            .finally(() => setCompLoading(false));
    }, [isAdmin]);

    const summary = analysis?.summary;
    const netProfit = summary?.netProfit ?? 0;

    // Drugs, ordered by what the user picked; the list grows in pages of 10.
    const sortedDrugs = useMemo(() => {
        const list = [...(analysis?.profitByProduct ?? [])];
        return drugSort === 'quantity'
            ? list.sort((a, b) => b.totalQuantitySold - a.totalQuantitySold)
            : drugSort === 'profit'
                ? list.sort((a, b) => (b.totalRevenue - b.totalCost) - (a.totalRevenue - a.totalCost))
                : list.sort((a, b) => b.profitMargin - a.profitMargin);
    }, [analysis, drugSort]);
    const products = useMemo(() => sortedDrugs.slice(0, drugLimit), [sortedDrugs, drugLimit]);
    const dead = useMemo(() => (analysis?.deadStock ?? []).slice(0, 10), [analysis]);
    const expiry = useMemo(() => [...(analysis?.nearExpiryLoss ?? [])].sort((a, b) => a.daysRemaining - b.daysRemaining).slice(0, 10), [analysis]);

    const rangeLabel = period === 'daily'
        ? formatDate(range.to, { weekday: 'long', day: 'numeric', month: 'long' })
        : `${formatDate(range.from, { day: 'numeric', month: 'long' })} — ${formatDate(range.to, { day: 'numeric', month: 'long' })}`;

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <ScreenHeader title="التحليل المالي" subtitle={rangeLabel} fallbackHref="/(tabs)/reports" />

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 14 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            >
                <SegmentedTabs<Period>
                    items={[{ key: 'daily', label: 'يومي' }, { key: 'weekly', label: 'أسبوعي' }, { key: 'monthly', label: 'شهري' }]}
                    value={period}
                    onChange={setPeriod}
                />
                {isAdmin && <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} hideIfSingle />}

                {loading && !refreshing ? (
                    <StateBlock loading title="جارِ تحليل البيانات…" />
                ) : failed ? (
                    <StateBlock icon="cloud-offline-outline" title="تعذّر تحميل التحليل" message="تحقق من الاتصال ثم أعد المحاولة." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); fetchAnalysis(); }} />
                ) : (
                    <>
                        <Surface style={{ gap: 8 }}>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }}>إجمالي الربح</Text>
                                <IconTile icon="cash-outline" />
                            </View>
                            <Text style={{ color: netProfit >= 0 ? C.primary : C.danger, fontSize: 34, fontWeight: '900', textAlign: 'right' }}>
                                {netProfit < 0 ? '−' : ''}{formatNumber(Math.abs(netProfit))} <Text style={{ fontSize: 15, color: C.mutedForeground }}>{CURRENCY}</Text>
                            </Text>
                            <StatusBadge label={`هامش ${(summary?.overallMargin ?? 0).toFixed(1)}%`} tone={netProfit >= 0 ? 'success' : 'danger'} icon={netProfit >= 0 ? 'trending-up' : 'trending-down'} />
                            <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right' }}>الربح = الإيراد − تكلفة البضاعة المباعة خلال الفترة.</Text>
                        </Surface>

                        <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                            <MoneyTile label="الإيراد" icon="stats-chart-outline" tone="success" value={summary?.totalRevenue ?? 0} />
                            <MoneyTile label="التكلفة" icon="layers-outline" tone="danger" value={summary?.totalCost ?? 0} />
                        </View>

                        <Surface padded={false} style={{ overflow: 'hidden' }}>
                            <SegmentedTabs<Section>
                                items={[
                                    { key: 'products', label: 'الأدوية' },
                                    { key: 'dead', label: 'الراكد', count: summary?.deadStockCount || undefined },
                                    { key: 'expiry', label: 'الصلاحية', count: summary?.nearExpiryCount || undefined },
                                ]}
                                value={section}
                                onChange={setSection}
                                style={{ borderWidth: 0, borderRadius: 0, borderBottomWidth: 1, borderBottomColor: C.border }}
                            />
                            <View style={{ padding: 14, gap: 12 }}>
                                {section === 'products' && (products.length === 0 ? (
                                    <Text style={{ color: C.mutedForeground, textAlign: 'center', paddingVertical: 12 }}>لا توجد مبيعات في هذه الفترة</Text>
                                ) : (
                                    <>
                                        {/* Sort: one compact control on a single line */}
                                        <View style={{
                                            flexDirection: 'row-reverse', backgroundColor: C.background,
                                            borderRadius: Radius.control, padding: 3, height: 32,
                                        }}>
                                            {DRUG_SORTS.map(s => {
                                                const active = s.key === drugSort;
                                                return (
                                                    <TouchableOpacity
                                                        key={s.key}
                                                        onPress={() => { setDrugSort(s.key); setDrugLimit(DRUGS_PAGE); }}
                                                        activeOpacity={0.8}
                                                        accessibilityRole="button"
                                                        accessibilityState={{ selected: active }}
                                                        style={{
                                                            flex: 1, alignItems: 'center', justifyContent: 'center',
                                                            borderRadius: Radius.control - 1,
                                                            backgroundColor: active ? C.card : 'transparent',
                                                            borderWidth: 1, borderColor: active ? C.primary : 'transparent',
                                                        }}
                                                    >
                                                        <Text
                                                            numberOfLines={1}
                                                            adjustsFontSizeToFit
                                                            minimumFontScale={0.8}
                                                            style={{ color: active ? C.primary : C.mutedForeground, fontSize: 12, fontWeight: active ? '800' : '600' }}
                                                        >
                                                            {s.label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                        <View style={{ flexDirection: 'row-reverse' }}>
                                            <Text style={{ flex: 2, color: C.mutedForeground, fontSize: 12.5, textAlign: 'right' }}>الدواء</Text>
                                            <Text style={{ flex: 2, color: C.mutedForeground, fontSize: 12.5, textAlign: 'center' }}>المبيعات · الهامش</Text>
                                            <Text style={{ flex: 1.3, color: C.mutedForeground, fontSize: 12.5, textAlign: 'left' }}>الربح</Text>
                                        </View>
                                        {products.map(p => (
                                            <View key={p.drugId} style={{ flexDirection: 'row-reverse', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 }}>
                                                <Text style={{ flex: 2, color: C.foreground, fontSize: 14, fontWeight: '800', textAlign: 'right' }} numberOfLines={2}>{p.tradeName}</Text>
                                                {/* Sold units and margin on one line */}
                                                <View style={{ flex: 2, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                    <Text style={{ color: C.mutedForeground, fontSize: 12.5 }} numberOfLines={1}>
                                                        {formatNumber(p.totalQuantitySold)} وحدة
                                                    </Text>
                                                    <StatusBadge label={`${p.profitMargin.toFixed(0)}%`} tone={marginTone(p.profitMargin)} />
                                                </View>
                                                <Text style={{ flex: 1.3, color: C.primary, fontSize: 14, fontWeight: '900', textAlign: 'left' }}>{formatNumber(p.totalRevenue - p.totalCost)}</Text>
                                            </View>
                                        ))}
                                        {sortedDrugs.length > DRUGS_PAGE && (
                                            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 }}>
                                                {drugLimit < sortedDrugs.length ? (
                                                    <AppButton
                                                        label={`عرض المزيد (${formatNumber(sortedDrugs.length - drugLimit)})`}
                                                        icon="chevron-down"
                                                        variant="outline"
                                                        compact
                                                        onPress={() => setDrugLimit(n => n + DRUGS_PAGE)}
                                                    />
                                                ) : (
                                                    <AppButton
                                                        label="عرض أقل"
                                                        icon="chevron-up"
                                                        variant="outline"
                                                        compact
                                                        onPress={() => setDrugLimit(DRUGS_PAGE)}
                                                    />
                                                )}
                                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'center', marginTop: 6 }}>
                                                    {formatNumber(products.length)} من {formatNumber(sortedDrugs.length)} دواء بيع في هذه الفترة
                                                </Text>
                                            </View>
                                        )}
                                    </>
                                ))}

                                {section === 'dead' && (dead.length === 0 ? (
                                    <Text style={{ color: C.mutedForeground, textAlign: 'center', paddingVertical: 12 }}>لا يوجد مخزون راكد</Text>
                                ) : (
                                    <>
                                        <InfoNote tone="warning" text={`أصناف لم تُبع منذ أكثر من 90 يوماً · القيمة ${formatIQD(summary?.totalDeadStockValue ?? 0)}`} />
                                        {dead.map(item => (
                                            <View key={item.drugId} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '800', textAlign: 'right' }} numberOfLines={1}>{item.tradeName}</Text>
                                                    <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right' }}>
                                                        {formatNumber(item.currentStock)} وحدة متبقية{item.branch ? ` · ${item.branch}` : ''}
                                                    </Text>
                                                </View>
                                                <Text style={{ color: C.warning, fontSize: 14, fontWeight: '800' }}>{formatIQD(item.estimatedValue)}</Text>
                                            </View>
                                        ))}
                                    </>
                                ))}

                                {section === 'expiry' && (expiry.length === 0 ? (
                                    <Text style={{ color: C.mutedForeground, textAlign: 'center', paddingVertical: 12 }}>لا توجد دفعات قريبة من الانتهاء</Text>
                                ) : (
                                    <>
                                        <InfoNote tone="danger" text={`الخسارة المحتملة إن لم تُبع قبل الانتهاء: ${formatIQD(summary?.totalNearExpiryLoss ?? 0)}`} />
                                        {expiry.map((item, idx) => (
                                            <View key={`${item.tradeName}-${idx}`} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 }}>
                                                <StatusBadge label={item.daysRemaining <= 0 ? 'منتهي' : `${item.daysRemaining} يوم`} tone={item.daysRemaining <= 0 ? 'danger' : 'warning'} />
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '800', textAlign: 'right' }} numberOfLines={1}>{item.tradeName}</Text>
                                                    <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right' }}>{formatNumber(item.quantity)} وحدة{item.batchNumber ? ` · دفعة ${item.batchNumber}` : ''}</Text>
                                                </View>
                                                <Text style={{ color: C.danger, fontSize: 14, fontWeight: '800' }}>{formatIQD(item.estimatedLoss)}</Text>
                                            </View>
                                        ))}
                                    </>
                                ))}
                            </View>
                        </Surface>

                        {/* Branch comparison card (design financial.png): opens the comparison below */}
                        {isAdmin && (
                            <View>
                                <TouchableOpacity
                                    onPress={() => setShowComparison(v => !v)}
                                    activeOpacity={0.8}
                                    accessibilityRole="button"
                                    accessibilityState={{ expanded: showComparison }}
                                >
                                    <Surface style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
                                        <IconTile icon="stats-chart-outline" size={38} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right' }}>مقارنة الفروع</Text>
                                            <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right', marginTop: 2 }}>
                                                {compLoading ? 'جارِ التحميل…' : 'مقارنة الأداء بين فروع الصيدلية'}
                                            </Text>
                                        </View>
                                        <Ionicons name={showComparison ? 'chevron-down' : 'chevron-back'} size={20} color={C.primary} />
                                    </Surface>
                                </TouchableOpacity>
                                {showComparison && branchComparison.length <= 1 && !compLoading && (
                                    <InfoNote style={{ marginTop: 10 }} text="لا توجد مقارنة: المؤسسة تعمل بفرع واحد." />
                                )}
                            </View>
                        )}

                        {isAdmin && showComparison && branchComparison.length > 1 && (
                            <View>
                                <Surface padded={false} style={{ overflow: 'hidden' }}>
                                    {branchComparison.map((b, idx) => {
                                        const maxRev = Math.max(...branchComparison.map(x => x.revenue), 1);
                                        return (
                                            <View key={b.branchId} style={{ padding: 14, gap: 8, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: C.border }}>
                                                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '800' }}>{b.branchName}</Text>
                                                    <StatusBadge label={`هامش ${b.profitMargin}%`} tone={marginTone(b.profitMargin)} />
                                                </View>
                                                <View style={{ height: 6, backgroundColor: C.input, borderRadius: 3, overflow: 'hidden', flexDirection: 'row-reverse' }}>
                                                    <View style={{ width: `${(b.revenue / maxRev) * 100}%`, backgroundColor: C.primary, borderRadius: 3 }} />
                                                </View>
                                                <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right' }}>
                                                    الإيراد {formatIQD(b.revenue)} · صافي الربح {formatIQD(b.netProfit)} · {formatNumber(b.salesCount)} فاتورة
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </Surface>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 6 }}>مقارنة الفروع لكامل الفترة المتاحة على الخادم، وليست مقيدة بفلتر الفترة أعلاه.</Text>
                            </View>
                        )}
                        {compLoading && branchComparison.length === 0 && isAdmin ? <ActivityIndicator color={C.primary} /> : null}
                        <View style={{ height: Radius.card }} />
                    </>
                )}
            </ScrollView>
        </View>
    );
}

/** Compact money tile: amount and currency on one line, tight vertical padding. */
function MoneyTile({ label, icon, tone, value }: {
    label: string; icon: React.ComponentProps<typeof IconTile>['icon']; tone: Tone; value: number;
}) {
    const C = usePalette();
    return (
        <Surface padded={false} style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: C.mutedForeground, fontSize: 13.5 }}>{label}</Text>
                <IconTile icon={icon} tone={tone} size={30} />
            </View>
            <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                style={{ color: C.foreground, fontSize: 19, fontWeight: '900', textAlign: 'right' }}
            >
                {formatNumber(value)} <Text style={{ fontSize: 11.5, fontWeight: '600', color: C.mutedForeground }}>{CURRENCY}</Text>
            </Text>
        </Surface>
    );
}
