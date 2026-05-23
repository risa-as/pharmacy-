import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { Skeleton } from '../ui/Skeleton';
import { formatDate, formatTime, iraqDateString, todayIraq } from '../../utils/date';

interface Alert { id: string; drugName?: string; message?: string; type?: string; }
interface Sale  { id: string; total: number; createdAt: string; paymentMethod?: string; }

const QUICK_ACTIONS = [
    { title: 'بيع جديد',     icon: 'cart-outline'    as const, route: '/(tabs)/sales',     iconColor: (C: any) => C.primary,  iconBg: (C: any) => C.primaryMuted },
    { title: 'مسح باركود',   icon: 'barcode-outline' as const, route: '/scan',             iconColor: (C: any) => C.info,     iconBg: (C: any) => C.infoBg       },
    { title: 'بحث دواء',     icon: 'search-outline'  as const, route: '/(tabs)/inventory', iconColor: (C: any) => C.success,  iconBg: (C: any) => C.successBg    },
    { title: 'سجل الديون',   icon: 'book-outline'    as const, route: '/(tabs)/debts',     iconColor: (C: any) => C.warning,  iconBg: (C: any) => C.warningBg    },
] as const;

const ALERT_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; iconColor: (C: any) => string; iconBg: (C: any) => string; label: string }> = {
    LOW_STOCK: { icon: 'cube-outline',  iconColor: C => C.danger,  iconBg: C => C.dangerBg,  label: 'نقص مخزون'    },
    EXPIRY:    { icon: 'time-outline',  iconColor: C => C.warning, iconBg: C => C.warningBg, label: 'قرب الانتهاء' },
};

function SectionLabel({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    return (
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{
                color: C.mutedForeground, fontSize: 11, fontWeight: '700',
                paddingHorizontal: 2, letterSpacing: 0.5,
            }}>
                {text}
            </Text>
            {action && onAction && (
                <TouchableOpacity onPress={onAction}>
                    <Text style={{ color: C.primary, fontSize: 12, fontWeight: '600' }}>{action}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

export function PharmacistDashboard() {
    const { isDarkMode } = useTheme();
    const { branchId, user } = useAuth();
    const C = Colors(isDarkMode);
    const router = useRouter();

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
                            <Skeleton width={180} height={12} radius={5} />
                            <Skeleton width={130} height={24} radius={5} />
                        </View>
                        <Skeleton width={48} height={48} radius={5} />
                    </View>
                    <Skeleton height={150} radius={5} />
                    <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                        {[1,2,3,4].map(i => <Skeleton key={i} style={{ flex: 1 }} height={90} radius={5} />)}
                    </View>
                </View>
            )}

            {!loading && (
                <View style={{ padding: 20, gap: 20 }}>

                    {/* ── Header ──────────────────────────────────────────────── */}
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
                            backgroundColor: C.primaryMuted,
                            alignItems: 'center', justifyContent: 'center',
                            borderWidth: 1.5, borderColor: `${C.primary}30`,
                        }}>
                            <Text style={{ color: C.primary, fontSize: 20, fontWeight: '900' }}>
                                {firstName.charAt(0)}
                            </Text>
                        </View>
                    </View>

                    {/* ── Shift Hero Card ─────────────────────────────────────── */}
                    <View style={{
                        backgroundColor: C.primary, borderRadius: 5,
                        padding: 20,
                        shadowColor: C.primary,
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
                    }}>
                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600' }}>
                                ملخص وردية اليوم
                            </Text>
                            <View style={{
                                backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 5, padding: 8,
                            }}>
                                <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.85)" />
                            </View>
                        </View>

                        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                            {/* Revenue block */}
                            <View style={{
                                flex: 3,
                                backgroundColor: 'rgba(255,255,255,0.12)',
                                borderRadius: 5, padding: 14, alignItems: 'flex-end',
                            }}>
                                <Ionicons name="cash-outline" size={18} color="rgba(255,255,255,0.7)" />
                                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 8 }}>
                                    {todayRevenue.toLocaleString('en-US')}
                                </Text>
                                <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 }}>
                                    إجمالي المبيعات (د.ع)
                                </Text>
                            </View>
                            {/* Invoice count block */}
                            <View style={{
                                flex: 2,
                                backgroundColor: 'rgba(255,255,255,0.12)',
                                borderRadius: 5, padding: 14, alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Ionicons name="receipt-outline" size={18} color="rgba(255,255,255,0.7)" />
                                <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 8 }}>
                                    {sales.length}
                                </Text>
                                <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 }}>
                                    فاتورة
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* ── Quick Actions ────────────────────────────────────────── */}
                    <View>
                        <SectionLabel text="إجراءات سريعة" />
                        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                            {QUICK_ACTIONS.map(action => (
                                <TouchableOpacity
                                    key={action.title}
                                    onPress={() => router.push(action.route as any)}
                                    activeOpacity={0.8}
                                    style={{
                                        flex: 1,
                                        backgroundColor: C.card, borderRadius: 5,
                                        borderWidth: 1, borderColor: C.border,
                                        paddingVertical: 14, alignItems: 'center', gap: 8,
                                        shadowColor: '#000',
                                        shadowOffset: { width: 0, height: 1 },
                                        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
                                    }}
                                >
                                    <View style={{
                                        width: 38, height: 38, borderRadius: 5,
                                        backgroundColor: action.iconBg(C),
                                        justifyContent: 'center', alignItems: 'center',
                                    }}>
                                        <Ionicons name={action.icon} size={19} color={action.iconColor(C)} />
                                    </View>
                                    <Text style={{ color: C.foreground, fontSize: 11, fontWeight: '700', textAlign: 'center' }}>
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
                            <View style={{ gap: 8 }}>
                                {alerts.map(alert => {
                                    const cfg = ALERT_ICON[alert.type ?? ''] ?? ALERT_ICON['EXPIRY'];
                                    return (
                                        <View
                                            key={alert.id}
                                            style={{
                                                flexDirection: 'row-reverse', alignItems: 'center',
                                                backgroundColor: C.card, borderRadius: 5,
                                                borderWidth: 1, borderColor: C.border,
                                                paddingVertical: 12, paddingLeft: 14, paddingRight: 18,
                                                gap: 12,
                                                shadowColor: '#000',
                                                shadowOffset: { width: 0, height: 1 },
                                                shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
                                                overflow: 'hidden',
                                            }}
                                        >
                                            {/* Accent bar */}
                                            <View style={{
                                                position: 'absolute', right: 0, top: 0, bottom: 0, width: 4,
                                                backgroundColor: cfg.iconColor(C),
                                            }} />
                                            <View style={{
                                                width: 36, height: 36, borderRadius: 5,
                                                backgroundColor: cfg.iconBg(C),
                                                justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                                            }}>
                                                <Ionicons name={cfg.icon} size={17} color={cfg.iconColor(C)} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: C.foreground, fontWeight: '700', textAlign: 'right', fontSize: 13 }} numberOfLines={1}>
                                                    {alert.drugName ?? alert.message ?? 'تنبيه'}
                                                </Text>
                                                <Text style={{ color: cfg.iconColor(C), fontSize: 11, fontWeight: '600', textAlign: 'right', marginTop: 2 }}>
                                                    {cfg.label}
                                                </Text>
                                            </View>
                                            <Ionicons name="chevron-back" size={15} color={C.mutedForeground} />
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    )}

                    {/* ── Today's Sales ────────────────────────────────────────── */}
                    {sales.length > 0 && (
                        <View>
                            <SectionLabel text="مبيعات اليوم" />
                            <View style={{
                                backgroundColor: C.card, borderRadius: 5,
                                borderWidth: 1, borderColor: C.border,
                                paddingHorizontal: 14,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 1 },
                                shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
                            }}>
                                {sales.slice(0, 5).map((sale, idx) => {
                                    const isCash = !sale.paymentMethod || sale.paymentMethod === 'CASH';
                                    const isLast = idx === Math.min(sales.length, 5) - 1;
                                    return (
                                        <React.Fragment key={sale.id}>
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
