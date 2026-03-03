import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { BranchSelector } from '../../components/BranchSelector';

export default function FinancialReportScreen() {
    const { isDarkMode } = useTheme();
    const { branchId: authBranchId } = useAuth();
    const C = Colors(isDarkMode);

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const json = await apiService.getReports('monthly', selectedBranch ?? undefined);
            setData(json);
        } catch (error) {
            console.error('FinancialReportScreen: fetch error', error);
        } finally {
            setLoading(false);
        }
    }, [selectedBranch]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const profitMargin = data?.revenue
        ? Math.round((data.profit / data.revenue) * 100)
        : 0;

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {/* Header */}
            <View style={{
                backgroundColor: C.card,
                flexDirection: 'row-reverse',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingTop: 56,
                paddingBottom: 16,
                borderBottomWidth: 1,
                borderBottomColor: C.border,
            }}>
                <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '800' }}>التقرير المالي التفصيلي</Text>
                <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: C.border, borderRadius: 10, padding: 8 }}>
                    <Ionicons name="arrow-back" size={20} color={C.foreground} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110 }}>
                {/* Branch Selector */}
                <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} />

                {loading ? (
                    <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 48 }} />
                ) : (
                    <>
                        {/* Summary Cards Row */}
                        <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: 16, marginTop: 8 }}>
                            <Card className="flex-1 items-center py-5 gap-1">
                                <Ionicons name="trending-up" size={22} color={C.success} />
                                <Text style={{ color: C.mutedForeground, fontSize: 11 }}>الإيرادات</Text>
                                <Text style={{ color: C.success, fontWeight: '800', fontSize: 16 }}>
                                    {(data?.revenue ?? 0).toLocaleString()}
                                </Text>
                            </Card>
                            <Card className="flex-1 items-center py-5 gap-1">
                                <Ionicons name="trending-down" size={22} color={C.danger} />
                                <Text style={{ color: C.mutedForeground, fontSize: 11 }}>المصروفات</Text>
                                <Text style={{ color: C.danger, fontWeight: '800', fontSize: 16 }}>
                                    {(data?.expenses ?? 0).toLocaleString()}
                                </Text>
                            </Card>
                        </View>

                        {/* Net Profit + Margin */}
                        <Card className="mb-4 flex-row-reverse items-center justify-between">
                            <View>
                                <Text style={{ color: C.mutedForeground, fontSize: 12 }}>صافي الربح الشهري</Text>
                                <Text style={{ color: C.foreground, fontSize: 26, fontWeight: '900', marginTop: 4 }}>
                                    {(data?.profit ?? 0).toLocaleString()}
                                    <Text style={{ fontSize: 14, color: C.mutedForeground }}> د.ع</Text>
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                <Badge
                                    label={`هامش ${profitMargin}%`}
                                    variant={profitMargin >= 20 ? 'success' : profitMargin >= 10 ? 'warning' : 'danger'}
                                />
                                <Text style={{ color: C.mutedForeground, fontSize: 11 }}>هامش الربح</Text>
                            </View>
                        </Card>

                        {/* Expense Breakdown */}
                        {data?.expenseBreakdown && (
                            <Card className="mb-4">
                                <Text style={{ color: C.foreground, fontWeight: '700', textAlign: 'right', marginBottom: 14, fontSize: 15 }}>
                                    تفاصيل المصروفات
                                </Text>
                                {Object.entries(data.expenseBreakdown as Record<string, number>).map(([category, amount]) => (
                                    <View key={category} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                                        <Text style={{ color: C.foreground, fontSize: 13 }}>{category}</Text>
                                        <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>
                                            {amount.toLocaleString()} د.ع
                                        </Text>
                                    </View>
                                ))}
                            </Card>
                        )}

                        {/* Daily Performance Bar Chart */}
                        {Array.isArray(data?.chart) && data.chart.length > 0 && (
                            <Card className="mb-4">
                                <Text style={{ color: C.foreground, fontWeight: '700', textAlign: 'right', marginBottom: 16, fontSize: 15 }}>
                                    أداء المبيعات
                                </Text>
                                <View style={{ height: 120, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 8 }}>
                                    {data.chart.map((day: any) => {
                                        const max = Math.max(...data.chart.map((d: any) => d.amount ?? 0), 1);
                                        const barH = Math.max(4, ((day.amount ?? 0) / max) * 100);
                                        return (
                                            <View key={day.date} style={{ alignItems: 'center', gap: 4 }}>
                                                <View style={{ width: 10, height: barH, backgroundColor: C.primary, borderRadius: 4 }} />
                                                <Text style={{ fontSize: 9, color: C.mutedForeground }}>
                                                    {(day.date ?? '').slice(5)}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </View>
                                <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'center' }}>
                                    المبيعات اليومية — آخر {data.chart.length} أيام
                                </Text>
                            </Card>
                        )}

                        {/* Branch Comparison placeholder */}
                        <Card>
                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 15 }}>مقارنة الفروع</Text>
                                <Badge label="قريباً" variant="info" />
                            </View>
                            <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 8 }}>
                                حدد فرعاً من القائمة أعلاه لتصفية النتائج
                            </Text>
                        </Card>
                    </>
                )}
            </ScrollView>
        </View>
    );
}
