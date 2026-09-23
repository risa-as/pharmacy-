import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { AppIcon as Ionicons } from '../ui/AppIcon';
import { useRouter, Href } from 'expo-router';
import { apiService, request } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Radius } from '../../constants/colors';
import { Skeleton } from '../ui/Skeleton';
import { ShiftSummaryHero } from './ShiftSummaryHero';
import { usePalette, Surface, IconTile, PressableCard, LinkLabel, SectionTitle, AppButton, Tone } from '../ui/Kit';
import { RecentSaleCard } from './RecentSaleCard';
import { iraqDateString, todayIraq } from '../../utils/date';
import { formatNumber } from '../../utils/format';

interface AlertRow { id: string; drugName?: string; message?: string; type?: string; quantity?: number }
interface Sale { id: string; invoiceNumber?: number | null; total: number; createdAt: string; payment?: { method?: string | null } | null }

const ALERT_META: Record<string, { icon: React.ComponentProps<typeof Ionicons>['name']; tone: Tone; label: string }> = {
    LOW_STOCK: { icon: 'cube-outline', tone: 'warning', label: 'مخزون منخفض' },
    EXPIRY: { icon: 'time-outline', tone: 'warning', label: 'قرب الانتهاء' },
    EXPIRED: { icon: 'alert-circle-outline', tone: 'danger', label: 'منتهي' },
};

/** Pharmacist home (design home-pharmacist.png): search & sell first, compact shift summary. */
export function PharmacistDashboard() {
    const C = usePalette();
    const router = useRouter();
    const { branchId, user } = useAuth();

    const [sales, setSales]           = useState<Sale[]>([]);
    const [alerts, setAlerts]         = useState<AlertRow[]>([]);
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const from = new Date();
            from.setHours(0, 0, 0, 0);
            const [salesData, alertsData] = await Promise.all([
                // mine=1: this screen is the pharmacist's own shift, not the branch total.
                request<Sale[]>(`/sales?mine=1&limit=100&from=${from.toISOString()}`).catch(() => [] as Sale[]),
                apiService.getAlerts(branchId ?? undefined).catch(() => [] as AlertRow[]),
            ]);
            const today = todayIraq();
            setSales((Array.isArray(salesData) ? salesData : []).filter(s => s.createdAt && iraqDateString(s.createdAt) === today));
            setAlerts((Array.isArray(alertsData) ? alertsData : []).slice(0, 3));
        } catch (err) {
            console.error('PharmacistDashboard:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [branchId]);

    useEffect(() => { fetchData(); }, [fetchData]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

    const go = (href: Href) => router.push(href);
    const todayRevenue = sales.reduce((s, x) => s + (x.total ?? 0), 0);
    const methodOf = (s: Sale) => s.payment?.method ?? 'CASH';
    const cashCount = sales.filter(s => methodOf(s) === 'CASH').length;
    const cardCount = sales.filter(s => methodOf(s) === 'CARD').length;
    const creditCount = sales.filter(s => methodOf(s) === 'CREDIT').length;
    const firstName = user?.name?.trim().split(' ')[0] ?? '';

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 16 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            showsVerticalScrollIndicator={false}
        >
            <View>
                <Text style={{ color: C.foreground, fontSize: 24, fontWeight: '900', textAlign: 'right' }}>أهلاً{firstName ? `، ${firstName}` : ''}</Text>
                <Text style={{ color: C.mutedForeground, fontSize: 13.5, textAlign: 'right', marginTop: 2 }}>دائماً معك لصحة أفضل</Text>
            </View>

            {loading && !refreshing ? (
                <Skeleton height={210} radius={Radius.card} />
            ) : (
                    <ShiftSummaryHero
                        title="ملخص وردية اليوم"
                        headerIcon="document-text-outline"
                        revenue={todayRevenue}
                        metricsVariant="plain"
                        metrics={[
                            { icon: 'reader-outline', value: sales.length, label: 'فاتورة', onPress: () => go('/sales-history' as Href) },
                            { icon: 'cash-outline', value: cashCount + cardCount, label: 'نقدي' },
                            { icon: 'time-outline', value: creditCount, label: 'آجل', onPress: () => go('/(tabs)/debts' as Href) },
                        ]}
                    />
            )}

            {/* Quick access (design home-pharmacist.png) */}
            <View style={{ gap: 10 }}>
                <SectionTitle title="وصول سريع" style={{ marginBottom: 0 }} />
                <AppButton label="بيع جديد" icon="cart-outline" onPress={() => go('/(tabs)/sales' as Href)} style={{ paddingVertical: 14 }} />
                <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                    <QuickTile label="مسح باركود" icon="barcode-outline" onPress={() => go({ pathname: '/scan', params: { from: 'sales' } } as unknown as Href)} />
                    <QuickTile label="بحث دواء" icon="search-outline" tone="success" onPress={() => go('/(tabs)/inventory' as Href)} />
                </View>
                <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                    <QuickTile label="فحص الوصفة" icon="scan-outline" onPress={() => go('/scan-prescription' as Href)} />
                    <QuickTile label="سجل الديون" icon="hand-coins" tone="warning" onPress={() => go('/(tabs)/debts' as Href)} />
                </View>
            </View>

            {!loading && (
                <>

                    {alerts.length > 0 && (
                        <View>
                            <SectionTitle title="التنبيهات" trailing="عرض الكل" onTrailingPress={() => go('/(tabs)/alerts' as Href)} />
                            <View style={{ gap: 10 }}>
                                {alerts.map(alert => {
                                    const meta = ALERT_META[alert.type ?? ''] ?? ALERT_META.EXPIRY;
                                    return (
                                        <PressableCard
                                            key={alert.id}
                                            onPress={() => go('/(tabs)/alerts' as Href)}
                                            style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 12 }}
                                            accessibilityLabel={`${alert.drugName ?? alert.message ?? 'تنبيه'}، ${meta.label}`}
                                        >
                                            <IconTile icon={meta.icon} tone={meta.tone} size={40} />
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <LinkLabel
                                                    label={alert.drugName ?? alert.message ?? 'تنبيه'}
                                                    style={{ color: C.foreground, fontSize: 15, fontWeight: '800' }}
                                                    textProps={{ numberOfLines: 1 }}
                                                />
                                                <Text style={{ color: meta.tone === 'danger' ? C.danger : C.warning, fontSize: 13, textAlign: 'right', marginTop: 2 }}>{meta.label}</Text>
                                            </View>
                                            {typeof alert.quantity === 'number' && (
                                                <Text style={{ color: C.mutedForeground, fontSize: 13 }}>{formatNumber(alert.quantity)} وحدات</Text>
                                            )}
                                        </PressableCard>
                                    );
                                })}
                            </View>
                        </View>
                    )}

                    {sales.length > 0 && (
                        <View>
                            <SectionTitle title="آخر المبيعات" trailing="عرض الكل" onTrailingPress={() => go('/sales-history' as Href)} />
                            <View style={{ gap: 8 }}>
                                {sales.slice(0, 5).map(sale => (
                                    <RecentSaleCard key={sale.id} sale={sale} onPress={() => go('/sales-history' as Href)} />
                                ))}
                            </View>
                        </View>
                    )}
                </>
            )}
        </ScrollView>
    );
}

function QuickTile({ label, icon, tone = 'primary', onPress }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; tone?: Tone; onPress: () => void }) {
    const C = usePalette();
    const color = tone === 'success' ? C.success : tone === 'warning' ? C.warning : tone === 'danger' ? C.danger : C.primary;
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1 }} accessibilityRole="button">
            <Surface padded={false} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 }}>
                <Text style={{ flex: 1, color: C.foreground, fontSize: 15, fontWeight: '800', textAlign: 'right' }} numberOfLines={1}>{label}</Text>
                <Ionicons name={icon} size={22} color={color} />
            </Surface>
        </TouchableOpacity>
    );
}

export default PharmacistDashboard;
