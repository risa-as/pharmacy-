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
const CARD_W = (width - 56) / 2;

// ── Metric Tile ────────────────────────────────────────────────────────────────
interface MetricTileProps {
    title: string;
    value: string | number;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    bg: string;
    route?: string;
}
function MetricTile({ title, value, icon, color, bg, route }: MetricTileProps) {
    const router = useRouter();
    return (
        <TouchableOpacity
            style={{ width: CARD_W }}
            onPress={() => route && router.push(route as any)}
            activeOpacity={route ? 0.75 : 1}
            disabled={!route}
        >
            <View style={{
                backgroundColor: bg,
                borderRadius: 18,
                padding: 16,
                minHeight: 106,
                justifyContent: 'space-between',
            }}>
                {/* Icon */}
                <View style={{
                    alignSelf: 'flex-end',
                    backgroundColor: `${color}20`,
                    borderRadius: 10,
                    padding: 8,
                }}>
                    <Ionicons name={icon} size={20} color={color} />
                </View>
                {/* Value */}
                <View style={{ marginTop: 10 }}>
                    <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.6}
                        style={{
                            color,
                            fontSize: 22,
                            fontWeight: '900',
                            textAlign: 'right',
                        }}
                    >
                        {typeof value === 'number' ? value.toLocaleString('en-US') : value}
                    </Text>
                    <Text style={{ color: `${color}99`, fontSize: 12, fontWeight: '600', textAlign: 'right', marginTop: 2 }}>
                        {title}
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
    );
}

// ── Sale Row ───────────────────────────────────────────────────────────────────
interface RecentSale {
    id: string;
    total?: number;
    totalAmount?: number;
    createdAt: string;
    paymentMethod?: string;
}
function SaleRow({ sale, isLast }: { sale: RecentSale; isLast: boolean }) {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const amount = sale.total ?? sale.totalAmount ?? 0;
    const isCash = !sale.paymentMethod || sale.paymentMethod === 'CASH';

    return (
        <>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 12, gap: 12 }}>
                {/* Method icon */}
                <View style={{
                    backgroundColor: isCash ? C.successBg : C.primaryMuted,
                    borderRadius: 10,
                    padding: 8,
                }}>
                    <Ionicons
                        name={isCash ? 'cash' : 'card'}
                        size={16}
                        color={isCash ? C.success : C.primary}
                    />
                </View>
                {/* Info */}
                <View style={{ flex: 1 }}>
                    <Text style={{ color: C.foreground, fontWeight: '600', textAlign: 'right', fontSize: 13 }}>
                        {sale.createdAt ? formatTime(sale.createdAt, { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    </Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 1 }}>
                        {isCash ? 'نقدي' : (sale.paymentMethod ?? '')}
                    </Text>
                </View>
                {/* Amount */}
                <View style={{ alignItems: 'flex-start' }}>
                    <Text style={{ color: C.success, fontWeight: '800', fontSize: 15 }}>
                        {amount.toLocaleString('en-US')}
                    </Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 10, textAlign: 'left' }}>د.ع</Text>
                </View>
            </View>
            {!isLast && <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 4 }} />}
        </>
    );
}

// ── AdminDashboard ─────────────────────────────────────────────────────────────
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
        } catch (err) {
            console.error('AdminDashboard:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedBranch]);

    useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ paddingBottom: 110 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            showsVerticalScrollIndicator={false}
        >
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginBottom: 2 }}>
                            {formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
                        </Text>
                        <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '900', textAlign: 'right' }}>
                            لوحة التحكم
                        </Text>
                    </View>
                    <View style={{
                        backgroundColor: C.primary,
                        borderRadius: 14,
                        padding: 11,
                        marginRight: 0,
                        shadowColor: C.primary,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 8,
                        elevation: 6,
                    }}>
                        <Ionicons name="analytics" size={22} color="#fff" />
                    </View>
                </View>
            </View>

            {/* ── Branch Filter ───────────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 20 }}>
                <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} />
            </View>

            {/* ── Loading ─────────────────────────────────────────────────────── */}
            {loading && !refreshing ? (
                <View style={{ paddingHorizontal: 20, gap: 16 }}>
                    <Skeleton height={160} radius={24} />
                    <View style={{ flexDirection: 'row-reverse', gap: 16 }}>
                        <Skeleton width={CARD_W} height={106} radius={18} />
                        <Skeleton width={CARD_W} height={106} radius={18} />
                    </View>
                    <Skeleton height={160} radius={18} />
                </View>
            ) : (
                <View style={{ paddingHorizontal: 20, gap: 20 }}>

                    {/* ── Hero Revenue Card ─────────────────────────────────── */}
                    <View style={{
                        backgroundColor: C.primary,
                        borderRadius: 24,
                        padding: 22,
                        shadowColor: C.primary,
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.35,
                        shadowRadius: 16,
                        elevation: 10,
                    }}>
                        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, textAlign: 'right', fontWeight: '500' }}>
                            إجمالي مبيعات اليوم
                        </Text>
                        <Text style={{ color: '#fff', fontSize: 36, fontWeight: '900', textAlign: 'right', marginTop: 4, marginBottom: 20 }}>
                            {(stats?.salesToday ?? 0).toLocaleString('en-US')}
                            {'  '}
                            <Text style={{ fontSize: 16, fontWeight: '600' }}>د.ع</Text>
                        </Text>

                        {/* Sub-metrics */}
                        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                            {[
                                { label: 'مبيعات', value: stats?.salesCount ?? 0, icon: 'receipt' as const },
                                { label: 'تنبيهات', value: stats?.expiring ?? 0, icon: 'notifications' as const },
                                { label: 'ديون', value: stats?.debtsCount ?? 0, icon: 'book' as const },
                            ].map(m => (
                                <View key={m.label} style={{
                                    flex: 1,
                                    backgroundColor: 'rgba(255,255,255,0.14)',
                                    borderRadius: 14,
                                    padding: 12,
                                    alignItems: 'center',
                                    gap: 4,
                                }}>
                                    <Ionicons name={m.icon} size={16} color="rgba(255,255,255,0.8)" />
                                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>
                                        {String(m.value)}
                                    </Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600' }}>
                                        {m.label}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* ── Secondary KPI Grid ──────────────────────────────────── */}
                    <View style={{ flexDirection: 'row-reverse', gap: 16 }}>
                        <MetricTile
                            title="نواقص المخزون"
                            value={stats?.lowStock ?? 0}
                            icon="cube"
                            color={C.warning}
                            bg={C.warningBg}
                            route="/(tabs)/inventory"
                        />
                        <MetricTile
                            title="أصناف منتهية"
                            value={stats?.expiredCount ?? 0}
                            icon="alert-circle"
                            color={C.danger}
                            bg={C.dangerBg}
                            route="/(tabs)/inventory"
                        />
                    </View>

                    {/* ── Low Stock Banner ─────────────────────────────────────── */}
                    {(stats?.lowStock ?? 0) > 0 && (
                        <View style={{
                            flexDirection: 'row-reverse',
                            alignItems: 'center',
                            backgroundColor: C.warningBg,
                            borderRadius: 16,
                            padding: 14,
                            gap: 12,
                            borderWidth: 1,
                            borderColor: `${C.warning}30`,
                        }}>
                            <View style={{ backgroundColor: `${C.warning}25`, borderRadius: 10, padding: 8 }}>
                                <Ionicons name="alert-circle" size={20} color={C.warning} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontWeight: '700', textAlign: 'right', fontSize: 13 }}>
                                    تنبيه: نواقص في المخزون
                                </Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }}>
                                    {stats.lowStock} صنف تحت حد إعادة الطلب
                                </Text>
                            </View>
                            <View style={{ backgroundColor: C.warning, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 }}>
                                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{stats.lowStock}</Text>
                            </View>
                        </View>
                    )}

                    {/* ── Recent Sales ─────────────────────────────────────────── */}
                    {recentSales.length > 0 && (
                        <View>
                            <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right', marginBottom: 12 }}>
                                آخر المبيعات
                            </Text>
                            <View style={{
                                backgroundColor: C.card,
                                borderRadius: 20,
                                paddingHorizontal: 16,
                                borderWidth: 1,
                                borderColor: C.border,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: isDarkMode ? 0.3 : 0.06,
                                shadowRadius: 8,
                                elevation: 2,
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
