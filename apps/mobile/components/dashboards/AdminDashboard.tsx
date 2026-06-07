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
import { Colors } from '../../constants/colors';
import { Skeleton } from '../ui/Skeleton';
import { BranchSelector } from '../BranchSelector';
import { formatDate, formatTime } from '../../utils/date';

const { width } = Dimensions.get('window');
const HALF = (width - 48) / 2;

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

function SectionLabel({ text }: { text: string }) {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    return (
        <Text style={{
            color: C.mutedForeground, fontSize: 11, fontWeight: '700',
            textAlign: 'right', marginBottom: 10, paddingHorizontal: 2, letterSpacing: 0.5,
        }}>
            {text}
        </Text>
    );
}

function SaleRow({ sale, isLast }: { sale: RecentSale; isLast: boolean }) {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const amount = sale.total ?? sale.totalAmount ?? 0;
    const isCash = !sale.paymentMethod || sale.paymentMethod === 'CASH';

    return (
        <>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 13, gap: 12 }}>
                <View style={{
                    width: 36, height: 36, borderRadius: 5,
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
                        {amount.toLocaleString('en-US')}
                    </Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 10 }}>د.ع</Text>
                </View>
            </View>
            {!isLast && <View style={{ height: 1, backgroundColor: C.border }} />}
        </>
    );
}

export function AdminDashboard() {
    const { isDarkMode } = useTheme();
    const { branchId, user } = useAuth();
    const C = Colors(isDarkMode);
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

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ paddingBottom: 110 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            showsVerticalScrollIndicator={false}
        >
            {/* ── Header ──────────────────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginBottom: 3 }}>
                            {formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
                        </Text>
                        <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '900', textAlign: 'right' }}>
                            أهلاً، {firstName}
                        </Text>
                    </View>
                    <View style={{
                        width: 48, height: 48, borderRadius: 5,
                        backgroundColor: C.primary,
                        justifyContent: 'center', alignItems: 'center',
                        shadowColor: C.primary,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
                    }}>
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>
                            {firstName.charAt(0)}
                        </Text>
                    </View>
                </View>
            </View>

            {/* ── Branch Filter ──────────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
                <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} hideIfSingle />
            </View>

            {/* ── Loading ────────────────────────────────────────────────────── */}
            {loading && !refreshing ? (
                <View style={{ paddingHorizontal: 20, gap: 16, marginTop: 8 }}>
                    <Skeleton height={160} radius={5} />
                    <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                        <Skeleton width={HALF} height={100} radius={5} />
                        <Skeleton width={HALF} height={100} radius={5} />
                    </View>
                    <Skeleton height={56} radius={5} />
                    <Skeleton height={180} radius={5} />
                </View>
            ) : (
                <View style={{ paddingHorizontal: 20, gap: 20, marginTop: 8 }}>

                    {/* ── Hero Revenue Card ───────────────────────────────────── */}
                    <View style={{
                        backgroundColor: C.primary, borderRadius: 5,
                        padding: 20,
                        shadowColor: C.primary,
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
                    }}>
                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                            <View>
                                <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '500', textAlign: 'right' }}>
                                    إجمالي مبيعات اليوم
                                </Text>
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                                    <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900' }}>
                                        {(stats?.salesToday ?? 0).toLocaleString('en-US')}
                                    </Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' }}>
                                        د.ع
                                    </Text>
                                </View>
                            </View>
                            <View style={{
                                backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 5,
                                padding: 10,
                            }}>
                                <Ionicons name="analytics" size={22} color="rgba(255,255,255,0.9)" />
                            </View>
                        </View>

                        {/* Sub-metrics */}
                        <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                            {[
                                { label: 'فاتورة',  value: stats?.salesCount  ?? 0, icon: 'receipt-outline'      as const },
                                { label: 'تنبيه',   value: stats?.expiring    ?? 0, icon: 'notifications-outline' as const },
                                { label: 'دين',     value: stats?.debtsCount  ?? 0, icon: 'book-outline'          as const },
                            ].map(m => (
                                <View key={m.label} style={{
                                    flex: 1,
                                    backgroundColor: 'rgba(255,255,255,0.12)',
                                    borderRadius: 5, padding: 11, alignItems: 'center', gap: 3,
                                }}>
                                    <Ionicons name={m.icon} size={15} color="rgba(255,255,255,0.75)" />
                                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>
                                        {String(m.value)}
                                    </Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600' }}>
                                        {m.label}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* ── KPI Grid ────────────────────────────────────────────── */}
                    <View>
                        <SectionLabel text="مؤشرات المخزون" />
                        <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                            {[
                                { label: 'نواقص المخزون', value: stats?.lowStock ?? 0, icon: 'cube-outline' as const, iconColor: C.warning, iconBg: C.warningBg, route: '/(tabs)/inventory' },
                                { label: 'أصناف منتهية',  value: stats?.expiredCount ?? 0, icon: 'alert-circle-outline' as const, iconColor: C.danger, iconBg: C.dangerBg, route: '/(tabs)/inventory' },
                            ].map(kpi => (
                                <TouchableOpacity
                                    key={kpi.label}
                                    onPress={() => router.push(kpi.route as any)}
                                    activeOpacity={0.8}
                                    style={{
                                        flex: 1,
                                        backgroundColor: C.card, borderRadius: 5,
                                        borderWidth: 1, borderColor: C.border,
                                        padding: 16,
                                        shadowColor: '#000',
                                        shadowOffset: { width: 0, height: 1 },
                                        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
                                    }}
                                >
                                    <View style={{
                                        width: 38, height: 38, borderRadius: 5,
                                        backgroundColor: kpi.iconBg,
                                        justifyContent: 'center', alignItems: 'center',
                                        marginBottom: 12, alignSelf: 'flex-end',
                                    }}>
                                        <Ionicons name={kpi.icon} size={19} color={kpi.iconColor} />
                                    </View>
                                    <Text style={{
                                        color: kpi.iconColor, fontSize: 26, fontWeight: '900',
                                        textAlign: 'right', marginBottom: 4,
                                    }}>
                                        {kpi.value.toLocaleString('en-US')}
                                    </Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '600', textAlign: 'right' }}>
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
                            activeOpacity={0.8}
                            style={{
                                flexDirection: 'row-reverse', alignItems: 'center',
                                backgroundColor: C.warningBg, borderRadius: 5,
                                borderWidth: 1, borderColor: `${C.warning}40`,
                                padding: 14, gap: 12,
                            }}
                        >
                            <View style={{ width: 4, height: '100%', position: 'absolute', right: 0, top: 0, backgroundColor: C.warning, borderTopRightRadius: 5, borderBottomRightRadius: 5 }} />
                            <View style={{
                                width: 36, height: 36, borderRadius: 5,
                                backgroundColor: `${C.warning}25`,
                                justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                                marginRight: 4,
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

                    {/* ── Quick Actions ────────────────────────────────────────── */}
                    <View>
                        <SectionLabel text="وصول سريع" />
                        <ScrollView 
                            horizontal 
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ gap: 12, flexDirection: 'row-reverse', paddingVertical: 4, paddingHorizontal: 2 }}
                        >
                            {QUICK_ACTIONS.map(action => (
                                <TouchableOpacity
                                    key={action.label}
                                    onPress={() => router.push(action.route as any)}
                                    activeOpacity={0.8}
                                    style={{
                                        width: 105,
                                        backgroundColor: C.card, borderRadius: 16,
                                        borderWidth: 1, borderColor: C.border,
                                        paddingVertical: 18, alignItems: 'center', gap: 12,
                                        shadowColor: '#000',
                                        shadowOffset: { width: 0, height: 2 },
                                        shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
                                    }}
                                >
                                    <View style={{
                                        width: 48, height: 48, borderRadius: 14,
                                        backgroundColor: action.iconBg(C),
                                        justifyContent: 'center', alignItems: 'center',
                                    }}>
                                        <Ionicons name={action.icon} size={24} color={action.iconColor(C)} />
                                    </View>
                                    <Text style={{ color: C.foreground, fontSize: 12, fontWeight: '800', textAlign: 'center' }}>
                                        {action.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {/* ── Recent Sales ─────────────────────────────────────────── */}
                    {recentSales.length > 0 && (
                        <View>
                            <SectionLabel text="آخر المبيعات" />
                            <View style={{
                                backgroundColor: C.card, borderRadius: 5,
                                borderWidth: 1, borderColor: C.border,
                                paddingHorizontal: 14,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 1 },
                                shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
                            }}>
                                {recentSales.map((sale, idx) => (
                                    <SaleRow key={sale.id} sale={sale} isLast={idx === recentSales.length - 1} />
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
