import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Href } from 'expo-router';
import { apiService, request, getSessionGeneration } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { loadDashboardSections } from '../../utils/dashboard-loader';
import { Radius } from '../../constants/colors';
import { Skeleton } from '../ui/Skeleton';
import { BranchSelector } from '../BranchSelector';
import { ShiftSummaryHero } from './ShiftSummaryHero';
import { usePalette, Surface, IconTile, PressableCard, LinkLabel, SectionTitle, StatusBadge, Tone } from '../ui/Kit';
import { RecentSaleCard, RecentSale } from './RecentSaleCard';
import { formatDate } from '../../utils/date';
import { formatNumber, formatInvoiceNumber, paymentMethodLabel, CURRENCY } from '../../utils/format';



/** Manager home (design home-manager.png). */
export function AdminDashboard() {
    const C = usePalette();
    const router = useRouter();
    const { branchId, user, isAdmin } = useAuth();

    const [stats, setStats]                   = useState<any>(null);
    const [recentSales, setRecentSales]       = useState<RecentSale[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(branchId);
    const [loading, setLoading]               = useState(true);
    const [failed, setFailed]                 = useState(false);
    const [refreshing, setRefreshing]         = useState(false);

    const activeRequest = useRef(0);
    const [salesLoading, setSalesLoading] = useState(true);
    const [salesFailed, setSalesFailed] = useState(false);
    const fetchData = useCallback(async (forceRefresh = false) => {
        const issued = ++activeRequest.current;
        const session = getSessionGeneration();
        const current = () => issued === activeRequest.current && session === getSessionGeneration();
        setSalesLoading(true);
        await loadDashboardSections(
            () => apiService.getStats(selectedBranch ?? undefined, forceRefresh),
            // This section displays five rows, so request only five from the server.
            () => request<RecentSale[]>('/sales?limit=5', {}, false, { forceRefresh }),
            value => { if (current()) { setStats(value); setFailed(!value); } },
            value => { if (current()) { setRecentSales(Array.isArray(value) ? value.slice(0, 5) : []); setSalesFailed(false); } },
            () => { if (current()) setFailed(true); },
            () => { if (current()) setSalesFailed(true); },
            () => { if (current()) setLoading(false); },
        );
        if (current()) { setRefreshing(false); setSalesLoading(false); }
    }, [selectedBranch, user?.id]);

    useEffect(() => {
        setLoading(true); setStats(null); setRecentSales([]); setFailed(false);
        void fetchData();
        return () => { activeRequest.current++; };
    }, [fetchData]);
    const onRefresh = useCallback(() => { setRefreshing(true); void fetchData(true); }, [fetchData]);

    const firstName = user?.name?.trim().split(' ')[0] ?? '';
    const today = formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });
    const go = (href: string) => router.push(href as Href);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 16 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            showsVerticalScrollIndicator={false}
        >
            {/* Greeting + branch */}
            <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 12 }}>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: C.mutedForeground, fontSize: 13.5, textAlign: 'right' }}>{today}</Text>
                    <Text style={{ color: C.foreground, fontSize: 24, fontWeight: '900', textAlign: 'right' }}>أهلاً{firstName ? `، ${firstName}` : ''}</Text>
                </View>
                {isAdmin && (
                    <View style={{ width: '46%' }}>
                        <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} hideIfSingle />
                    </View>
                )}
            </View>

            {user?.role === 'ADMIN' && <PressableCard accessibilityLabel="المساعد الذكي" onPress={() => go('/assistant')} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
                <Ionicons name="sparkles-outline" size={28} color={C.primary} />
                <View style={{ flex: 1 }}><Text style={{ color: C.foreground, fontWeight: '800', fontSize: 16, textAlign: 'right' }}>المساعد الذكي</Text><Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 4 }}>اسأل عن أداء الصيدلية أو جهّز طلب شراء للمراجعة</Text></View>
                <Ionicons name="chevron-back" size={20} color={C.primary} />
            </PressableCard>}

            {loading && !refreshing ? (
                <View style={{ gap: 14 }}>
                    <Skeleton height={190} radius={Radius.card} />
                    <Skeleton height={86} radius={Radius.card} />
                    <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                        <Skeleton style={{ flex: 1 }} height={118} radius={Radius.card} />
                        <Skeleton style={{ flex: 1 }} height={118} radius={Radius.card} />
                    </View>
                </View>
            ) : failed ? (
                <Surface style={{ alignItems: 'center', gap: 8 }}>
                    <Ionicons name="cloud-offline-outline" size={32} color={C.mutedForeground} />
                    <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '800' }}>تعذّر تحميل ملخص اليوم</Text>
                    <TouchableOpacity onPress={onRefresh}><Text style={{ color: C.primary, fontWeight: '800' }}>إعادة المحاولة</Text></TouchableOpacity>
                </Surface>
            ) : (
                <>
                    <ShiftSummaryHero
                        title="ملخص اليوم"
                        headerIcon="stats-chart-outline"
                        dateLabel={formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
                        revenue={stats?.salesToday ?? 0}
                        // Same treatment as the pharmacist's card: no tinted strip.
                        metricsVariant="plain"
                        metrics={[
                            { icon: 'reader-outline', value: stats?.salesCount ?? 0, label: 'فاتورة', onPress: () => go('/sales-history') },
                            { icon: 'cash-outline', value: stats?.cashCount ?? 0, label: 'نقدي' },
                            { icon: 'time-outline', value: stats?.creditCount ?? 0, label: 'آجل', onPress: () => go('/(tabs)/debts') },
                        ]}
                    />

                    <View>
                        <SectionTitle title="نظرة سريعة" />
                        <PressableCard onPress={() => go('/(tabs)/debts')} containerStyle={{ marginBottom: 12 }} accessibilityLabel="إجمالي الديون المستحقة">
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
                                    <IconTile icon="hand-coins" tone="danger" size={46} />
                                    <View style={{ flex: 1 }}>
                                        <LinkLabel label="إجمالي الديون المستحقة" style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }} />
                                        <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right', marginTop: 2 }}>المبالغ غير المسددة</Text>
                                    </View>
                                </View>

                                <View style={{ height: 1, backgroundColor: C.border, marginVertical: 14 }} />

                                <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                        <Text style={{ color: C.mutedForeground, fontSize: 12.5 }}>الإجمالي</Text>
                                        <Text style={{ color: C.foreground, fontSize: 23, fontWeight: '900', marginTop: 2 }}>
                                            {formatNumber(stats?.debtsTotal ?? 0)} <Text style={{ fontSize: 12.5, color: C.mutedForeground }}>{CURRENCY}</Text>
                                        </Text>
                                    </View>
                                    <View style={{ width: 1, height: 36, backgroundColor: C.border, marginHorizontal: 16 }} />
                                    <View style={{ minWidth: 76, alignItems: 'center' }}>
                                        <Text style={{ color: C.danger, fontSize: 22, fontWeight: '900' }}>{formatNumber(stats?.debtsCount ?? 0)}</Text>
                                        <Text style={{ color: C.mutedForeground, fontSize: 12.5 }}>عميل</Text>
                                    </View>
                                </View>
                        </PressableCard>

                        <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                            {/* Each tile opens the inventory tab that lists exactly what it counts. */}
                            <KpiTile label="نواقص المخزون" value={stats?.lowStock ?? 0} icon="cube-outline" tone="warning" onPress={() => go('/(tabs)/inventory?tab=low-stock')} />
                            <KpiTile label="أصناف منتهية" value={stats?.expiredCount ?? 0} icon="alert-circle-outline" tone="danger" onPress={() => go('/(tabs)/inventory?tab=expired')} />
                        </View>
                    </View>

                    <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                        <LinkTile label="الطلبات الذكية" icon="list-outline" onPress={() => go('/(tabs)/smart-orders')} />
                        <LinkTile label="التقارير" icon="document-text-outline" onPress={() => go('/reports')} />
                    </View>

                    {salesLoading && <Text style={{ color: C.mutedForeground, textAlign: 'right' }}>جارٍ تحميل آخر المبيعات…</Text>}
                    {salesFailed && <Text style={{ color: C.danger, textAlign: 'right' }}>تعذر تحديث آخر المبيعات. اسحب للتحديث.</Text>}
                    {recentSales.length > 0 && (
                        <View>
                            <SectionTitle title="آخر المبيعات" trailing="عرض الكل" onTrailingPress={() => go('/sales-history')} />
                            <View style={{ gap: 8 }}>
                                {recentSales.map(sale => (
                                    <RecentSaleCard key={sale.id} sale={sale} onPress={() => go('/sales-history')} />
                                ))}
                            </View>
                        </View>
                    )}
                </>
            )}
        </ScrollView>
    );
}

function KpiTile({ label, value, icon, tone, onPress }: { label: string; value: number; icon: React.ComponentProps<typeof Ionicons>['name']; tone: Tone; onPress: () => void }) {
    const C = usePalette();
    const color = tone === 'danger' ? C.danger : C.warning;
    return (
        <PressableCard onPress={onPress} containerStyle={{ flex: 1 }} style={{ gap: 8 }} accessibilityLabel={`${value} ${label}`}>
            <View style={{ flexDirection: 'row-reverse' }}>
                <IconTile icon={icon} tone={tone} size={42} />
            </View>
            <Text style={{ color, fontSize: 30, fontWeight: '900', textAlign: 'right' }}>{formatNumber(value)}</Text>
            <LinkLabel label={label} style={{ color: C.mutedForeground, fontSize: 14 }} />
        </PressableCard>
    );
}

function LinkTile({ label, icon, onPress }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void }) {
    const C = usePalette();
    return (
        <PressableCard
            onPress={onPress}
            containerStyle={{ flex: 1 }}
            style={{ height: 72, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8 }}
            accessibilityLabel={label}
            accessibilityHint={`فتح ${label}`}
        >
            <View style={{ width: 34, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={icon} size={29} color={C.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
                <LinkLabel
                    label={label}
                    style={{ color: C.foreground, fontSize: 15.5, fontWeight: '800' }}
                    textProps={{ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.78, ellipsizeMode: 'clip' }}
                />
            </View>
        </PressableCard>
    );
}

export default AdminDashboard;
