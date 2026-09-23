import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Href, useFocusEffect } from 'expo-router';
import { apiService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Radius } from '../../constants/colors';
import { Skeleton } from '../../components/ui/Skeleton';
import { BranchSelector } from '../../components/BranchSelector';
import { useSyncStatus } from '../../context/SyncContext';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import {
    usePalette, toneColors, Surface, StatusBadge, AppButton, NavigationArrow, Tone,
} from '../../components/ui/Kit';
import { formatDate } from '../../utils/date';
import { formatNumber, CURRENCY } from '../../utils/format';
import { purchaseStatus } from '../../utils/status';

type TabKey = 'ALL' | 'PENDING' | 'RECEIVED' | 'CANCELLED';

const isReceived = (s: string) => s === 'RECEIVED' || s === 'COMPLETED';
const purchaseState = (purchase: any) => String(purchase?.status ?? '').toUpperCase();

export default function PurchasesScreen() {
    const router = useRouter();
    const C = usePalette();
    const { isAdmin, can, features, branchId: authBranchId } = useAuth();
    const { triggerSync } = useSyncStatus();

    const [purchases, setPurchases]           = useState<any[]>([]);
    const [loading, setLoading]               = useState(true);
    const [refreshing, setRefreshing]         = useState(false);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(isAdmin ? null : authBranchId);
    const [tab, setTab]                       = useState<TabKey>('ALL');
    const [search, setSearch]                 = useState('');
    const [cancellingId, setCancellingId]     = useState<string | null>(null);

    const fetchPurchases = useCallback(async () => {
        try {
            const purchasesData = await apiService.getPurchases(selectedBranch ?? undefined);
            setPurchases(Array.isArray(purchasesData) ? purchasesData : []);
        } catch (error) {
            console.error('PurchasesScreen: fetch error', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedBranch]);

    useFocusEffect(useCallback(() => { void fetchPurchases(); }, [fetchPurchases]));

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        triggerSync('purchases');
        fetchPurchases();
    }, [fetchPurchases, triggerSync]);

    const counts = useMemo(() => ({
        ALL: purchases.length,
        PENDING: purchases.filter(p => purchaseState(p) === 'PENDING').length,
        RECEIVED: purchases.filter(p => isReceived(purchaseState(p))).length,
        CANCELLED: purchases.filter(p => purchaseState(p) === 'CANCELLED').length,
    }), [purchases]);

    const filtered = useMemo(() => {
        let list = tab === 'ALL' ? purchases
            : tab === 'RECEIVED' ? purchases.filter(p => isReceived(purchaseState(p)))
            : purchases.filter(p => purchaseState(p) === tab);
        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter(p =>
                p.supplier?.name?.toLowerCase().includes(q) ||
                p.id?.toLowerCase().includes(q) ||
                p.items?.some((i: any) => (i.drug?.tradeName ?? '').toLowerCase().includes(q)));
        }
        return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [purchases, tab, search]);

    const handleCancel = useCallback((purchaseId: string) => {
        Alert.alert(
            'إلغاء طلب الشراء',
            'سيُلغى الطلب ولن يمكن استلامه. لا يمكن التراجع عن هذا الإجراء.',
            [
                { text: 'تراجع', style: 'cancel' },
                {
                    text: 'نعم، إلغاء الطلب',
                    style: 'destructive',
                    onPress: async () => {
                        setCancellingId(purchaseId);
                        try {
                            await apiService.cancelPurchase(purchaseId);
                            setPurchases(prev => prev.map(item => item.id === purchaseId ? { ...item, status: 'CANCELLED' } : item));
                        } catch {
                            Alert.alert('خطأ', 'فشل في إلغاء الطلب، يرجى المحاولة مرة أخرى');
                        } finally {
                            setCancellingId(null);
                        }
                    },
                },
            ],
        );
    }, []);

    const renderPurchase = useCallback(({ item: purchase }: { item: any }) => {
        const state = purchaseState(purchase);
        const status = purchaseStatus(state);
        const isPending = state === 'PENDING';
        const refId = purchase.documentNumber || "—";
        const dateStr = formatDate(purchase.createdAt, { weekday: 'long', day: 'numeric', month: 'long' });

        return (
            <Surface style={{ marginBottom: 12, gap: 10 }}>
                <TouchableOpacity
                    onPress={() => router.push(`/purchases/${purchase.id}` as Href)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 }}
                >
                    <NavigationArrow size={32} color={C.mutedForeground} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '900', textAlign: 'right' }}>طلب #{refId}</Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>
                            {purchase.supplier?.name ?? 'مورد غير محدد'} · {status.label}
                        </Text>
                    </View>
                    <View style={{ alignItems: 'flex-start', gap: 8 }}>
                        <StatusBadge label={status.label} tone={status.tone} />
                        <Text style={{ color: C.mutedForeground, fontSize: 12.5 }}>{dateStr}</Text>
                        <Text style={{ color: C.primary, fontSize: 18, fontWeight: '900' }}>
                            {formatNumber(purchase.total ?? purchase.totalAmount ?? 0)} <Text style={{ fontSize: 12, color: C.mutedForeground }}>{CURRENCY}</Text>
                        </Text>
                    </View>
                </TouchableOpacity>

                {purchase.warehouseOrderId&&<AppButton label="متابعة طلب المذخر" compact variant="outline" onPress={()=>router.push({pathname:'/warehouse-orders' as any,params:{orderId:purchase.warehouseOrderId}})}/>}
                {isPending && !purchase.warehouseOrderId && (
                    <View style={{ flexDirection: 'row-reverse', gap: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 }}>
                        <AppButton
                            label="تفاصيل الطلب"
                            icon="document-text-outline"
                            variant="outline"
                            compact
                            style={{ flex: 1 }}
                            onPress={() => router.push(`/purchases/${purchase.id}` as Href)}
                        />
                        <AppButton
                            permission="canReceivePurchase" label="استلام المواد"
                            icon="cube-outline"
                            variant="soft"
                            compact
                            style={{ flex: 1 }}
                            onPress={() => router.push(`/purchases/${purchase.id}/receive` as Href)}
                        />
                        <AppButton
                            permission="canCreatePurchase" label="إلغاء الطلب"
                            icon="close-circle-outline"
                            variant="dangerOutline"
                            compact
                            loading={cancellingId === purchase.id}
                            style={{ flex: 1 }}
                            onPress={() => handleCancel(purchase.id)}
                        />
                    </View>
                )}
            </Surface>
        );
    }, [C, router, cancellingId, handleCancel]);

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <ScreenHeader
                title="المشتريات"
                hideBack
                action={can('canCreatePurchase') &&
                    <TouchableOpacity
                        onPress={() => router.push('/(tabs)/smart-orders' as Href)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="طلب جديد"
                        style={{
                            flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
                            backgroundColor: C.primaryMuted, borderRadius: Radius.control,
                            paddingHorizontal: 14, height: 42,
                        }}
                    >
                        <Ionicons name="add" size={21} color={C.primary} />
                        <Text style={{ color: C.primary, fontSize: 14.5, fontWeight: '800' }}>طلب جديد</Text>
                    </TouchableOpacity>
                }
            />

            <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 10 }}>
                {features.warehouseManagement&&can('canViewWarehouseOrders')&&<AppButton label="طلبات المذاخر والعروض" compact variant="outline" onPress={()=>router.push('/warehouse-orders' as any)}/>}
                {isAdmin && <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} hideIfSingle />}

                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: Radius.control, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 }}>
                    <Ionicons name="search-outline" size={20} color={C.mutedForeground} />
                    <TextInput
                        style={{ flex: 1, color: C.foreground, paddingVertical: 12, textAlign: 'right', fontSize: 15 }}
                        placeholder="ابحث في الطلبات"
                        placeholderTextColor={C.mutedForeground}
                        value={search}
                        onChangeText={setSearch}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="مسح البحث">
                            <Ionicons name="close-circle" size={18} color={C.mutedForeground} />
                        </TouchableOpacity>
                    )}
                </View>

                <StatusFilter
                    items={[
                        { key: 'ALL', label: 'الكل', count: counts.ALL, tone: 'primary' },
                        { key: 'RECEIVED', label: 'مكتمل', count: counts.RECEIVED, tone: 'success' },
                        { key: 'PENDING', label: 'قيد الانتظار', count: counts.PENDING, tone: 'warning' },
                        ...(counts.CANCELLED > 0 || tab === 'CANCELLED'
                            ? [{ key: 'CANCELLED' as const, label: 'ملغى', count: counts.CANCELLED, tone: 'danger' as const }]
                            : []),
                    ]}
                    value={tab}
                    onChange={setTab}
                />
            </View>

            {loading && !refreshing ? (
                <View style={{ paddingHorizontal: 16, gap: 10 }}>
                    {[1, 2, 3].map(i => <Skeleton key={i} height={130} radius={Radius.card} />)}
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={item => item.id}
                    renderItem={renderPurchase}
                    contentContainerStyle={{
                        flexGrow: filtered.length === 0 ? 1 : 0,
                        paddingHorizontal: 16, paddingTop: 6, paddingBottom: 96,
                    }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                    ListEmptyComponent={<PurchaseEmptyState search={search} tab={tab} />}
                />
            )}

        </View>
    );
}

function PurchaseEmptyState({ search, tab }: { search: string; tab: TabKey }) {
    const C = usePalette();
    const hasSearch = search.trim().length > 0;
    const copy = hasSearch
        ? { icon: 'search-outline' as const, title: 'لا توجد نتائج مطابقة', subtitle: `لم نعثر على طلب يطابق «${search.trim()}»` }
        : tab === 'PENDING'
            ? { icon: 'time-outline' as const, title: 'لا توجد طلبات قيد الانتظار', subtitle: 'ستظهر هنا الطلبات الجديدة التي تنتظر الاستلام.' }
            : tab === 'RECEIVED'
                ? { icon: 'checkmark-done-outline' as const, title: 'لا توجد طلبات مكتملة', subtitle: 'ستظهر هنا الطلبات التي تم استلامها وتسجيلها.' }
                : tab === 'CANCELLED'
                    ? { icon: 'close-circle-outline' as const, title: 'لا توجد طلبات ملغاة', subtitle: 'لا توجد طلبات أُلغيت في الفرع المحدد.' }
                    : { icon: 'cart-outline' as const, title: 'لا توجد مشتريات بعد', subtitle: 'ابدأ بإنشاء طلب جديد لمتابعة التوريد والاستلام.' };

    return (
        <View style={{ flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 42 }}>
            <View style={{
                width: 82, height: 82, borderRadius: 41,
                backgroundColor: C.primaryMuted, borderWidth: 1, borderColor: C.border,
                alignItems: 'center', justifyContent: 'center',
            }}>
                <Ionicons name={copy.icon} size={38} color={C.primary} />
            </View>
            <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900', textAlign: 'center', marginTop: 18 }}>
                {copy.title}
            </Text>
            <Text style={{ color: C.mutedForeground, fontSize: 13.5, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 310 }}>
                {copy.subtitle}
            </Text>
        </View>
    );
}

/**
 * Status filter: compact horizontal tiles matching the purchases design. The
 * count is a soft circular badge beside the Arabic label; cancelled is shown
 * only when there are cancelled orders so the default layout stays focused.
 */
function StatusFilter({ items, value, onChange }: {
    items: { key: TabKey; label: string; count: number; tone: Tone }[];
    value: TabKey;
    onChange: (key: TabKey) => void;
}) {
    const C = usePalette();
    return (
        <View style={{
            backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border,
            overflow: 'hidden',
        }}>
            <View style={{ flexDirection: 'row-reverse' }}>
            {items.map(it => {
                const active = it.key === value;
                const { fg, bg } = toneColors(C, it.tone);
                return (
                    <TouchableOpacity
                        key={it.key}
                        onPress={() => onChange(it.key)}
                        activeOpacity={0.8}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${it.label}: ${it.count}`}
                        style={{
                            flex: 1, minWidth: 0, minHeight: 58,
                            alignItems: 'center', justifyContent: 'center', gap: 3,
                            paddingVertical: 5, paddingHorizontal: 2,
                            borderBottomWidth: active ? 3 : 0,
                            borderBottomColor: active ? C.primary : 'transparent',
                        }}
                    >
                        <Text
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.65}
                            style={{ width: '100%', textAlign: 'center', color: active ? C.primary : C.foreground, fontSize: 11.5, fontWeight: active ? '800' : '600' }}
                        >{it.label}</Text>
                        <View style={{
                            minWidth: 25, height: 25, borderRadius: 12.5,
                            paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: active ? bg : C.input,
                        }}>
                            <Text style={{ color: active ? fg : C.mutedForeground, fontSize: 11.5, fontWeight: '900', fontVariant: ['tabular-nums'] }}>
                                {formatNumber(it.count)}
                            </Text>
                        </View>
                    </TouchableOpacity>
                );
            })}
            </View>
        </View>
    );
}
