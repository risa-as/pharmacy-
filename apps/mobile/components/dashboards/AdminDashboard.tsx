import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, ScrollView, RefreshControl,
    TouchableOpacity, ActivityIndicator, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { BranchSelector } from '../BranchSelector';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 56) / 2;

interface KpiCardProps {
    title: string;
    value: string | number;
    icon: keyof typeof Ionicons.glyphMap;
    variant: 'primary' | 'success' | 'warning' | 'danger';
    route?: string;
}

const variantIcon: Record<KpiCardProps['variant'], string> = {
    primary: 'bg-primary/10',
    success: 'bg-green-100 dark:bg-green-950',
    warning: 'bg-yellow-100 dark:bg-yellow-950',
    danger:  'bg-red-100 dark:bg-red-950',
};
const variantIconColor: Record<KpiCardProps['variant'], (C: ReturnType<typeof Colors>) => string> = {
    primary: (C) => C.primary,
    success: (C) => C.success,
    warning: (C) => C.warning,
    danger:  (C) => C.danger,
};

function KpiCard({ title, value, icon, variant, route }: KpiCardProps) {
    const router = useRouter();
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const iconColor = variantIconColor[variant](C);

    return (
        <TouchableOpacity
            style={{ width: CARD_WIDTH }}
            onPress={() => route && router.push(route as any)}
            activeOpacity={route ? 0.7 : 1}
            disabled={!route}
        >
            <Card className="h-36 justify-center items-center gap-2">
                <View
                    style={{ backgroundColor: `${iconColor}20`, borderRadius: 14, padding: 10 }}
                >
                    <Ionicons name={icon} size={26} color={iconColor} />
                </View>
                <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '800' }}>
                    {typeof value === 'number' ? value.toLocaleString('ar-EG') : value}
                </Text>
                <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
                    {title}
                </Text>
            </Card>
        </TouchableOpacity>
    );
}

interface RecentSale {
    id: string;
    totalAmount: number;
    createdAt: string;
    paymentMethod?: string;
}

export function AdminDashboard() {
    const { isDarkMode } = useTheme();
    const { branchId } = useAuth();
    const C = Colors(isDarkMode);

    const [stats, setStats] = useState<any>(null);
    const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(branchId);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const [statsData, salesData] = await Promise.all([
                apiService.getStats(selectedBranch ?? undefined),
                apiService.getSales().catch(() => []),
            ]);
            setStats(statsData);
            setRecentSales((salesData as RecentSale[]).slice(0, 5));
        } catch (error) {
            console.error('AdminDashboard: fetch error', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedBranch]);

    useEffect(() => {
        setLoading(true);
        fetchData();
    }, [fetchData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={C.primary}
                />
            }
        >
            {/* Header greeting */}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 8 }}>
                <View>
                    <Text style={{ color: C.foreground, fontSize: 20, fontWeight: '800', textAlign: 'right' }}>
                        لوحة المدير
                    </Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 12, marginTop: 2, textAlign: 'right' }}>
                        {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </Text>
                </View>
                <View style={{ backgroundColor: C.primaryMuted, borderRadius: 12, padding: 10 }}>
                    <Ionicons name="analytics" size={22} color={C.primary} />
                </View>
            </View>

            {/* Branch Selector */}
            <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} />

            {/* KPI Grid */}
            {loading && !refreshing ? (
                <View style={{ marginTop: 16 }}>
                    <Skeleton width={140} height={20} radius={8} style={{ marginBottom: 16, alignSelf: 'flex-end' }} />
                    <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
                        {[1, 2, 3, 4].map(i => (
                            <Skeleton key={i} width={CARD_WIDTH} height={144} radius={16} />
                        ))}
                    </View>
                    <Skeleton height={90} radius={16} style={{ marginBottom: 16 }} />
                    <Skeleton height={200} radius={16} />
                </View>
            ) : (
                <>
                    <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '700', textAlign: 'right', marginBottom: 12, marginTop: 16 }}>
                        إحصائيات اليوم
                    </Text>
                    <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
                        <KpiCard
                            title="مبيعات اليوم"
                            value={`${(stats?.salesToday ?? 0).toLocaleString()} د.ع`}
                            icon="cash"
                            variant="primary"
                            route="/reports"
                        />
                        <KpiCard
                            title="عدد المبيعات"
                            value={stats?.salesCount ?? 0}
                            icon="receipt"
                            variant="success"
                            route="/reports"
                        />
                        <KpiCard
                            title="ديون مستحقة"
                            value={stats?.debtsCount ?? 0}
                            icon="book"
                            variant="danger"
                            route="/debts"
                        />
                        <KpiCard
                            title="تنبيهات"
                            value={stats?.expiring ?? 0}
                            icon="notifications"
                            variant="warning"
                            route="/alerts"
                        />
                    </View>

                    {/* Low Stock Warning */}
                    {(stats?.lowStock ?? 0) > 0 && (
                        <Card className="mb-6 flex-row-reverse items-center gap-3">
                            <View style={{ backgroundColor: `${C.warning}20`, borderRadius: 10, padding: 8 }}>
                                <Ionicons name="alert-circle" size={20} color={C.warning} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontWeight: '700', textAlign: 'right' }}>
                                    نواقص في المخزون
                                </Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right' }}>
                                    {stats.lowStock} صنف تحت حد إعادة الطلب
                                </Text>
                            </View>
                            <Badge label={String(stats.lowStock)} variant="warning" />
                        </Card>
                    )}

                    {/* Recent Sales */}
                    {recentSales.length > 0 && (
                        <>
                            <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '700', textAlign: 'right', marginBottom: 12 }}>
                                آخر المبيعات
                            </Text>
                            <Card>
                                {recentSales.map((sale, idx) => (
                                    <View key={sale.id}>
                                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: C.foreground, fontWeight: '600', textAlign: 'right', fontSize: 13 }}>
                                                    {new Date(sale.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                                </Text>
                                                {sale.paymentMethod && (
                                                    <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                                                        {sale.paymentMethod === 'CASH' ? 'نقدي' : sale.paymentMethod}
                                                    </Text>
                                                )}
                                            </View>
                                            <Text style={{ color: C.success, fontWeight: '800', fontSize: 15 }}>
                                                {sale.totalAmount.toLocaleString()} د.ع
                                            </Text>
                                        </View>
                                        {idx < recentSales.length - 1 && (
                                            <View style={{ height: 1, backgroundColor: C.border }} />
                                        )}
                                    </View>
                                ))}
                            </Card>
                        </>
                    )}
                </>
            )}
        </ScrollView>
    );
}

export default AdminDashboard;
