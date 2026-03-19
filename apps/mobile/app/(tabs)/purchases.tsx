import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View, Text, FlatList, RefreshControl, TouchableOpacity, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { BranchSelector } from '../../components/BranchSelector';
import { useSyncStatus } from '../../context/SyncContext';

type BadgeVariantType = 'success' | 'warning' | 'danger' | 'info' | 'default';
type StatusKey = 'COMPLETED' | 'PENDING' | 'CANCELLED' | 'RECEIVED';
type FilterKey = StatusKey | 'ALL' | 'SUGGESTED';

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariantType; color: (C: ReturnType<typeof Colors>) => string }> = {
    COMPLETED: { label: 'مكتمل',        variant: 'success', color: C => C.success },
    PENDING:   { label: 'قيد الانتظار', variant: 'warning', color: C => C.warning },
    CANCELLED: { label: 'ملغى',          variant: 'danger',  color: C => C.danger  },
    RECEIVED:  { label: 'تم الاستلام',  variant: 'info',    color: C => C.info    },
};

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'SUGGESTED', label: 'مقترح للطلب' },
    { key: 'ALL',       label: 'السجل' },
    { key: 'PENDING',   label: 'قيد الانتظار' },
    { key: 'RECEIVED',  label: 'تم الاستلام' },
    { key: 'COMPLETED', label: 'مكتمل' },
    { key: 'CANCELLED', label: 'ملغى' },
];

function getStatus(status: string) {
    return STATUS_MAP[status] ?? { label: status, variant: 'default' as BadgeVariantType, color: (C: ReturnType<typeof Colors>) => C.mutedForeground };
}

export default function PurchasesScreen() {
    const router = useRouter();
    const { isDarkMode } = useTheme();
    const { isAdmin, branchId: authBranchId } = useAuth();
    const { triggerSync } = useSyncStatus();
    const C = Colors(isDarkMode);

    const [purchases, setPurchases] = useState<any[]>([]);
    const [lowStockItems, setLowStockItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);
    const [activeFilter, setActiveFilter] = useState<FilterKey>('SUGGESTED');

    const fetchPurchases = useCallback(async () => {
        try {
            const [purchasesData, lowStockData] = await Promise.all([
                apiService.getPurchases(selectedBranch ?? undefined),
                apiService.getLowStockItems(selectedBranch ?? undefined),
            ]);
            setPurchases(Array.isArray(purchasesData) ? purchasesData : []);
            setLowStockItems(Array.isArray(lowStockData) ? lowStockData : []);
        } catch (error) {
            console.error('PurchasesScreen: fetch error', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedBranch]);

    useEffect(() => {
        setLoading(true);
        fetchPurchases();
    }, [fetchPurchases]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        triggerSync('purchases');
        fetchPurchases();
    }, [fetchPurchases, triggerSync]);

    const filtered = useMemo(() => {
        if (activeFilter === 'SUGGESTED') return [];
        if (activeFilter === 'ALL') return purchases;
        return purchases.filter(p => p.status === activeFilter);
    }, [purchases, activeFilter]);

    const pendingCount = useMemo(() => purchases.filter(p => p.status === 'PENDING').length, [purchases]);
    const totalValue   = useMemo(() => purchases.reduce((s, p) => s + (p.totalAmount ?? 0), 0), [purchases]);

    const renderLowStockItem = useCallback(({ item }: { item: any }) => {
        return (
            <View style={{
                backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border,
                marginBottom: 10, overflow: 'hidden',
            }}>
                <View style={{ height: 3, backgroundColor: item.currentStock === 0 ? C.danger : C.warning }} />
                <View style={{ padding: 14 }}>
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <View style={{ flex: 1, paddingLeft: 10 }}>
                            <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 15, textAlign: 'right' }} numberOfLines={1}>
                                {item.drugName}
                            </Text>
                            <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                                {item.branchName}
                            </Text>
                        </View>
                        <Badge
                            label={item.currentStock === 0 ? 'نفاد تام' : 'نقص مخزون'}
                            variant={item.currentStock === 0 ? 'danger' : 'warning'}
                        />
                    </View>
                    <View style={{ height: 1, backgroundColor: C.border, marginBottom: 10 }} />
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 10 }}>المخزون الحالي</Text>
                            <Text style={{ color: item.currentStock === 0 ? C.danger : C.warning, fontWeight: '800', fontSize: 18 }}>
                                {item.currentStock}
                            </Text>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 10 }}>الحد الأدنى</Text>
                            <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 18 }}>{item.minStock}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-start' }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 10 }}>الكمية المقترحة</Text>
                            <Text style={{ color: C.primary, fontWeight: '800', fontSize: 18 }}>{item.suggestedQty}</Text>
                        </View>
                    </View>
                </View>
            </View>
        );
    }, [C]);

    const renderPurchase = useCallback(({ item: purchase }: { item: any }) => {
        const { label, variant, color } = getStatus(purchase.status);
        const accentColor = color(C);
        const isPending = purchase.status === 'PENDING';
        const dateStr = new Date(purchase.createdAt).toLocaleDateString('ar-EG', {
            day: 'numeric', month: 'short', year: 'numeric',
        });
        const refId = purchase.id.slice(0, 8).toUpperCase();

        return (
            <TouchableOpacity
                onPress={() => router.push(`/purchases/${purchase.id}` as any)}
                activeOpacity={0.88}
                style={{ marginBottom: 10 }}
            >
                <View style={{
                    backgroundColor: C.card,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: C.border,
                    overflow: 'hidden',
                }}>
                    {/* Status accent stripe */}
                    <View style={{ height: 3, backgroundColor: accentColor }} />

                    <View style={{ padding: 14 }}>
                        {/* Row 1: Supplier + Badge */}
                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                            <View style={{ flex: 1, paddingLeft: 10 }}>
                                <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 15, textAlign: 'right' }} numberOfLines={1}>
                                    {purchase.supplier?.name ?? 'مورد غير محدد'}
                                </Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 2, letterSpacing: 0.5 }}>
                                    REF# {refId}
                                </Text>
                            </View>
                            <Badge label={label} variant={variant} />
                        </View>

                        {/* Divider */}
                        <View style={{ height: 1, backgroundColor: C.border, marginBottom: 10 }} />

                        {/* Row 2: Date | Items | Amount */}
                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                            {/* Date */}
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="calendar-outline" size={12} color={C.mutedForeground} />
                                <Text style={{ color: C.mutedForeground, fontSize: 12 }}>{dateStr}</Text>
                            </View>

                            {/* Right side: items + amount */}
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 14 }}>
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
                                    <Ionicons name="cube-outline" size={12} color={C.mutedForeground} />
                                    <Text style={{ color: C.mutedForeground, fontSize: 12 }}>
                                        {purchase.items?.length ?? 0} صنف
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 3 }}>
                                    <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 16 }}>
                                        {(purchase.totalAmount ?? 0).toLocaleString()}
                                    </Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 11 }}>د.ع</Text>
                                </View>
                            </View>
                        </View>

                        {/* Receive action — pending only */}
                        {isPending && (
                            <TouchableOpacity
                                onPress={() => router.push(`/purchases/${purchase.id}/receive` as any)}
                                activeOpacity={0.8}
                                style={{
                                    marginTop: 12,
                                    backgroundColor: C.primary,
                                    borderRadius: 7,
                                    paddingVertical: 9,
                                    flexDirection: 'row-reverse',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                            >
                                <Ionicons name="checkmark-circle-outline" size={16} color="#FFFFFF" />
                                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>تأكيد الاستلام</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    }, [C, router]);

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {/* ── Fixed top area ── */}
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
                {/* Page header */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <View>
                        <Text style={{ color: C.foreground, fontSize: 20, fontWeight: '800', textAlign: 'right' }}>
                            سجل المشتريات
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 12, marginTop: 2, textAlign: 'right' }}>
                            {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </Text>
                    </View>
                    <View style={{ backgroundColor: C.primaryMuted, borderRadius: 8, padding: 10 }}>
                        <Ionicons name="receipt" size={22} color={C.primary} />
                    </View>
                </View>

                {/* Branch Selector — admin only */}
                {isAdmin && (
                    <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} />
                )}

                {/* Stats bar — only when data loaded and not on suggested tab */}
                {!loading && activeFilter !== 'SUGGESTED' && purchases.length > 0 && (
                    <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 14 }}>
                        {/* Total orders */}
                        <View style={{
                            flex: 1, backgroundColor: C.card, borderRadius: 8,
                            padding: 12, borderWidth: 1, borderColor: C.border,
                        }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 10, textAlign: 'right', marginBottom: 4 }}>
                                إجمالي الطلبات
                            </Text>
                            <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 20, textAlign: 'right' }}>
                                {purchases.length}
                            </Text>
                        </View>

                        {/* Pending — highlighted */}
                        <View style={{
                            flex: 1, backgroundColor: C.card, borderRadius: 8,
                            padding: 12, borderWidth: 1, borderColor: C.border,
                            borderTopWidth: 3, borderTopColor: C.warning,
                        }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 10, textAlign: 'right', marginBottom: 4 }}>
                                قيد الانتظار
                            </Text>
                            <Text style={{ color: C.warning, fontWeight: '800', fontSize: 20, textAlign: 'right' }}>
                                {pendingCount}
                            </Text>
                        </View>

                        {/* Total value */}
                        <View style={{
                            flex: 1.4, backgroundColor: C.card, borderRadius: 8,
                            padding: 12, borderWidth: 1, borderColor: C.border,
                            borderTopWidth: 3, borderTopColor: C.primary,
                        }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 10, textAlign: 'right', marginBottom: 4 }}>
                                إجمالي القيمة
                            </Text>
                            <Text style={{ color: C.primary, fontWeight: '800', fontSize: 14, textAlign: 'right' }} numberOfLines={1}>
                                {totalValue.toLocaleString()} <Text style={{ fontSize: 10, fontWeight: '500' }}>د.ع</Text>
                            </Text>
                        </View>
                    </View>
                )}

                {/* Status filter chips */}
                {!loading && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ flexDirection: 'row-reverse', gap: 8, paddingVertical: 4 }}
                        style={{ marginTop: 12 }}
                    >
                        {FILTERS.map(f => {
                            const isActive = activeFilter === f.key;
                            const statusInfo = f.key !== 'ALL' ? STATUS_MAP[f.key] : null;
                            const activeColor = statusInfo ? statusInfo.color(C) : C.primary;
                            return (
                                <TouchableOpacity
                                    key={f.key}
                                    onPress={() => setActiveFilter(f.key)}
                                    style={{
                                        paddingHorizontal: 14,
                                        paddingVertical: 6,
                                        borderRadius: 5,
                                        borderWidth: 1,
                                        borderColor: isActive ? activeColor : C.border,
                                        backgroundColor: isActive ? `${activeColor}18` : C.card,
                                    }}
                                >
                                    <Text style={{
                                        fontSize: 12,
                                        fontWeight: '600',
                                        color: isActive ? activeColor : C.mutedForeground,
                                    }}>
                                        {f.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                )}
            </View>

            {/* ── Content ── */}
            {loading && !refreshing ? (
                <View style={{ paddingHorizontal: 20, gap: 10 }}>
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} height={108} radius={10} />)}
                </View>
            ) : activeFilter === 'SUGGESTED' ? (
                <FlatList
                    data={lowStockItems}
                    keyExtractor={item => item.inventoryId}
                    renderItem={renderLowStockItem}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                    ListHeaderComponent={lowStockItems.length > 0 ? (
                        <View style={{
                            backgroundColor: `${C.warning}18`, borderRadius: 8, padding: 12,
                            marginBottom: 12, borderWidth: 1, borderColor: `${C.warning}40`,
                            flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
                        }}>
                            <Ionicons name="alert-circle" size={18} color={C.warning} />
                            <Text style={{ color: C.warning, fontWeight: '700', fontSize: 13, flex: 1, textAlign: 'right' }}>
                                {lowStockItems.length} صنف وصل للحد الأدنى ولا يوجد طلب شراء معلق
                            </Text>
                        </View>
                    ) : null}
                    ListEmptyComponent={
                        <EmptyState
                            icon="checkmark-circle-outline"
                            title="المخزون بمستويات جيدة"
                            subtitle="لا توجد أصناف وصلت للحد الأدنى"
                        />
                    }
                />
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={item => item.id}
                    renderItem={renderPurchase}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                    ListEmptyComponent={
                        activeFilter !== 'ALL' && purchases.length > 0 ? (
                            <View style={{ alignItems: 'center', paddingTop: 48 }}>
                                <Ionicons name="filter-outline" size={40} color={C.mutedForeground} />
                                <Text style={{ color: C.mutedForeground, fontSize: 14, marginTop: 12 }}>
                                    لا توجد طلبات بهذه الحالة
                                </Text>
                            </View>
                        ) : (
                            <EmptyState
                                icon="receipt-outline"
                                title="لا توجد مشتريات"
                                subtitle="لم يتم تسجيل أي طلبات شراء بعد"
                            />
                        )
                    }
                />
            )}
        </View>
    );
}
