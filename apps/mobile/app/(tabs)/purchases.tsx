import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View, Text, FlatList, RefreshControl, TouchableOpacity,
    TextInput, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { managerPalette, Radius } from '../../constants/colors';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { BranchSelector } from '../../components/BranchSelector';
import { useSyncStatus } from '../../context/SyncContext';
import { formatDate } from '../../utils/date';

type BadgeVariantType = 'success' | 'warning' | 'danger' | 'info' | 'default';
type StatusKey = 'COMPLETED' | 'PENDING' | 'CANCELLED' | 'RECEIVED';
type FilterKey = StatusKey | 'ALL' | 'SUGGESTED';

const STATUS_MAP: Record<string, {
    label: string; variant: BadgeVariantType;
    color: (C: ReturnType<typeof managerPalette>) => string;
    bg:    (C: ReturnType<typeof managerPalette>) => string;
}> = {
    COMPLETED: { label: 'مكتمل',        variant: 'success', color: C => C.success, bg: C => C.successBg },
    PENDING:   { label: 'قيد الانتظار', variant: 'warning', color: C => C.warning, bg: C => C.warningBg },
    CANCELLED: { label: 'ملغى',          variant: 'danger',  color: C => C.danger,  bg: C => C.dangerBg  },
    RECEIVED:  { label: 'تم الاستلام',  variant: 'info',    color: C => C.primary, bg: C => C.primaryMuted },
};

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'SUGGESTED', label: 'مقترح للطلب' },
    { key: 'ALL',       label: 'الكل' },
    { key: 'PENDING',   label: 'قيد الانتظار' },
    { key: 'RECEIVED',  label: 'تم الاستلام' },
    { key: 'COMPLETED', label: 'مكتمل' },
    { key: 'CANCELLED', label: 'ملغى' },
];

function getStatus(status: string) {
    return STATUS_MAP[status] ?? {
        label: status, variant: 'default' as BadgeVariantType,
        color: (C: ReturnType<typeof managerPalette>) => C.mutedForeground,
        bg:    (C: ReturnType<typeof managerPalette>) => C.border,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PurchasesScreen() {
    const router = useRouter();
    const { isDarkMode } = useTheme();
    const { isAdmin, branchId: authBranchId } = useAuth();
    const { triggerSync } = useSyncStatus();
    const C = managerPalette(isDarkMode);

    // Outlined card matching the manager identity — light surface, soft tinted border.
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

    const [purchases, setPurchases]       = useState<any[]>([]);
    const [lowStockItems, setLowStockItems] = useState<any[]>([]);
    const [loading, setLoading]           = useState(true);
    const [refreshing, setRefreshing]     = useState(false);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);
    const [activeFilter, setActiveFilter] = useState<FilterKey>('SUGGESTED');
    const [search, setSearch]             = useState('');
    const [sortDesc, setSortDesc]         = useState(true);
    const [deletingId, setDeletingId]     = useState<string | null>(null);

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

    useEffect(() => { setLoading(true); fetchPurchases(); }, [fetchPurchases]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        triggerSync('purchases');
        fetchPurchases();
    }, [fetchPurchases, triggerSync]);

    // ── Derived data ──────────────────────────────────────────────────────────
    const statusCounts = useMemo(() => {
        const c: Record<string, number> = { ALL: purchases.length, SUGGESTED: lowStockItems.length };
        purchases.forEach(p => { c[p.status] = (c[p.status] ?? 0) + 1; });
        return c;
    }, [purchases, lowStockItems]);

    const filtered = useMemo(() => {
        if (activeFilter === 'SUGGESTED') return [];
        let list = activeFilter === 'ALL' ? purchases : purchases.filter(p => p.status === activeFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p =>
                p.supplier?.name?.toLowerCase().includes(q) ||
                p.id?.toLowerCase().includes(q)
            );
        }
        return [...list].sort((a, b) => {
            const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            return sortDesc ? diff : -diff;
        });
    }, [purchases, activeFilter, search, sortDesc]);

    const filteredTotalValue = useMemo(() =>
        filtered.reduce((s, p) => s + (p.totalAmount ?? 0), 0),
    [filtered]);

    const pendingCount = useMemo(() => purchases.filter(p => p.status === 'PENDING').length, [purchases]);
    const totalValue   = useMemo(() => purchases.reduce((s, p) => s + (p.totalAmount ?? 0), 0), [purchases]);

    const handleDelete = useCallback((purchase: any) => {
        Alert.alert(
            'حذف الطلب',
            `هل أنت متأكد من حذف الطلب REF# ${purchase.id.slice(0, 8).toUpperCase()} نهائياً؟`,
            [
                { text: 'تراجع', style: 'cancel' },
                {
                    text: 'حذف نهائياً',
                    style: 'destructive',
                    onPress: async () => {
                        setDeletingId(purchase.id);
                        try {
                            await apiService.deletePurchase(purchase.id);
                            setPurchases(prev => prev.filter(p => p.id !== purchase.id));
                        } catch {
                            Alert.alert('خطأ', 'فشل في حذف الطلب، يرجى المحاولة مرة أخرى');
                        } finally {
                            setDeletingId(null);
                        }
                    },
                },
            ],
        );
    }, []);

    // ── Low stock card ────────────────────────────────────────────────────────
    const renderLowStockItem = useCallback(({ item }: { item: any }) => {
        const isOut     = item.currentStock === 0;
        const color     = isOut ? C.danger : C.warning;
        const bg        = isOut ? C.dangerBg : C.warningBg;
        const maxVisual = Math.max(item.minStock * 2, item.currentStock, 1);
        const progress  = Math.min(item.currentStock / maxVisual, 1);

        return (
            <View style={{ ...card(color), padding: 14, marginBottom: 10 }}>
                {/* Row 1: name + branch + status pill */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <View style={{ flex: 1, paddingLeft: 8 }}>
                        <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15, textAlign: 'right' }} numberOfLines={1}>
                            {item.drugName}
                        </Text>
                        {item.branchName && (
                            <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                                {item.branchName}
                            </Text>
                        )}
                    </View>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: bg, borderRadius: Radius.xs, paddingHorizontal: 9, paddingVertical: 5, flexShrink: 0 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
                        <Text style={{ color, fontSize: 11, fontWeight: '800' }}>
                            {isOut ? 'نفاد تام' : 'نقص مخزون'}
                        </Text>
                    </View>
                </View>

                {/* Progress bar */}
                <View style={{ height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                    <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
                </View>

                {/* Stats panel: stock / min / suggested */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.background, borderRadius: Radius.xs, borderWidth: 1, borderColor: C.border, paddingVertical: 10 }}>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 10, marginBottom: 2 }}>المخزون</Text>
                        <Text style={{ color, fontWeight: '900', fontSize: 19 }}>{item.currentStock}</Text>
                    </View>
                    <View style={{ width: 1, height: 28, backgroundColor: C.border }} />
                    <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 10, marginBottom: 2 }}>الحد الأدنى</Text>
                        <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 19 }}>{item.minStock}</Text>
                    </View>
                    <View style={{ width: 1, height: 28, backgroundColor: C.border }} />
                    <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 10, marginBottom: 2 }}>المقترح</Text>
                        <Text style={{ color: C.primary, fontWeight: '900', fontSize: 19 }}>{item.suggestedQty}</Text>
                    </View>
                </View>
            </View>
        );
    }, [C]);

    // ── Purchase card ─────────────────────────────────────────────────────────
    const renderPurchase = useCallback(({ item: purchase }: { item: any }) => {
        const { label, color, bg } = getStatus(purchase.status);
        const accentColor  = color(C);
        const accentBg     = bg(C);
        const isPending    = purchase.status === 'PENDING';
        const isDeletable  = purchase.status === 'PENDING' || purchase.status === 'CANCELLED';
        const isDeleting   = deletingId === purchase.id;
        const dateStr      = formatDate(purchase.createdAt, { day: 'numeric', month: 'short', year: 'numeric' });
        const refId        = purchase.id.slice(0, 8).toUpperCase();

        return (
            <TouchableOpacity
                onPress={() => router.push(`/purchases/${purchase.id}` as any)}
                activeOpacity={0.85}
                style={{ ...card(accentColor), padding: 14, marginBottom: 10 }}
            >
                {/* Row 1: supplier avatar + name + status pill */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <View style={{
                        width: 40, height: 40, borderRadius: Radius.xs,
                        backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <Ionicons name="business" size={19} color={C.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15, textAlign: 'right' }} numberOfLines={1}>
                            {purchase.supplier?.name ?? 'مورد غير محدد'}
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 2, letterSpacing: 0.4 }}>
                            REF# {refId}
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: accentBg, borderRadius: Radius.xs, paddingHorizontal: 9, paddingVertical: 5, flexShrink: 0 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accentColor }} />
                        <Text style={{ color: accentColor, fontSize: 11, fontWeight: '800' }}>{label}</Text>
                    </View>
                </View>

                {/* Row 2: meta chips + amount */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: C.background, borderRadius: Radius.xs, borderWidth: 1, borderColor: C.border, paddingHorizontal: 8, paddingVertical: 4 }}>
                            <Ionicons name="calendar-outline" size={12} color={C.mutedForeground} />
                            <Text style={{ color: C.mutedForeground, fontSize: 11.5 }}>{dateStr}</Text>
                        </View>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: C.background, borderRadius: Radius.xs, borderWidth: 1, borderColor: C.border, paddingHorizontal: 8, paddingVertical: 4 }}>
                            <Ionicons name="cube-outline" size={12} color={C.mutedForeground} />
                            <Text style={{ color: C.mutedForeground, fontSize: 11.5 }}>{purchase.items?.length ?? 0} صنف</Text>
                        </View>
                    </View>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 3 }}>
                        <Text style={{ color: C.foreground, fontWeight: '900', fontSize: 17 }}>
                            {(purchase.totalAmount ?? 0).toLocaleString('en-US')}
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 11, fontWeight: '700' }}>د.ع</Text>
                    </View>
                </View>

                {/* Bottom actions row */}
                {(isPending || isDeletable) && (
                    <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 12 }}>
                        {isPending && (
                            <TouchableOpacity
                                onPress={() => router.push(`/purchases/${purchase.id}/receive` as any)}
                                activeOpacity={0.85}
                                style={{
                                    flex: 1, backgroundColor: C.primary, borderRadius: Radius.xs,
                                    paddingVertical: 10,
                                    flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 6,
                                }}
                            >
                                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>تأكيد الاستلام</Text>
                            </TouchableOpacity>
                        )}
                        {isDeletable && (
                            <TouchableOpacity
                                onPress={() => handleDelete(purchase)}
                                disabled={isDeleting}
                                activeOpacity={0.8}
                                style={{
                                    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5,
                                    backgroundColor: C.dangerBg, borderRadius: Radius.xs,
                                    paddingVertical: 10, paddingHorizontal: 14,
                                    borderWidth: 1, borderColor: `${C.danger}40`,
                                    opacity: isDeleting ? 0.6 : 1,
                                }}
                            >
                                {isDeleting
                                    ? <ActivityIndicator size="small" color={C.danger} />
                                    : <Ionicons name="trash-outline" size={15} color={C.danger} />
                                }
                                <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>
                                    {isDeleting ? 'حذف...' : 'حذف'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </TouchableOpacity>
        );
    }, [C, router, deletingId, handleDelete]);

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>

            {/* ── Header ─────────────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, backgroundColor: C.background }}>

                {/* Title row */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <View>
                        <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '900', textAlign: 'right' }}>
                            المشتريات
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 12, marginTop: 2, textAlign: 'right' }}>
                            {formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
                        </Text>
                    </View>
                    <View style={{ backgroundColor: C.primaryMuted, borderRadius: 5, padding: 10 }}>
                        <Ionicons name="receipt" size={22} color={C.primary} />
                    </View>
                </View>

                {/* Branch selector */}
                {isAdmin && (
                    <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} hideIfSingle />
                )}

                {/* ── Stats row — visible outside SUGGESTED ───────────────── */}
                {!loading && activeFilter !== 'SUGGESTED' && purchases.length > 0 && (
                    <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 12 }}>
                        <View style={{ ...card(C.primary), flex: 1, paddingVertical: 10, paddingHorizontal: 11 }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 10, textAlign: 'right', marginBottom: 3 }}>إجمالي الطلبات</Text>
                            <Text style={{ color: C.foreground, fontWeight: '900', fontSize: 20, textAlign: 'right' }}>{purchases.length}</Text>
                        </View>
                        <View style={{ ...card(C.warning), flex: 1, paddingVertical: 10, paddingHorizontal: 11 }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 10, textAlign: 'right', marginBottom: 3 }}>قيد الانتظار</Text>
                            <Text style={{ color: C.warning, fontWeight: '900', fontSize: 20, textAlign: 'right' }}>{pendingCount}</Text>
                        </View>
                        <View style={{ ...card(C.success), flex: 1.5, paddingVertical: 10, paddingHorizontal: 11 }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 10, textAlign: 'right', marginBottom: 3 }}>
                                {search || activeFilter !== 'ALL' ? 'قيمة النتائج' : 'إجمالي القيمة'}
                            </Text>
                            <Text style={{ color: C.success, fontWeight: '900', fontSize: 14, textAlign: 'right' }} numberOfLines={1}>
                                {(search || activeFilter !== 'ALL' ? filteredTotalValue : totalValue).toLocaleString('en-US')}
                                <Text style={{ fontSize: 10, fontWeight: '500' }}> د.ع</Text>
                            </Text>
                        </View>
                    </View>
                )}

                {/* ── Search bar (hidden for SUGGESTED) ───────────────────── */}
                {activeFilter !== 'SUGGESTED' && (
                    <View style={{
                        flexDirection: 'row-reverse', alignItems: 'center',
                        backgroundColor: C.input, borderRadius: 5,
                        borderWidth: 1, borderColor: C.border,
                        paddingHorizontal: 12, marginBottom: 10, gap: 8,
                    }}>
                        <Ionicons name="search" size={16} color={C.mutedForeground} />
                        <TextInput
                            style={{ flex: 1, color: C.foreground, paddingVertical: 10, textAlign: 'right', fontSize: 13 }}
                            placeholder="ابحث باسم المورد أو رقم الطلب..."
                            placeholderTextColor={C.mutedForeground}
                            value={search}
                            onChangeText={setSearch}
                        />
                        {search.length > 0 && (
                            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Ionicons name="close-circle" size={16} color={C.mutedForeground} />
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* ── Filter chips ─────────────────────────────────────────── */}
                {!loading && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ flexDirection: 'row-reverse', gap: 7, paddingVertical: 2 }}
                        style={{ marginBottom: 8 }}
                    >
                        {FILTERS.map(f => {
                            const isActive   = activeFilter === f.key;
                            const statusInfo = STATUS_MAP[f.key];
                            const chipColor  = statusInfo ? statusInfo.color(C) : f.key === 'SUGGESTED' ? C.warning : C.primary;
                            const chipBg     = statusInfo ? statusInfo.bg(C)    : f.key === 'SUGGESTED' ? C.warningBg : C.primaryMuted;
                            const count      = statusCounts[f.key] ?? 0;

                            return (
                                <TouchableOpacity
                                    key={f.key}
                                    onPress={() => { setActiveFilter(f.key); setSearch(''); }}
                                    activeOpacity={0.8}
                                    style={{
                                        flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
                                        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 5,
                                        borderWidth: 1.5,
                                        borderColor: isActive ? chipColor : C.border,
                                        backgroundColor: isActive ? chipBg : C.card,
                                    }}
                                >
                                    <Text style={{
                                        fontSize: 12, fontWeight: '700',
                                        color: isActive ? chipColor : C.mutedForeground,
                                    }}>
                                        {f.label}
                                    </Text>
                                    {count > 0 && (
                                        <View style={{
                                            backgroundColor: isActive ? `${chipColor}22` : C.border,
                                            borderRadius: 8, minWidth: 18,
                                            paddingHorizontal: 4, paddingVertical: 1, alignItems: 'center',
                                        }}>
                                            <Text style={{
                                                fontSize: 10, fontWeight: '800',
                                                color: isActive ? chipColor : C.mutedForeground,
                                            }}>
                                                {count}
                                            </Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                )}

                {/* ── Sort control (hidden for SUGGESTED) ─────────────────── */}
                {activeFilter !== 'SUGGESTED' && !loading && filtered.length > 1 && (
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <TouchableOpacity
                            onPress={() => setSortDesc(v => !v)}
                            activeOpacity={0.75}
                            style={{
                                flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
                                backgroundColor: C.card, borderRadius: 5,
                                paddingHorizontal: 10, paddingVertical: 5,
                                borderWidth: 1, borderColor: C.border,
                            }}
                        >
                            <Ionicons
                                name={sortDesc ? 'arrow-down' : 'arrow-up'}
                                size={12} color={C.primary}
                            />
                            <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>
                                {sortDesc ? 'الأحدث أولاً' : 'الأقدم أولاً'}
                            </Text>
                        </TouchableOpacity>
                        <Text style={{ color: C.mutedForeground, fontSize: 12 }}>
                            {filtered.length} طلب
                        </Text>
                    </View>
                )}
            </View>

            {/* ── Content ────────────────────────────────────────────────── */}
            {loading && !refreshing ? (
                <View style={{ paddingHorizontal: 16, gap: 10 }}>
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} height={115} radius={5} />)}
                </View>

            ) : activeFilter === 'SUGGESTED' ? (
                <FlatList
                    data={lowStockItems}
                    keyExtractor={item => item.inventoryId ?? item.id}
                    renderItem={renderLowStockItem}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 110 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                    ListHeaderComponent={lowStockItems.length > 0 ? (
                        <View style={{
                            ...card(C.warning), padding: 12, marginBottom: 12,
                            flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                        }}>
                            <View style={{ width: 32, height: 32, borderRadius: Radius.xs, backgroundColor: C.warningBg, alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="alert" size={16} color={C.warning} />
                            </View>
                            <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 13, flex: 1, textAlign: 'right' }}>
                                {lowStockItems.length} صنف وصل للحد الأدنى بدون طلب شراء معلق
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
                    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 110 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                    ListEmptyComponent={
                        search ? (
                            <View style={{ alignItems: 'center', paddingTop: 48, gap: 8 }}>
                                <Ionicons name="search-outline" size={40} color={C.mutedForeground} />
                                <Text style={{ color: C.mutedForeground, fontSize: 14, textAlign: 'center' }}>
                                    لا توجد نتائج لـ "{search}"
                                </Text>
                            </View>
                        ) : activeFilter !== 'ALL' && purchases.length > 0 ? (
                            <View style={{ alignItems: 'center', paddingTop: 48, gap: 8 }}>
                                <Ionicons name="filter-outline" size={40} color={C.mutedForeground} />
                                <Text style={{ color: C.mutedForeground, fontSize: 14 }}>
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
