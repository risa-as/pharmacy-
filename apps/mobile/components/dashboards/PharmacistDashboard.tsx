import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';

interface Alert {
    id: string;
    drugName?: string;
    message?: string;
    type?: string;
}

interface Sale {
    id: string;
    totalAmount: number;
    createdAt: string;
}

const QUICK_ACTIONS = [
    { title: 'بيع جديد',    icon: 'cart'    as const, route: '/(tabs)/sales' },
    { title: 'مسح باركود',  icon: 'barcode' as const, route: '/scan' },
    { title: 'بحث عن دواء', icon: 'search'  as const, route: '/(tabs)/inventory' },
    { title: 'سجل الديون',  icon: 'book'    as const, route: '/(tabs)/debts' },
] as const;

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
            const today = new Date().toDateString();
            const todaySales = (salesData as Sale[]).filter(s =>
                s.createdAt && new Date(s.createdAt).toDateString() === today
            );
            setSales(todaySales);
            setAlerts((alertsData as Alert[]).slice(0, 3));
        } catch (error) {
            console.error('PharmacistDashboard: fetch error', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [branchId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

    const todayRevenue = sales.reduce((sum, s) => sum + (s.totalAmount ?? 0), 0);
    const todaySalesCount = sales.length;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
            {/* Loading skeleton */}
            {loading && !refreshing ? (
                <View style={{ gap: 16, marginTop: 8 }}>
                    <Skeleton width="60%" height={24} radius={8} style={{ alignSelf: 'flex-end' }} />
                    <Skeleton height={140} radius={16} />
                    <Skeleton height={20} width={120} radius={8} style={{ alignSelf: 'flex-end' }} />
                    <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
                        {[1, 2, 3, 4].map(i => (
                            <Skeleton key={i} height={90} radius={16} style={{ flex: 1, minWidth: '42%' }} />
                        ))}
                    </View>
                </View>
            ) : null}

            {loading ? null : <>
            {/* Greeting */}
            <View style={{ marginBottom: 20, marginTop: 8 }}>
                <Text style={{ color: C.foreground, fontSize: 20, fontWeight: '800', textAlign: 'right' }}>
                    مرحباً، {user?.name ?? 'الصيدلاني'} 👋
                </Text>
                <Text style={{ color: C.mutedForeground, fontSize: 12, marginTop: 2, textAlign: 'right' }}>
                    {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
                </Text>
            </View>

            {/* Shift Summary Card */}
            <Card className="mb-6">
                <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 15, textAlign: 'right', marginBottom: 14 }}>
                    ملخص الوردية
                </Text>
                <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                    {/* Today's revenue */}
                    <View style={{ flex: 1, backgroundColor: C.primaryMuted, borderRadius: 14, padding: 14, alignItems: 'center' }}>
                        <Ionicons name="cash" size={22} color={C.primary} />
                        <Text style={{ color: C.primary, fontSize: 20, fontWeight: '900', marginTop: 6 }}>
                            {todayRevenue.toLocaleString('ar-EG')}
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 11, marginTop: 2 }}>إجمالي اليوم</Text>
                    </View>
                    {/* Today's sales count */}
                    <View style={{ flex: 1, backgroundColor: C.successBg, borderRadius: 14, padding: 14, alignItems: 'center' }}>
                        <Ionicons name="receipt" size={22} color={C.success} />
                        <Text style={{ color: C.success, fontSize: 20, fontWeight: '900', marginTop: 6 }}>
                            {todaySalesCount}
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 11, marginTop: 2 }}>عدد المبيعات</Text>
                    </View>
                </View>
            </Card>

            {/* Quick Action Buttons — 2×2 grid */}
            <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '700', textAlign: 'right', marginBottom: 10 }}>
                إجراءات سريعة
            </Text>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                {QUICK_ACTIONS.map((action) => (
                    <TouchableOpacity
                        key={action.title}
                        onPress={() => router.push(action.route as any)}
                        activeOpacity={0.75}
                        style={{ width: '47.5%' }}
                    >
                        <Card className="items-center py-4 gap-2">
                            <View style={{ backgroundColor: `${C.primary}18`, borderRadius: 12, padding: 10 }}>
                                <Ionicons name={action.icon} size={24} color={C.primary} />
                            </View>
                            <Text style={{ color: C.foreground, fontWeight: '600', fontSize: 13, textAlign: 'center' }}>
                                {action.title}
                            </Text>
                        </Card>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Recent Alerts Preview */}
            {alerts.length > 0 && (
                <>
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '700' }}>
                            آخر التنبيهات
                        </Text>
                        <TouchableOpacity onPress={() => router.push('/(tabs)/alerts' as any)}>
                            <Text style={{ color: C.primary, fontSize: 13, fontWeight: '600' }}>عرض الكل</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={{ gap: 8 }}>
                        {alerts.map((alert) => (
                            <Card key={alert.id} className="flex-row-reverse items-center gap-3">
                                <View style={{ backgroundColor: C.warningBg, borderRadius: 10, padding: 8 }}>
                                    <Ionicons name="notifications" size={18} color={C.warning} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: C.foreground, fontWeight: '600', textAlign: 'right', fontSize: 13 }} numberOfLines={1}>
                                        {alert.drugName ?? alert.message ?? 'تنبيه'}
                                    </Text>
                                    {alert.type && (
                                        <Badge
                                            label={alert.type === 'LOW_STOCK' ? 'نقص مخزون' : alert.type === 'EXPIRY' ? 'قرب الانتهاء' : alert.type}
                                            variant={alert.type === 'LOW_STOCK' ? 'danger' : 'warning'}
                                        />
                                    )}
                                </View>
                            </Card>
                        ))}
                    </View>
                </>
            )}
            </>}
        </ScrollView>
    );
}

export default PharmacistDashboard;
