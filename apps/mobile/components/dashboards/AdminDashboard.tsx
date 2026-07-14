import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, ScrollView, RefreshControl,
    TouchableOpacity, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Radius, managerPalette } from '../../constants/colors';
import { Skeleton } from '../ui/Skeleton';
import { BranchSelector } from '../BranchSelector';
import { ShiftSummaryHero } from './ShiftSummaryHero';
import { formatDate, formatTime } from '../../utils/date';

const { width } = Dimensions.get('window');
const PAGE_PAD = 20;
const GAP = 12;
// Three-column bento grid for quick actions.
const COL3 = (width - PAGE_PAD * 2 - GAP * 2) / 3;

interface RecentSale {
    id: string;
    total?: number;
    totalAmount?: number;
    createdAt: string;
    paymentMethod?: string;
}

const QUICK_ACTIONS = [
    { label: 'نقطة البيع',    icon: 'cart-outline'       as const, route: '/(tabs)/sales',        iconColor: (C: any) => C.primary,  iconBg: (C: any) => C.primaryMuted},
    { label: 'المخزون',       icon: 'cube-outline'       as const, route: '/(tabs)/inventory',    iconColor: (C: any) => C.warning,  iconBg: (C: any) => C.warningBg  },
    { label: 'المشتريات',     icon: 'bag-handle-outline' as const, route: '/(tabs)/purchases',    iconColor: (C: any) => C.info,     iconBg: (C: any) => C.infoBg     },
    { label: 'الديون',        icon: 'book-outline'       as const, route: '/(tabs)/debts',        iconColor: (C: any) => C.danger,   iconBg: (C: any) => C.dangerBg   },
    { label: 'الطلبات الذكية',icon: 'sparkles-outline'   as const, route: '/(tabs)/smart-orders', iconColor: (C: any) => C.success,  iconBg: (C: any) => C.successBg  },
    { label: 'فحص الوصفة',   icon: 'scan-outline'       as const, route: '/scan-prescription',   iconColor: (C: any) => '#8b5cf6',  iconBg: (C: any) => 'rgba(139,92,246,0.1)'}, // Different color to distinguish from POS
] as const;

/** Minimal section header — thin accent tick + muted label + optional action. */
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

function SaleRow({ sale, isLast, onPress }: { sale: RecentSale; isLast: boolean; onPress?: () => void }) {
    const { isDarkMode } = useTheme();
    const C = managerPalette(isDarkMode);
    const amount = sale.total ?? sale.totalAmount ?? 0;
    const isCash = !sale.paymentMethod || sale.paymentMethod === 'CASH';

    const methodLabel = isCash ? 'نقدي' : (sale.paymentMethod ?? 'بطاقة');
    const mColor = isCash ? C.success : C.primary;
    const mBg    = isCash ? C.successBg : C.primaryMuted;

    return (
        <>
            <TouchableOpacity
                activeOpacity={onPress ? 0.7 : 1}
                onPress={onPress}
                style={{ flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 12, gap: 12 }}
            >
                {/* Payment icon */}
                <View style={{
                    width: 40, height: 40, borderRadius: Radius.xs,
                    backgroundColor: mBg,
                    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                }}>
                    <Ionicons name={isCash ? 'cash-outline' : 'card-outline'} size={19} color={mColor} />
                </View>

                {/* Amount + meta */}
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 4 }}>
                        <Text style={{ color: C.foreground, fontWeight: '900', fontSize: 16 }}>
                            {amount.toLocaleString('en-US')}
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 10.5, fontWeight: '700' }}>د.ع</Text>
                    </View>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 7, marginTop: 4 }}>
                        <View style={{ backgroundColor: mBg, borderRadius: Radius.xs, paddingHorizontal: 7, paddingVertical: 2 }}>
                            <Text style={{ color: mColor, fontSize: 10, fontWeight: '800' }}>{methodLabel}</Text>
                        </View>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 3 }}>
                            <Ionicons name="time-outline" size={11} color={C.mutedForeground} />
                            <Text style={{ color: C.mutedForeground, fontSize: 11, fontWeight: '600' }}>
                                {sale.createdAt ? formatTime(sale.createdAt, { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Receipt indicator */}
                <View style={{ width: 30, height: 30, borderRadius: Radius.xs, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="receipt-outline" size={15} color={C.mutedForeground} />
                </View>
            </TouchableOpacity>
            {!isLast && <View style={{ height: 1, backgroundColor: C.border }} />}
        </>
    );
}

export function AdminDashboard() {
    const { isDarkMode } = useTheme();
    const { branchId, user } = useAuth();
    const C = managerPalette(isDarkMode);
    const router = useRouter();

    const [stats, setStats]             = useState<any>(null);
    const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(branchId);
    const [loading, setLoading]         = useState(true);
    const [refreshing, setRefreshing]   = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const [statsData, salesData] = await Promise.all([
                apiService.getStats(selectedBranch ?? undefined),
                apiService.getSales().catch(() => []),
            ]);
            setStats(statsData);
            setRecentSales((salesData as RecentSale[]).slice(0, 5));
        } catch (err) {
            console.error('AdminDashboard:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedBranch]);

    useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

    const firstName = user?.name?.split(' ')[0] ?? 'المدير';

    // Outlined card matching the hero — light surface, soft tinted accent border
    // (low opacity so it blends with the background), soft neutral shadow.
    const card = (accent: string) => ({
        backgroundColor: C.card,
        borderRadius: Radius.sm,
        borderWidth: 1.5,
        borderColor: `${accent}33`,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
    });

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ paddingBottom: 110 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            showsVerticalScrollIndicator={false}
        >
            {/* ── Header ──────────────────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: PAGE_PAD, paddingTop: 16, paddingBottom: 12 }}>
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginBottom: 3 }}>
                            {formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
                        </Text>
                        <Text style={{ color: C.foreground, fontSize: 23, fontWeight: '900', textAlign: 'right' }}>
                            أهلاً، {firstName}
                        </Text>
                    </View>
                    <View
                        style={{
                            width: 48, height: 48, borderRadius: Radius.sm,
                            backgroundColor: C.primary,
                            justifyContent: 'center', alignItems: 'center',
                        }}
                    >
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>
                            {firstName.charAt(0)}
                        </Text>
                    </View>
                </View>
            </View>

            {/* ── Branch Filter ──────────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: PAGE_PAD, marginBottom: 4 }}>
                <BranchSelector
                    selectedBranchId={selectedBranch}
                    onSelectBranch={setSelectedBranch}
                    hideIfSingle
                    accent={C.primary}
                    accentMuted={C.primaryMuted}
                />
            </View>

            {/* ── Loading ────────────────────────────────────────────────────── */}
            {loading && !refreshing ? (
                <View style={{ paddingHorizontal: PAGE_PAD, gap: 16, marginTop: 8 }}>
                    <Skeleton height={170} radius={Radius.sm} />
                    <Skeleton height={76} radius={Radius.sm} />
                    <View style={{ flexDirection: 'row-reverse', gap: GAP }}>
                        <Skeleton style={{ flex: 1 }} height={104} radius={Radius.sm} />
                        <Skeleton style={{ flex: 1 }} height={104} radius={Radius.sm} />
                    </View>
                    <View style={{ flexDirection: 'row-reverse', gap: GAP }}>
                        {[1, 2, 3].map(i => <Skeleton key={i} style={{ flex: 1 }} height={96} radius={Radius.sm} />)}
                    </View>
                </View>
            ) : (
                <View style={{ paddingHorizontal: PAGE_PAD, gap: 24, marginTop: 8 }}>

                    {/* ── Hero: today summary ─────────────────────────────────── */}
                    <ShiftSummaryHero
                        title="ملخص اليوم"
                        headerIcon="stats-chart-outline"
                        accent={C.primary}
                        dateLabel={formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
                        revenue={stats?.salesToday ?? 0}
                        metrics={[
                            { icon: 'receipt-outline', value: stats?.salesCount ?? 0, label: 'فاتورة', onPress: () => router.push('/sales-history' as any) },
                            { icon: 'cash-outline',    value: stats?.cashCount ?? 0,  label: 'نقدي' },
                            { icon: 'time-outline',    value: stats?.creditCount ?? 0, label: 'آجل', onPress: () => router.push('/(tabs)/debts' as any) },
                        ]}
                    />

                    {/* ── Bento: quick glance ─────────────────────────────────── */}
                    <View>
                        <SectionLabel text="نظرة سريعة" />

                        {/* Receivables — wide tile */}
                        <TouchableOpacity
                            onPress={() => router.push('/(tabs)/debts' as any)}
                            activeOpacity={0.7}
                            style={{ ...card(C.danger), flexDirection: 'row-reverse', alignItems: 'center', padding: 16, gap: 14, marginBottom: GAP }}
                        >
                            <View style={{
                                width: 44, height: 44, borderRadius: Radius.xs,
                                backgroundColor: C.dangerBg, justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                            }}>
                                <Ionicons name="wallet-outline" size={22} color={C.danger} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '600', textAlign: 'right' }}>
                                    إجمالي الديون المستحقة
                                </Text>
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                                    <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '900' }}>
                                        {(stats?.debtsTotal ?? 0).toLocaleString('en-US')}
                                    </Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '700' }}>د.ع</Text>
                                </View>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                                <Text style={{ color: C.danger, fontSize: 18, fontWeight: '900' }}>{stats?.debtsCount ?? 0}</Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 10, fontWeight: '600' }}>عميل</Text>
                            </View>
                            <Ionicons name="chevron-back" size={16} color={C.mutedForeground} />
                        </TouchableOpacity>

                        {/* Inventory KPIs — 2-col */}
                        <View style={{ flexDirection: 'row-reverse', gap: GAP }}>
                            {[
                                { label: 'نواقص المخزون', value: stats?.lowStock ?? 0, icon: 'cube-outline' as const, iconColor: C.warning, iconBg: C.warningBg, route: '/(tabs)/inventory' },
                                { label: 'أصناف منتهية',  value: stats?.expiredCount ?? 0, icon: 'alert-circle-outline' as const, iconColor: C.danger, iconBg: C.dangerBg, route: '/(tabs)/inventory' },
                            ].map(kpi => (
                                <TouchableOpacity
                                    key={kpi.label}
                                    onPress={() => router.push(kpi.route as any)}
                                    activeOpacity={0.7}
                                    style={{ ...card(kpi.iconColor), flex: 1, padding: 16 }}
                                >
                                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                        <View style={{
                                            width: 38, height: 38, borderRadius: Radius.xs,
                                            backgroundColor: kpi.iconBg, justifyContent: 'center', alignItems: 'center',
                                        }}>
                                            <Ionicons name={kpi.icon} size={19} color={kpi.iconColor} />
                                        </View>
                                        <Ionicons name="chevron-back" size={15} color={C.mutedForeground} />
                                    </View>
                                    <Text style={{ color: kpi.iconColor, fontSize: 28, fontWeight: '900', textAlign: 'right' }}>
                                        {kpi.value.toLocaleString('en-US')}
                                    </Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '600', textAlign: 'right', marginTop: 2 }}>
                                        {kpi.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* ── Low Stock Banner ────────────────────────────────────── */}
                    {(stats?.lowStock ?? 0) > 0 && (
                        <TouchableOpacity
                            onPress={() => router.push('/(tabs)/inventory' as any)}
                            activeOpacity={0.7}
                            style={{ ...card(C.warning), flexDirection: 'row-reverse', alignItems: 'center', padding: 14, gap: 12 }}
                        >
                            <View style={{
                                width: 36, height: 36, borderRadius: Radius.xs,
                                backgroundColor: C.warningBg,
                                justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                            }}>
                                <Ionicons name="warning-outline" size={18} color={C.warning} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontWeight: '700', textAlign: 'right', fontSize: 13 }}>
                                    تنبيه: نواقص في المخزون
                                </Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }}>
                                    {stats.lowStock} صنف تحت حد إعادة الطلب
                                </Text>
                            </View>
                            <Ionicons name="chevron-back" size={16} color={C.warning} />
                        </TouchableOpacity>
                    )}

                    {/* ── Quick Actions (bento grid) ──────────────────────────── */}
                    <View>
                        <SectionLabel text="وصول سريع" />
                        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: GAP }}>
                            {QUICK_ACTIONS.map(action => (
                                <TouchableOpacity
                                    key={action.label}
                                    onPress={() => router.push(action.route as any)}
                                    activeOpacity={0.7}
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
                                        {action.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* ── Recent Sales ─────────────────────────────────────────── */}
                    {recentSales.length > 0 && (
                        <View>
                            <SectionLabel text="آخر المبيعات" action="عرض الكل" onAction={() => router.push('/sales-history' as any)} />
                            <View style={{ ...card(C.primary), paddingHorizontal: 14 }}>
                                {recentSales.map((sale, idx) => (
                                    <SaleRow
                                        key={sale.id}
                                        sale={sale}
                                        isLast={idx === recentSales.length - 1}
                                        onPress={() => router.push('/sales-history' as any)}
                                    />
                                ))}
                            </View>
                        </View>
                    )}

                </View>
            )}
        </ScrollView>
    );
}

export default AdminDashboard;
