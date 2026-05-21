import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { Skeleton } from '../ui/Skeleton';
import { formatDate, formatTime, iraqDateString, todayIraq } from '../../utils/date';

interface Alert { id: string; drugName?: string; message?: string; type?: string; }
interface Sale  { id: string; total: number; createdAt: string; }

const QUICK_ACTIONS = [
    { title: 'بيع جديد',    icon: 'cart'     as const, route: '/(tabs)/sales',      color: '#0F7575', bg: '#E6F4F4' },
    { title: 'مسح باركود',  icon: 'barcode'  as const, route: '/scan',              color: '#2B6F8F', bg: '#E5F1F7' },
    { title: 'بحث دواء',    icon: 'search'   as const, route: '/(tabs)/inventory',  color: '#2D8A52', bg: '#E8F5EE' },
    { title: 'سجل الديون',  icon: 'book'     as const, route: '/(tabs)/debts',      color: '#C47820', bg: '#FDF3E3' },
] as const;

const ALERT_TYPE_LABEL: Record<string, string> = {
    LOW_STOCK: 'نقص مخزون',
    EXPIRY: 'قرب الانتهاء',
};
const ALERT_TYPE_COLOR = (type: string, C: ReturnType<typeof Colors>) =>
    type === 'LOW_STOCK' ? C.danger : C.warning;
const ALERT_TYPE_BG = (type: string, C: ReturnType<typeof Colors>) =>
    type === 'LOW_STOCK' ? C.dangerBg : C.warningBg;

export function PharmacistDashboard() {
    const { isDarkMode } = useTheme();
    const { branchId, user } = useAuth();
    const C = Colors(isDarkMode);
    const router = useRouter();

    const [sales, setSales] = useState<Sale[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);
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

    // First name only for greeting
    const firstName = user?.name?.split(' ')[0] ?? 'الصيدلاني';

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ paddingBottom: 110 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            showsVerticalScrollIndicator={false}
        >
            {/* ── Loading skeleton ───────────────────────────────────────────── */}
            {loading && !refreshing && (
                <View style={{ padding: 20, gap: 16 }}>
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ gap: 8 }}>
                            <Skeleton width={180} height={14} radius={6} />
                            <Skeleton width={120} height={26} radius={6} />
                        </View>
                        <Skeleton width={52} height={52} radius={16} />
                    </View>
                    <Skeleton height={150} radius={24} />
                    <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                        {[1,2,3,4].map(i => <Skeleton key={i} style={{ flex: 1 }} height={88} radius={16} />)}
                    </View>
                </View>
            )}

            {!loading && (
                <View style={{ padding: 20, gap: 20 }}>

                    {/* ── Header ───────────────────────────────────────────────── */}
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginBottom: 3 }}>
                                {formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
                            </Text>
                            <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '900', textAlign: 'right' }}>
                                أهلاً، {firstName} 👋
                            </Text>
                        </View>
                        {/* Avatar */}
                        <View style={{
                            width: 52, height: 52,
                            borderRadius: 16,
                            backgroundColor: C.primaryMuted,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 2,
                            borderColor: `${C.primary}30`,
                        }}>
                            <Text style={{ fontSize: 22 }}>
                                {firstName.charAt(0)}
                            </Text>
                        </View>
                    </View>

                    {/* ── Shift summary hero card ──────────────────────────────── */}
                    <View style={{
                        backgroundColor: C.primary,
                        borderRadius: 24,
                        padding: 20,
                        shadowColor: C.primary,
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.3,
                        shadowRadius: 16,
                        elevation: 8,
                    }}>
                        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'right', fontWeight: '500', marginBottom: 8 }}>
                            ملخص وردية اليوم
                        </Text>

                        <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                            {/* Revenue */}
                            <View style={{
                                flex: 2,
                                backgroundColor: 'rgba(255,255,255,0.13)',
                                borderRadius: 16,
                                padding: 16,
                                alignItems: 'flex-end',
                            }}>
                                <Ionicons name="cash" size={20} color="rgba(255,255,255,0.7)" />
                                <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 8 }}>
                                    {todayRevenue.toLocaleString('en-US')}
                                </Text>
                                <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 }}>
                                    إجمالي المبيعات (د.ع)
                                </Text>
                            </View>
                            {/* Count */}
                            <View style={{
                                flex: 1,
                                backgroundColor: 'rgba(255,255,255,0.13)',
                                borderRadius: 16,
                                padding: 16,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <Ionicons name="receipt" size={20} color="rgba(255,255,255,0.7)" />
                                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 8 }}>
                                    {sales.length}
                                </Text>
                                <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 }}>
                                    فاتورة
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* ── Quick Actions 2×2 ────────────────────────────────────── */}
                    <View>
                        <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right', marginBottom: 12 }}>
                            إجراءات سريعة
                        </Text>
                        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
                            {QUICK_ACTIONS.map((action) => (
                                <TouchableOpacity
                                    key={action.title}
                                    onPress={() => router.push(action.route as any)}
                                    activeOpacity={0.75}
                                    style={{ width: (width - 52) / 2 }}
                                >
                                    <View style={{
                                        backgroundColor: action.bg,
                                        borderRadius: 18,
                                        padding: 18,
                                        alignItems: 'flex-end',
                                        gap: 10,
                                    }}>
                                        <View style={{
                                            backgroundColor: `${action.color}20`,
                                            borderRadius: 12,
                                            padding: 10,
                                        }}>
                                            <Ionicons name={action.icon} size={22} color={action.color} />
                                        </View>
                                        <Text style={{
                                            color: action.color,
                                            fontWeight: '700',
                                            fontSize: 14,
                                            textAlign: 'right',
                                        }}>
                                            {action.title}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* ── Recent Alerts ────────────────────────────────────────── */}
                    {alerts.length > 0 && (
                        <View>
                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }}>التنبيهات</Text>
                                <TouchableOpacity onPress={() => router.push('/(tabs)/alerts' as any)}>
                                    <Text style={{ color: C.primary, fontSize: 13, fontWeight: '600' }}>عرض الكل</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{ gap: 10 }}>
                                {alerts.map((alert) => {
                                    const alertColor = ALERT_TYPE_COLOR(alert.type ?? '', C);
                                    const alertBg = ALERT_TYPE_BG(alert.type ?? '', C);
                                    return (
                                        <View
                                            key={alert.id}
                                            style={{
                                                flexDirection: 'row-reverse',
                                                alignItems: 'center',
                                                backgroundColor: C.card,
                                                borderRadius: 16,
                                                padding: 14,
                                                gap: 12,
                                                borderWidth: 1,
                                                borderColor: C.border,
                                                shadowColor: '#000',
                                                shadowOffset: { width: 0, height: 1 },
                                                shadowOpacity: isDarkMode ? 0.2 : 0.05,
                                                shadowRadius: 4,
                                                elevation: 1,
                                            }}
                                        >
                                            <View style={{ backgroundColor: alertBg, borderRadius: 10, padding: 8 }}>
                                                <Ionicons name="notifications" size={18} color={alertColor} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text
                                                    style={{ color: C.foreground, fontWeight: '700', textAlign: 'right', fontSize: 13 }}
                                                    numberOfLines={1}
                                                >
                                                    {alert.drugName ?? alert.message ?? 'تنبيه'}
                                                </Text>
                                                {alert.type && (
                                                    <Text style={{ color: alertColor, fontSize: 11, fontWeight: '600', textAlign: 'right', marginTop: 2 }}>
                                                        {ALERT_TYPE_LABEL[alert.type] ?? alert.type}
                                                    </Text>
                                                )}
                                            </View>
                                            <Ionicons name="chevron-back" size={16} color={C.mutedForeground} />
                                        </View>
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
