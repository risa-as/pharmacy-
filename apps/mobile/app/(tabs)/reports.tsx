import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, ScrollView, RefreshControl, ActivityIndicator,
    TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { BranchSelector } from '../../components/BranchSelector';
import { useSyncStatus } from '../../context/SyncContext';

type Period = 'daily' | 'weekly' | 'monthly';

const PERIODS: { key: Period; label: string }[] = [
    { key: 'daily',   label: 'يومي' },
    { key: 'weekly',  label: 'أسبوعي' },
    { key: 'monthly', label: 'شهري' },
];

export default function ReportsScreen() {
    const { isDarkMode } = useTheme();
    const { isPharmacist, branchId: authBranchId } = useAuth();
    const { triggerSync } = useSyncStatus();
    const router = useRouter();
    const C = Colors(isDarkMode);

    const [report, setReport] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [period, setPeriod] = useState<Period>('daily');
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);

    // Pharmacists don't have access to reports
    if (isPharmacist) {
        return (
            <View style={{ flex: 1, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                <EmptyState
                    icon="lock-closed"
                    title="لا تملك صلاحية الوصول"
                    subtitle="هذه الصفحة مخصصة للمدير فقط"
                    actionLabel="رجوع"
                    onAction={() => router.back()}
                />
            </View>
        );
    }

    const fetchReport = useCallback(async () => {
        try {
            // API currently supports daily/monthly — weekly maps to daily gracefully
            const apiPeriod = period === 'weekly' ? 'daily' : period;
            const data = await apiService.getReports(apiPeriod, selectedBranch ?? undefined);
            setReport(data);
        } catch (error) {
            console.error('ReportsScreen: fetch error', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [period, selectedBranch]);

    useEffect(() => {
        setLoading(true);
        fetchReport();
    }, [fetchReport]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        triggerSync('stats');
        fetchReport();
    }, [fetchReport, triggerSync]);

    const periodLabel = PERIODS.find(p => p.key === period)?.label ?? '';

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
            {/* Header */}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 8 }}>
                <View>
                    <Text style={{ color: C.foreground, fontSize: 20, fontWeight: '800', textAlign: 'right' }}>
                        التقارير المالية
                    </Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 12, marginTop: 2, textAlign: 'right' }}>
                        {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={() => router.push('/reports/financial' as any)}
                    style={{ backgroundColor: C.primaryMuted, borderRadius: 12, padding: 10 }}
                >
                    <Ionicons name="open-outline" size={20} color={C.primary} />
                </TouchableOpacity>
            </View>

            {/* Segmented Period Control */}
            <View style={{
                flexDirection: 'row-reverse',
                backgroundColor: C.border,
                borderRadius: 14,
                padding: 4,
                marginBottom: 20,
                gap: 2,
            }}>
                {PERIODS.map(({ key, label }) => (
                    <TouchableOpacity
                        key={key}
                        onPress={() => setPeriod(key)}
                        style={{
                            flex: 1,
                            paddingVertical: 8,
                            borderRadius: 10,
                            alignItems: 'center',
                            backgroundColor: period === key ? C.card : 'transparent',
                        }}
                    >
                        <Text style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: period === key ? C.primary : C.mutedForeground,
                        }}>
                            {label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Branch Selector */}
            <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} />

            {loading && !refreshing ? (
                <View style={{ gap: 16, marginTop: 8 }}>
                    <Skeleton height={140} radius={16} />
                    <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                        <Skeleton height={80} radius={12} style={{ flex: 1 }} />
                        <Skeleton height={80} radius={12} style={{ flex: 1 }} />
                        <Skeleton height={80} radius={12} style={{ flex: 1 }} />
                    </View>
                    <Skeleton height={180} radius={16} />
                </View>
            ) : (
                <>
                    {/* Net Profit Hero Card */}
                    <Card className="mb-4 items-center py-8">
                        <View style={{ backgroundColor: `${C.primary}18`, borderRadius: 16, padding: 12, marginBottom: 12 }}>
                            <Ionicons name="bar-chart" size={28} color={C.primary} />
                        </View>
                        <Text style={{ color: C.mutedForeground, fontSize: 13, marginBottom: 4 }}>
                            صافي ربح ({periodLabel})
                        </Text>
                        <Text style={{ color: C.foreground, fontSize: 34, fontWeight: '900' }}>
                            {(report?.profit ?? 0).toLocaleString('ar-EG')}
                            <Text style={{ fontSize: 16, fontWeight: '600', color: C.mutedForeground }}> د.ع</Text>
                        </Text>
                    </Card>

                    {/* Revenue / Expenses / Transactions Row */}
                    <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: 20 }}>
                        <Card className="flex-1 items-center py-4 gap-1">
                            <Ionicons name="arrow-up-circle" size={22} color={C.success} />
                            <Text style={{ color: C.mutedForeground, fontSize: 11 }}>المبيعات</Text>
                            <Text style={{ color: C.success, fontWeight: '700', fontSize: 15 }}>
                                {(report?.revenue ?? 0).toLocaleString()}
                            </Text>
                        </Card>
                        <Card className="flex-1 items-center py-4 gap-1">
                            <Ionicons name="arrow-down-circle" size={22} color={C.danger} />
                            <Text style={{ color: C.mutedForeground, fontSize: 11 }}>المصروفات</Text>
                            <Text style={{ color: C.danger, fontWeight: '700', fontSize: 15 }}>
                                {(report?.expenses ?? 0).toLocaleString()}
                            </Text>
                        </Card>
                        <Card className="flex-1 items-center py-4 gap-1">
                            <Ionicons name="receipt" size={22} color={C.info} />
                            <Text style={{ color: C.mutedForeground, fontSize: 11 }}>العمليات</Text>
                            <Text style={{ color: C.info, fontWeight: '700', fontSize: 15 }}>
                                {(report?.transactions ?? report?.chart?.length ?? 0).toLocaleString()}
                            </Text>
                        </Card>
                    </View>

                    {/* Activity Bar Chart */}
                    {Array.isArray(report?.chart) && report.chart.length > 0 && (
                        <Card>
                            <Text style={{ color: C.foreground, fontWeight: '700', textAlign: 'right', marginBottom: 16, fontSize: 15 }}>
                                الأداء خلال الفترة
                            </Text>
                            <View style={{ gap: 14 }}>
                                {report.chart.map((item: any, idx: number) => {
                                    const max = Math.max(...report.chart.map((i: any) => i.amount ?? 0), 1);
                                    const pct = Math.max(4, ((item.amount ?? 0) / max) * 100);
                                    return (
                                        <View key={idx} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                                            <Text style={{ color: C.foreground, fontSize: 11, fontWeight: '600', width: 52, textAlign: 'right' }}>
                                                {new Date(item.date).toLocaleDateString('ar-EG', { weekday: 'short' })}
                                            </Text>
                                            <View style={{ flex: 1, height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden', flexDirection: 'row-reverse' }}>
                                                <View style={{ width: `${pct}%`, height: '100%', backgroundColor: C.primary, borderRadius: 4 }} />
                                            </View>
                                            <Text style={{ color: C.mutedForeground, fontSize: 11, width: 64, textAlign: 'left' }}>
                                                {(item.amount ?? 0).toLocaleString()}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </Card>
                    )}
                </>
            )}
        </ScrollView>
    );
}
