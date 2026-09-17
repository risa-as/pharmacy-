import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { request, apiService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Radius } from '../../constants/colors';
import { BranchSelector } from '../../components/BranchSelector';
import { EmptyState } from '../../components/ui/EmptyState';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { usePalette, Surface, IconTile, SegmentedTabs, InfoNote, StateBlock, Tone } from '../../components/ui/Kit';
import { formatDate } from '../../utils/date';
import { formatNumber, initials, CURRENCY } from '../../utils/format';
import { roleLabel } from '../../utils/roles';

type Period = 'daily' | 'weekly' | 'monthly';

interface EmployeeStat {
    id: string;
    name: string;
    role: string;
    branchName?: string;
    totalSales: number;
    transactionCount: number;
    averageBasket: number;
    totalHours: number;
    salesPerHour: number;
}

/** Text for the «الفترة» field: the actual range the numbers cover. */
function periodLabel(period: Period): string {
    const now = new Date();
    if (period === 'daily') return formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' });
    if (period === 'weekly') return 'آخر 7 أيام';
    return formatDate(now, { month: 'long', year: 'numeric' });
}

/**
 * Employee performance (design employees.png): branch and period on top, one
 * card per employee with their figures, then work hours and sales per hour.
 * Hours show «غير متوفر» when no shift data exists — never an invented score.
 */
export default function EmployeesReportScreen() {
    const C = usePalette();
    const insets = useSafeAreaInsets();
    const { branchId: authBranchId, isPharmacistShell, isAdmin } = useAuth();

    const [employees, setEmployees] = useState<EmployeeStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [period, setPeriod] = useState<Period>('daily');
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);
    const [branchCount, setBranchCount] = useState(0);

    useEffect(() => {
        if (!isAdmin) return;
        apiService.getBranches()
            .then(list => setBranchCount(Array.isArray(list) ? list.length : 0))
            .catch(() => setBranchCount(0));
    }, [isAdmin]);

    const fetchEmployees = useCallback(async () => {
        try {
            let q = `?period=${period}`;
            if (selectedBranch) q += `&branchId=${selectedBranch}`;
            const data = await request<EmployeeStat[]>(`/reports/employees${q}`);
            setEmployees(Array.isArray(data) ? data : []);
            setFailed(false);
        } catch (err) {
            console.error('EmployeesReportScreen:', err);
            setEmployees([]);
            setFailed(true);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [period, selectedBranch]);

    useEffect(() => { setLoading(true); fetchEmployees(); }, [fetchEmployees]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchEmployees(); }, [fetchEmployees]);

    const ranked = useMemo(() => [...employees].sort((a, b) => b.totalSales - a.totalSales), [employees]);
    const totals = useMemo(() => {
        const revenue = ranked.reduce((s, e) => s + (e.totalSales ?? 0), 0);
        const count = ranked.reduce((s, e) => s + (e.transactionCount ?? 0), 0);
        return { revenue, count, basket: count > 0 ? Math.round(revenue / count) : 0 };
    }, [ranked]);

    if (isPharmacistShell) {
        return (
            <View style={{ flex: 1, backgroundColor: C.background, justifyContent: 'center', padding: 24 }}>
                <EmptyState icon="lock-closed" title="لا تملك صلاحية الوصول" subtitle="هذه الصفحة مخصصة للإدارة" actionLabel="رجوع" onAction={() => router.back()} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <ScreenHeader title="أداء الموظفين" fallbackHref="/(tabs)/reports" />
            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 14 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            >
                {/* Branch + period, labelled as in the design */}
                <Surface style={{ flexDirection: 'row-reverse', gap: 12, alignItems: 'flex-start' }}>
                    {/* Branch field only when the organisation actually has more than one */}
                    {isAdmin && branchCount > 1 && (
                        <View style={{ flex: 1 }}>
                            <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} label="الفرع" />
                        </View>
                    )}
                    <View style={{ flex: 1, gap: 6 }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right' }}>الفترة</Text>
                        <View style={{
                            backgroundColor: C.input, borderRadius: Radius.control, borderWidth: 1, borderColor: C.border,
                            paddingHorizontal: 12, height: 44, justifyContent: 'center',
                        }}>
                            <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '700', textAlign: 'right' }} numberOfLines={1}>
                                {periodLabel(period)}
                            </Text>
                        </View>
                    </View>
                </Surface>

                <SegmentedTabs<Period>
                    items={[{ key: 'daily', label: 'يومي' }, { key: 'weekly', label: 'أسبوعي' }, { key: 'monthly', label: 'شهري' }]}
                    value={period}
                    onChange={setPeriod}
                />

                {loading && !refreshing ? (
                    <StateBlock loading title="جارِ تحميل بيانات الموظفين…" />
                ) : failed ? (
                    <StateBlock icon="cloud-offline-outline" title="تعذّر تحميل التقرير" message="تحقق من الاتصال ثم أعد المحاولة." actionLabel="إعادة المحاولة" onAction={onRefresh} />
                ) : ranked.length === 0 ? (
                    <StateBlock icon="people-outline" title="لا توجد بيانات" message="لا توجد مبيعات مسجلة للموظفين في هذه الفترة" />
                ) : (
                    <>
                        {/* Branch totals — skipped when one employee is the whole branch */}
                        {ranked.length > 1 && (
                            <View style={{ gap: 12 }}>
                                <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                                    <MetricTile label="الموظفون" icon="people" value={formatNumber(ranked.length)} />
                                    <MetricTile label="المبيعات" icon="stats-chart" value={formatNumber(totals.revenue)} currency />
                                </View>
                                <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                                    <MetricTile label="المعاملات" icon="receipt" value={formatNumber(totals.count)} />
                                    <MetricTile label="متوسط السلة" icon="cart" value={formatNumber(totals.basket)} currency />
                                </View>
                            </View>
                        )}

                        {ranked.map(emp => (
                            <EmployeeBlock key={emp.id} employee={emp} />
                        ))}

                        <InfoNote text="تُعرض «غير متوفر» عند غياب بيانات الدوام." />
                    </>
                )}
            </ScrollView>
        </View>
    );
}

/** One employee: identity, their four figures, then hours and sales per hour. */
function EmployeeBlock({ employee }: { employee: EmployeeStat }) {
    const C = usePalette();
    const hasHours = employee.totalHours > 0;

    return (
        <View style={{ gap: 12 }}>
            <Surface style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
                <View style={{ width: 52, height: 52, borderRadius: Radius.control, backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: C.primary, fontSize: 17, fontWeight: '900' }}>{initials(employee.name) || '#'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900', textAlign: 'right' }} numberOfLines={1}>{employee.name || 'موظف'}</Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>
                        {[roleLabel(employee.role), employee.branchName].filter(Boolean).join(' · ')}
                    </Text>
                </View>
            </Surface>

            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                <MetricTile label="المبيعات" icon="stats-chart" value={formatNumber(employee.totalSales)} currency />
                <MetricTile label="المعاملات" icon="receipt" value={formatNumber(employee.transactionCount)} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                <MetricTile label="متوسط السلة" icon="cart" value={formatNumber(Math.round(employee.averageBasket))} currency />
                <MetricTile label="مبيعات الساعة" icon="speedometer" value={hasHours ? formatNumber(Math.round(employee.salesPerHour)) : '—'} currency={hasHours} />
            </View>

            <Surface padded={false} style={{ paddingHorizontal: 14 }}>
                <DetailRow
                    icon="time-outline"
                    label="ساعات العمل"
                    value={hasHours ? `${formatNumber(employee.totalHours)} ساعات` : 'غير متوفر'}
                    hint={hasHours ? 'حسب السجل' : 'لا توجد ورديات مسجلة'}
                    tone={hasHours ? 'primary' : 'neutral'}
                    divider
                />
                <DetailRow
                    icon="stats-chart-outline"
                    label="مبيعات الساعة"
                    value={hasHours ? `${formatNumber(Math.round(employee.salesPerHour))} ${CURRENCY}` : 'غير متوفر'}
                    hint={hasHours ? `${formatNumber(employee.totalSales)} ÷ ${formatNumber(employee.totalHours)}` : undefined}
                    tone={hasHours ? 'primary' : 'neutral'}
                />
            </Surface>
        </View>
    );
}

/** KPI tile: label with its icon, then the figure in blue. */
function MetricTile({ label, icon, value, currency }: {
    label: string; icon: React.ComponentProps<typeof IconTile>['icon']; value: string; currency?: boolean;
}) {
    const C = usePalette();
    return (
        <Surface padded={false} style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 11, gap: 8 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: C.mutedForeground, fontSize: 13.5 }} numberOfLines={1}>{label}</Text>
                <IconTile icon={icon} size={30} />
            </View>
            <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                style={{ color: C.primary, fontSize: 22, fontWeight: '900', textAlign: 'right' }}
            >
                {value}{currency ? <Text style={{ fontSize: 11.5, fontWeight: '600', color: C.mutedForeground }}> {CURRENCY}</Text> : null}
            </Text>
        </Surface>
    );
}

function DetailRow({ icon, label, value, hint, tone, divider }: {
    icon: React.ComponentProps<typeof IconTile>['icon'];
    label: string; value: string; hint?: string; tone: Tone; divider?: boolean;
}) {
    const C = usePalette();
    return (
        <View style={{
            flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 12,
            borderBottomWidth: divider ? 1 : 0, borderBottomColor: C.border,
        }}>
            <IconTile icon={icon} tone={tone} size={36} />
            <Text style={{ flex: 1, color: C.mutedForeground, fontSize: 14, textAlign: 'right' }}>{label}</Text>
            <View style={{ alignItems: 'flex-start' }}>
                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '900' }} numberOfLines={1}>{value}</Text>
                {hint ? <Text style={{ color: C.mutedForeground, fontSize: 12 }} numberOfLines={1}>{hint}</Text> : null}
            </View>
        </View>
    );
}
