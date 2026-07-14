import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { managerPalette, Radius } from '../../constants/colors';
import { Skeleton } from '../ui/Skeleton';
import { ShiftSummaryHero } from './ShiftSummaryHero';
import { formatDate, formatTime, iraqDateString, todayIraq } from '../../utils/date';

const { width } = Dimensions.get('window');
const PAGE_PAD = 20;
const GAP = 12;
// Three-column bento grid for quick actions (matches the manager dashboard).
const COL3 = (width - PAGE_PAD * 2 - GAP * 2) / 3;

interface Alert { id: string; drugName?: string; message?: string; type?: string; }
interface Sale  { id: string; total: number; createdAt: string; paymentMethod?: string; }

const QUICK_ACTIONS = [
    { title: 'بيع جديد',     icon: 'cart-outline'    as const, route: '/(tabs)/sales',        iconColor: (C: any) => C.primary,  iconBg: (C: any) => C.primaryMuted },
    { title: 'مسح باركود',   icon: 'barcode-outline' as const, route: '/scan',                iconColor: (C: any) => C.info,     iconBg: (C: any) => C.infoBg       },
    { title: 'بحث دواء',     icon: 'search-outline'  as const, route: '/(tabs)/inventory',    iconColor: (C: any) => C.success,  iconBg: (C: any) => C.successBg    },
    { title: 'سجل الديون',   icon: 'book-outline'    as const, route: '/(tabs)/debts',        iconColor: (C: any) => C.warning,  iconBg: (C: any) => C.warningBg    },
    { title: 'فحص الوصفة',  icon: 'scan-outline'    as const, route: '/scan-prescription',   iconColor: (C: any) => '#8b5cf6',  iconBg: (C: any) => 'rgba(139,92,246,0.1)' },
] as const;

const ALERT_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; iconColor: (C: any) => string; iconBg: (C: any) => string; label: string }> = {
    LOW_STOCK: { icon: 'cube-outline',  iconColor: C => C.danger,  iconBg: C => C.dangerBg,  label: 'نقص مخزون'    },
    EXPIRY:    { icon: 'time-outline',  iconColor: C => C.warning, iconBg: C => C.warningBg, label: 'قرب الانتهاء' },
};

function SectionLabel({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
    const { isDarkMode } = useTheme();
    const C = managerPalette(isDarkMode);
    return (
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 2 }}>
                <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: C.primary }} />
                <Text style={{ color: C.mutedForeground, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>
                    {text}
                </Text>
            </View>
            {action && onAction && (
                <TouchableOpacity onPress={onAction} hitSlop={8}>
                    <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>{action}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

export function PharmacistDashboard() {
    const { isDarkMode } = useTheme();
    const { branchId, user } = useAuth();
    const C = managerPalette(isDarkMode);
    const router = useRouter();

    // Outlined card matching the system identity — light surface, soft tinted border.
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

    const [sales, setSales]       = useState<Sale[]>([]);
    const [alerts, setAlerts]     = useState<Alert[]>([]);
    const [loading, setLoading]   = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const [salesData, alertsData] = await Promise.all([
                apiService.getSales().catch(() => [] as Sale[]),
                apiService.getAlerts(branchId ?? undefined).catch(() => [] as Alert[]),
            ]);
            const today = todayIraq();
            setSales((salesData as Sale[]).filter(s => s.createdAt && iraqDateString(s.createdAt) === today));
            setAlerts((alertsData as Alert[]).slice(0, 3));
        } catch (err) {
            console.error('PharmacistDashboard:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [branchId]);

    useEffect(() => { fetchData(); }, [fetchData]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

    const todayRevenue = sales.reduce((s, x) => s + (x.total ?? 0), 0);
    const cashCount    = sales.filter(s => !s.paymentMethod || s.paymentMethod === 'CASH').length;
    const creditCount  = sales.length - cashCount;
    const firstName    = user?.name?.split(' ')[0] ?? 'الصيدلاني';

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ paddingBottom: 110 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            showsVerticalScrollIndicator={false}
        >
            {/* ── Loading skeleton ─────────────────────────────────────────────── */}
            {loading && !refreshing && (
                <View style={{ padding: 20, gap: 16 }}>
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ gap: 8 }}>
                            <Skeleton width={180} height={12} radius={Radius.xs} />
                            <Skeleton width={130} height={24} radius={Radius.xs} />
                        </View>
                        <Skeleton width={48} height={48} radius={Radius.sm} />
                    </View>
                    <Skeleton height={170} radius={Radius.sm} />
                    <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                        {[1,2,3].map(i => <Skeleton key={i} style={{ flex: 1 }} height={96} radius={Radius.sm} />)}
                    </View>
                </View>
            )}

            {!loading && (
                <View style={{ padding: PAGE_PAD, gap: 24 }}>

                    {/* ── Header ──────────────────────────────────────────────── */}
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginBottom: 3 }}>
                                {formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
                            </Text>
                            <Text style={{ color: C.foreground, fontSize: 23, fontWeight: '900', textAlign: 'right' }}>
                                أهلاً، {firstName}
                            </Text>
                        </View>
                        <View style={{
                            width: 48, height: 48, borderRadius: Radius.sm,
                            backgroundColor: C.primaryMuted,
                            alignItems: 'center', justifyContent: 'center',
                            borderWidth: 1.5, borderColor: `${C.primary}30`,
                        }}>
                            <Text style={{ color: C.primary, fontSize: 20, fontWeight: '900' }}>
                                {firstName.charAt(0)}
                            </Text>
                        </View>
                    </View>

                    {/* ── Shift summary hero ──────────────────────────────────── */}
                    <ShiftSummaryHero
                        title="ملخص وردية اليوم"
                        headerIcon="time-outline"
                        accent={C.primary}
                        revenueLabel="إجمالي مبيعات اليوم"
                        revenue={todayRevenue}
                        metrics={[
                            { icon: 'receipt-outline', value: sales.length, label: 'فاتورة' },
                            { icon: 'cash-outline',    value: cashCount,    label: 'نقدي' },
                            { icon: 'time-outline',    value: creditCount,  label: 'آجل', onPress: () => router.push('/(tabs)/debts' as any) },
                        ]}
                    />

                    {/* ── Quick Actions (bento grid) ──────────────────────────── */}
                    <View>
                        <SectionLabel text="وصول سريع" />
                        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: GAP }}>
                            {QUICK_ACTIONS.map(action => (
                                <TouchableOpacity
                                    key={action.title}
                                    onPress={() => router.push(action.route as any)}
                                    activeOpacity={0.85}
                                    style={{ ...card(action.iconColor(C)), width: COL3, paddingVertical: 16, alignItems: 'center', gap: 10 }}
                                >
                                    <View style={{
                                        width: 46, height: 46, borderRadius: Radius.xs,
                                        backgroundColor: action.iconBg(C),
                                        justifyContent: 'center', alignItems: 'center',
                                    }}>
                                        <Ionicons name={action.icon} size={23} color={action.iconColor(C)} />
                                    </View>
                                    <Text style={{ color: C.foreground, fontSize: 11.5, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>
                                        {action.title}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* ── Recent Alerts ────────────────────────────────────────── */}
                    {alerts.length > 0 && (
                        <View>
                            <SectionLabel
                                text="التنبيهات"
                                action="عرض الكل"
                                onAction={() => router.push('/(tabs)/alerts' as any)}
                            />
                            <View style={{ gap: 10 }}>
                                {alerts.map(alert => {
                                    const cfg = ALERT_ICON[alert.type ?? ''] ?? ALERT_ICON['EXPIRY'];
                                    const ac = cfg.iconColor(C);
                                    return (
                                        <TouchableOpacity
                                            key={alert.id}
                                            onPress={() => router.push('/(tabs)/alerts' as any)}
                                            activeOpacity={0.8}
                                            style={{
                                                ...card(ac),
                                                flexDirection: 'row-reverse', alignItems: 'center',
                                                paddingVertical: 12, paddingHorizontal: 14, gap: 12,
                                            }}
                                        >
                                            <View style={{
                                                width: 36, height: 36, borderRadius: Radius.xs,
                                                backgroundColor: cfg.iconBg(C),
                                                justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                                            }}>
                                                <Ionicons name={cfg.icon} size={17} color={ac} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: C.foreground, fontWeight: '700', textAlign: 'right', fontSize: 13 }} numberOfLines={1}>
                                                    {alert.drugName ?? alert.message ?? 'تنبيه'}
                                                </Text>
                                                <Text style={{ color: ac, fontSize: 11, fontWeight: '600', textAlign: 'right', marginTop: 2 }}>
                                                    {cfg.label}
                                                </Text>
                                            </View>
                                            <Ionicons name="chevron-back" size={15} color={C.mutedForeground} />
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    )}

                    {/* ── Today's Sales ────────────────────────────────────────── */}
                    {sales.length > 0 && (
                        <View>
                            <SectionLabel
                                text="مبيعات اليوم"
                                action="عرض الكل"
                                onAction={() => router.push('/sales-history' as any)}
                            />
                            <View style={{ ...card(C.primary), paddingHorizontal: 14 }}>
                                {sales.slice(0, 5).map((sale, idx) => {
                                    const isCash = !sale.paymentMethod || sale.paymentMethod === 'CASH';
                                    const isLast = idx === Math.min(sales.length, 5) - 1;
                                    return (
                                        <React.Fragment key={sale.id}>
                                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 13, gap: 12 }}>
                                                <View style={{
                                                    width: 36, height: 36, borderRadius: Radius.xs,
                                                    backgroundColor: isCash ? C.successBg : C.primaryMuted,
                                                    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                                                }}>
                                                    <Ionicons name={isCash ? 'cash-outline' : 'card-outline'} size={17} color={isCash ? C.success : C.primary} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: C.foreground, fontWeight: '600', textAlign: 'right', fontSize: 13 }}>
                                                        {sale.createdAt ? formatTime(sale.createdAt, { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                                    </Text>
                                                    <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 1 }}>
                                                        {isCash ? 'نقدي' : (sale.paymentMethod ?? '')}
                                                    </Text>
                                                </View>
                                                <View style={{ alignItems: 'flex-end' }}>
                                                    <Text style={{ color: C.success, fontWeight: '800', fontSize: 15 }}>
                                                        {sale.total.toLocaleString('en-US')}
                                                    </Text>
                                                    <Text style={{ color: C.mutedForeground, fontSize: 10 }}>د.ع</Text>
                                                </View>
                                            </View>
                                            {!isLast && <View style={{ height: 1, backgroundColor: C.border }} />}
                                        </React.Fragment>
                                    );
                                })}
                            </View>
                        </View>
                    )}

                </View>
            )}
        </ScrollView>
    );
}

export default PharmacistDashboard;
