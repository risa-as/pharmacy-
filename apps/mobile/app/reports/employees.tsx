import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, ActivityIndicator,
    TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { request } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { managerPalette, Radius } from '../../constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BranchSelector } from '../../components/BranchSelector';
import { EmptyState } from '../../components/ui/EmptyState';

type Palette = ReturnType<typeof managerPalette>;

// ── Types ──────────────────────────────────────────────────────────────────
type Period = 'daily' | 'weekly' | 'monthly';
const PERIODS: { key: Period; label: string }[] = [
    { key: 'daily',   label: 'يومي' },
    { key: 'weekly',  label: 'أسبوعي' },
    { key: 'monthly', label: 'شهري' },
];

interface EmployeeStat {
    id: string;
    name: string;
    role: string;
    totalSales: number;
    transactionCount: number;
    averageBasket: number;
    totalHours: number;
    salesPerHour: number;
}

const ROLE_LABELS: Record<string, string> = {
    ADMIN:      'مدير',
    SUPER_ADMIN:'مدير النظام',
    PHARMACIST: 'صيدلاني',
    MANAGER:    'مشرف',
    CASHIER:    'كاشير',
};

// ── Helpers ────────────────────────────────────────────────────────────────
function abbr(n: number): string {
    if (n === 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} مليون`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)} ألف`;
    return n.toLocaleString('en-US');
}

function RankBadge({ rank, C }: { rank: number; C: Palette }) {
    return (
        <View style={{
            width: 28, height: 28, borderRadius: Radius.xs,
            backgroundColor: `${C.primary}1A`,
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
            <Text style={{ color: C.primary, fontWeight: '900', fontSize: 12 }}>{rank}</Text>
        </View>
    );
}

// ── Main Screen ────────────────────────────────────────────────────────────
export default function EmployeesReportScreen() {
    const { isDarkMode } = useTheme();
    const { branchId: authBranchId, isPharmacist } = useAuth();
    const C = managerPalette(isDarkMode);
    const insets = useSafeAreaInsets();

    const [employees, setEmployees]         = useState<EmployeeStat[]>([]);
    const [loading, setLoading]             = useState(true);
    const [refreshing, setRefreshing]       = useState(false);
    const [period, setPeriod]               = useState<Period>('monthly');
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);

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

    const fetchEmployees = useCallback(async () => {
        try {
            let q = `?period=${period}`;
            if (selectedBranch) q += `&branchId=${selectedBranch}`;
            const data = await request<EmployeeStat[]>(`/reports/employees${q}`);
            setEmployees(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('EmployeesReportScreen:', err);
            setEmployees([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [period, selectedBranch]);

    useEffect(() => { setLoading(true); fetchEmployees(); }, [fetchEmployees]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchEmployees(); }, [fetchEmployees]);

    // Rank by revenue (totalSales) descending
    const ranked = useMemo(() =>
        [...employees].sort((a, b) => b.totalSales - a.totalSales),
    [employees]);

    const maxSales = useMemo(() => Math.max(...ranked.map(e => e.totalSales), 1), [ranked]);

    const totals = useMemo(() => ({
        revenue: ranked.reduce((s, e) => s + (e.totalSales ?? 0), 0),
        count:   ranked.reduce((s, e) => s + (e.transactionCount ?? 0), 0),
    }), [ranked]);

    // ── Pharmacist guard (mirrors reports.tsx) ──────────────────────────────
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

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>

            {/* ── Header bar ─────────────────────────────────────────────── */}
            <View style={{
                paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 10,
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: C.background,
            }}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    activeOpacity={0.8}
                    style={{ width: 40, height: 40, borderRadius: Radius.xs, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Ionicons name="arrow-forward" size={20} color={C.foreground} />
                </TouchableOpacity>
                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }}>تقرير الموظفين</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            >
                {/* ── Period segmented control ───────────────────────────── */}
                <View style={{
                    flexDirection: 'row-reverse',
                    backgroundColor: C.card,
                    borderRadius: Radius.sm,
                    borderWidth: 1.5,
                    borderColor: `${C.primary}33`,
                    padding: 4, gap: 4, marginBottom: 16,
                }}>
                    {PERIODS.map(({ key, label }) => {
                        const sel = period === key;
                        return (
                            <TouchableOpacity
                                key={key} onPress={() => setPeriod(key)} activeOpacity={0.8}
                                style={{
                                    flex: 1, paddingVertical: 9, borderRadius: Radius.xs,
                                    alignItems: 'center',
                                    backgroundColor: sel ? C.primary : 'transparent',
                                }}
                            >
                                <Text style={{ fontSize: 13, fontWeight: sel ? '800' : '600', color: sel ? '#fff' : C.mutedForeground }}>
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* ── Branch selector ────────────────────────────────────── */}
                <BranchSelector
                    selectedBranchId={selectedBranch}
                    onSelectBranch={setSelectedBranch}
                    hideIfSingle
                    accent={C.primary}
                    accentMuted={C.primaryMuted}
                />

                {/* ── Loading ────────────────────────────────────────────── */}
                {loading && !refreshing ? (
                    <View style={{ paddingVertical: 60, alignItems: 'center', gap: 12 }}>
                        <ActivityIndicator size="large" color={C.primary} />
                        <Text style={{ color: C.mutedForeground, fontSize: 13 }}>جاري تحميل بيانات الموظفين...</Text>
                    </View>
                ) : ranked.length === 0 ? (
                    <View style={{ paddingVertical: 40 }}>
                        <EmptyState
                            icon="people-outline"
                            title="لا توجد بيانات"
                            subtitle="لا توجد مبيعات مسجلة للموظفين في هذه الفترة"
                        />
                    </View>
                ) : (
                    <View style={{ gap: 16 }}>

                        {/* ── Summary card ───────────────────────────────── */}
                        <View style={{ ...card(C.primary), padding: 16, flexDirection: 'row-reverse', gap: 10 }}>
                            {[
                                { label: 'عدد الموظفين', value: String(ranked.length),   color: C.primary },
                                { label: 'إجمالي المبيعات', value: abbr(totals.revenue),  color: C.success },
                                { label: 'عدد الفواتير',  value: String(totals.count),    color: C.info },
                            ].map(s => (
                                <View key={s.label} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                                    <Text style={{ color: s.color, fontWeight: '900', fontSize: 18 }}>{s.value}</Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 10, fontWeight: '600', textAlign: 'center' }}>{s.label}</Text>
                                </View>
                            ))}
                        </View>

                        {/* ── Ranked employee cards ──────────────────────── */}
                        <View style={{ ...card(C.primary), padding: 18 }}>
                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15 }}>أداء الموظفين</Text>
                                <View style={{ backgroundColor: C.primaryMuted, borderRadius: Radius.xs, padding: 7 }}>
                                    <Ionicons name="people" size={16} color={C.primary} />
                                </View>
                            </View>

                            {ranked.map((emp, idx) => {
                                const barPct = emp.totalSales / maxSales;
                                return (
                                    <View key={emp.id} style={{
                                        borderTopWidth: idx === 0 ? 0 : 1,
                                        borderTopColor: C.border,
                                        paddingTop: idx === 0 ? 0 : 14,
                                        marginTop: idx === 0 ? 0 : 14,
                                    }}>
                                        {/* Name + rank + role */}
                                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                            <RankBadge rank={idx + 1} C={C} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 14, textAlign: 'right' }} numberOfLines={1}>
                                                    {emp.name || 'موظف'}
                                                </Text>
                                            </View>
                                            <View style={{ backgroundColor: C.primaryMuted, borderRadius: Radius.xs, paddingHorizontal: 8, paddingVertical: 3 }}>
                                                <Text style={{ color: C.primary, fontSize: 10, fontWeight: '700' }}>
                                                    {ROLE_LABELS[emp.role] ?? emp.role}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Relative bar */}
                                        <View style={{ height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden', flexDirection: 'row-reverse', marginBottom: 10 }}>
                                            <View style={{ width: `${barPct * 100}%`, backgroundColor: C.primary, borderRadius: 3 }} />
                                        </View>

                                        {/* Stats */}
                                        <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                                            {[
                                                { label: 'الإيرادات',    value: abbr(emp.totalSales),        color: C.success },
                                                { label: 'الفواتير',     value: String(emp.transactionCount), color: C.primary },
                                                { label: 'متوسط الفاتورة', value: abbr(Math.round(emp.averageBasket)), color: C.info },
                                            ].map(s => (
                                                <View key={s.label} style={{
                                                    flex: 1, backgroundColor: C.background,
                                                    borderRadius: Radius.xs, padding: 8, alignItems: 'center',
                                                }}>
                                                    <Text style={{ color: s.color, fontWeight: '700', fontSize: 12 }}>{s.value}</Text>
                                                    <Text style={{ color: C.mutedForeground, fontSize: 10, marginTop: 2, textAlign: 'center' }}>{s.label}</Text>
                                                </View>
                                            ))}
                                        </View>

                                        {/* Sales-per-hour (only when shift hours are recorded) */}
                                        {emp.totalHours > 0 && (
                                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 8 }}>
                                                <Ionicons name="time-outline" size={13} color={C.mutedForeground} />
                                                <Text style={{ color: C.mutedForeground, fontSize: 11 }}>
                                                    {abbr(Math.round(emp.salesPerHour))} د.ع/ساعة · {emp.totalHours.toLocaleString('en-US')} ساعة عمل
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>

                    </View>
                )}
            </ScrollView>
        </View>
    );
}
