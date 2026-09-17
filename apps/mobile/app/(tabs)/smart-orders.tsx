import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
    View, Text, FlatList, RefreshControl,
    TouchableOpacity, Alert, Modal, ScrollView, TextInput,
    KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { managerPalette, Radius } from '../../constants/colors';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { usePalette, useReduceMotion, Surface, IconTile, StatusBadge, StatCell, VDivider, SegmentedTabs, AppButton } from '../../components/ui/Kit';
import { formatNumber } from '../../utils/format';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { BranchSelector } from '../../components/BranchSelector';

interface SmartOrderItem {
    id: string;
    drugId: string;
    branchId: string;
    drug?: { tradeName?: string; scientificName?: string };
    currentQuantity: number;
    suggestedReorderQuantity: number;
    daysUntilStockout?: number;
    branch?: { name?: string };
}

interface CreateOrderItem {
    drugId: string;
    drugName: string;
    quantity: number;
    cost: number;
    isCritical: boolean;
    currentQuantity: number;
}

interface CreatedOrderSummary {
    supplierName: string;
    itemCount: number;
    criticalCount: number;
    totalUnits: number;
    branchName: string | null;
}

type FilterKey = 'all' | 'critical' | 'low';

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',      label: 'الكل' },
    { key: 'critical', label: 'عاجل' },
    { key: 'low',      label: 'متابعة' },
];

function getUrgency(item: SmartOrderItem): 'critical' | 'low' {
    if (item.currentQuantity === 0) return 'critical';
    if (item.daysUntilStockout !== undefined && item.daysUntilStockout <= 3) return 'critical';
    return 'low';
}

export default function SmartOrdersScreen() {
    const { isDarkMode } = useTheme();
    const { isAdmin, branchId: authBranchId } = useAuth();
    const C = managerPalette(isDarkMode);

    // ── Main list state ───────────────────────────────────────────────────────
    const [items, setItems]             = useState<SmartOrderItem[]>([]);
    const [loading, setLoading]         = useState(true);
    const [refreshing, setRefreshing]   = useState(false);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);
    const [filterKey, setFilterKey]     = useState<FilterKey>('all');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // ── Create-order modal state ──────────────────────────────────────────────
    const [createModal, setCreateModal] = useState<{
        items: CreateOrderItem[];
        branchId: string;
    } | null>(null);
    const [suppliers, setSuppliers]         = useState<Array<{ id: string; name: string; phone?: string }>>([]);
    const [supplierId, setSupplierId]       = useState('');
    const [supplierName, setSupplierName]   = useState('');
    const [supplierSearch, setSupplierSearch] = useState('');
    const [showSupplierPicker, setShowSupplierPicker] = useState(false);
    const [loadingSuppliers, setLoadingSuppliers]     = useState(false);
    const [submitting, setSubmitting]       = useState(false);
    const [receiveBranchName, setReceiveBranchName] = useState<string | null>(null);
    const [createdOrder, setCreatedOrder] = useState<CreatedOrderSummary | null>(null);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        try {
            const data = await apiService.getSmartOrders(selectedBranch ?? undefined);
            setItems(Array.isArray(data) ? data : []);
            setSelectedIds(new Set());
        } catch (error) {
            console.error('SmartOrdersScreen: fetch error', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedBranch]);

    useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

    const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

    // ── Derived data ──────────────────────────────────────────────────────────
    const criticalCount = useMemo(() => items.filter(i => getUrgency(i) === 'critical').length, [items]);
    const lowCount      = useMemo(() => items.filter(i => getUrgency(i) === 'low').length, [items]);

    const filtered = useMemo(() => {
        const list = filterKey === 'critical' ? items.filter(i => getUrgency(i) === 'critical')
                   : filterKey === 'low'      ? items.filter(i => getUrgency(i) === 'low')
                   : items;
        return [...list].sort((a, b) => {
            const ua = getUrgency(a) === 'critical' ? 0 : 1;
            const ub = getUrgency(b) === 'critical' ? 0 : 1;
            if (ua !== ub) return ua - ub;
            return (a.daysUntilStockout ?? 999) - (b.daysUntilStockout ?? 999);
        });
    }, [items, filterKey]);

    const filteredSuppliers = useMemo(() =>
        suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase())),
    [suppliers, supplierSearch]);

    // ── Selection helpers ─────────────────────────────────────────────────────
    const toggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    // Selection is kept across the الكل / عاجل / متابعة tabs; «تحديد الكل»
    // only adds or removes the items of the tab being shown.
    const allFilteredSelected = filtered.length > 0 && filtered.every(i => selectedIds.has(i.id));

    const toggleSelectAll = useCallback(() => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (filtered.length > 0 && filtered.every(i => prev.has(i.id))) filtered.forEach(i => next.delete(i.id));
            else filtered.forEach(i => next.add(i.id));
            return next;
        });
    }, [filtered]);

    // Selected items from every tab, urgent first (same order as the list).
    const selectedItems = useMemo(() => items
        .filter(i => selectedIds.has(i.id))
        .sort((a, b) => {
            const ua = getUrgency(a) === 'critical' ? 0 : 1;
            const ub = getUrgency(b) === 'critical' ? 0 : 1;
            if (ua !== ub) return ua - ub;
            return (a.daysUntilStockout ?? 999) - (b.daysUntilStockout ?? 999);
        }), [items, selectedIds]);
    const selectedCritical = selectedItems.filter(i => getUrgency(i) === 'critical').length;

    // ── Create order helpers ──────────────────────────────────────────────────
    const openCreateModal = useCallback((item?: SmartOrderItem) => {
        const targets = item ? [item] : selectedItems;
        if (targets.length === 0) return;
        // One purchase order receives into ONE branch — never guess across branches.
        const branchIds = Array.from(new Set(targets.map(t => t.branchId).filter(Boolean)));
        if (!selectedBranch && branchIds.length > 1) {
            Alert.alert('اختر فرع الاستلام', 'الأصناف المحددة تتبع أكثر من فرع. اختر فرعاً واحداً من قائمة الفروع ثم أنشئ الطلب.');
            return;
        }
        const branchId = selectedBranch ?? branchIds[0] ?? authBranchId ?? '';
        setReceiveBranchName(targets.find(t => t.branchId === branchId)?.branch?.name ?? null);
        setCreateModal({
            items: targets.map(t => ({
                drugId:          t.drugId,
                drugName:        t.drug?.tradeName ?? 'دواء غير محدد',
                quantity:        t.suggestedReorderQuantity,
                cost:            0,
                isCritical:      getUrgency(t) === 'critical',
                currentQuantity: t.currentQuantity,
            })),
            branchId,
        });
        setSupplierId('');
        setSupplierName('');
        setSupplierSearch('');
        setShowSupplierPicker(false);
        setLoadingSuppliers(true);
        apiService.getSuppliers()
            .then(setSuppliers)
            .catch(() => {})
            .finally(() => setLoadingSuppliers(false));
    }, [selectedItems, selectedBranch, authBranchId]);

    const updateCreateItem = useCallback((idx: number, field: 'quantity' | 'cost', value: string) => {
        setCreateModal(prev => {
            if (!prev) return prev;
            const next = [...prev.items];
            next[idx] = { ...next[idx], [field]: parseFloat(value) || 0 };
            return { ...prev, items: next };
        });
    }, []);

    const handleSubmitOrder = useCallback(async () => {
        if (!createModal || !supplierId) return;
        if (createModal.items.some(i => i.quantity <= 0)) {
            Alert.alert('خطأ', 'يجب أن تكون الكمية أكبر من صفر لجميع الأصناف');
            return;
        }
        setSubmitting(true);
        try {
            await apiService.createPurchase({
                branchId: createModal.branchId,
                supplierId,
                items: createModal.items.map(i => ({
                    drugId:   i.drugId,
                    quantity: i.quantity,
                    cost:     i.cost,
                })),
            });
            setCreatedOrder({
                supplierName,
                itemCount: createModal.items.length,
                criticalCount: createModal.items.filter(i => i.isCritical).length,
                totalUnits: createModal.items.reduce((s, i) => s + i.quantity, 0),
                branchName: receiveBranchName,
            });
            setCreateModal(null);
            setSelectedIds(new Set());
        } catch {
            Alert.alert('خطأ', 'فشل في إنشاء طلب الشراء، يرجى المحاولة مرة أخرى');
        } finally {
            setSubmitting(false);
        }
    }, [createModal, supplierId, supplierName, receiveBranchName]);

    // ── Item card (design smart-orders.png) ──────────────────────────────────
    const renderItem = ({ item }: { item: SmartOrderItem }) => {
        const isCritical = getUrgency(item) === 'critical';
        const isSelected = selectedIds.has(item.id);
        const tone = isCritical ? 'danger' : 'warning';
        const accent = isCritical ? C.danger : C.warning;
        const days = item.daysUntilStockout;
        // The reason comes from the service's own stock/days figures — no new forecast.
        const reason = item.currentQuantity === 0
            ? 'نفد المخزون'
            : days !== undefined
                ? (days === 0 ? 'قد ينفد اليوم حسب معدل البيع' : `قد ينفد خلال ${days} يوم حسب معدل البيع`)
                : 'المخزون عند حد الطلب أو أقل';

        return (
            <View style={{ backgroundColor: C.card, borderRadius: Radius.card, borderWidth: isSelected ? 1.5 : 1, borderColor: isSelected ? C.primary : C.border, marginBottom: 12, overflow: 'hidden' }}>
                {/* Reason */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: isCritical ? C.dangerBg : C.warningBg, paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Ionicons name="alert-circle-outline" size={20} color={accent} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: accent, fontSize: 14, fontWeight: '800', textAlign: 'right' }}>{isCritical ? 'صنف يحتاج طلباً عاجلاً' : 'صنف يحتاج طلباً'}</Text>
                        <Text style={{ color: C.foreground, fontSize: 12.5, textAlign: 'right', marginTop: 1 }}>{reason}</Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => toggleSelect(item.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isSelected }}
                        accessibilityLabel={`تحديد ${item.drug?.tradeName ?? 'الصنف'}`}
                        hitSlop={8}
                        style={{
                            width: 24, height: 24, borderRadius: Radius.badge, borderWidth: 2,
                            borderColor: isSelected ? C.primary : C.border, backgroundColor: isSelected ? C.primary : C.card,
                            alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        {isSelected && <Ionicons name="checkmark" size={15} color="#fff" />}
                    </TouchableOpacity>
                </View>

                <View style={{ padding: 14, gap: 12 }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 16.5, textAlign: 'right' }} numberOfLines={2}>
                                {item.drug?.tradeName ?? 'دواء غير محدد'}
                            </Text>
                            {!!(item.drug?.scientificName || item.branch?.name) && (
                                <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>
                                    {[item.drug?.scientificName, item.branch?.name].filter(Boolean).join(' · ')}
                                </Text>
                            )}
                        </View>
                        <StatusBadge label={isCritical ? 'عاجل' : 'متابعة'} tone={tone} />
                    </View>

                    <View style={{ flexDirection: 'row-reverse', backgroundColor: C.background, borderRadius: Radius.control, paddingVertical: 12 }}>
                        <StatCell label="المخزون الحالي" value={formatNumber(item.currentQuantity)} suffix="وحدة" tone={tone} align="center" />
                        <VDivider />
                        <StatCell label="الكمية المقترحة" value={formatNumber(item.suggestedReorderQuantity)} suffix="وحدة" tone="primary" align="center" />
                    </View>

                    <AppButton label="مراجعة وإنشاء الطلب" icon="document-text-outline" compact onPress={() => openCreateModal(item)} />
                </View>
            </View>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <ScreenHeader title="الطلبات الذكية" fallbackHref="/(tabs)/more" />

            <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 10, backgroundColor: C.background }}>
                <Surface style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                    <IconTile icon="list-outline" />
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right' }}>النواقص المتوقعة</Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }}>
                            {!loading && items.length > 0
                                ? `${criticalCount} عاجل · ${lowCount} للمتابعة — حدّد الأصناف ثم راجع الطلب`
                                : 'حدّد الأصناف والمورد ثم راجع الطلب قبل إنشائه'}
                        </Text>
                    </View>
                </Surface>

                {isAdmin && (
                    <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} hideIfSingle inline label="الفرع" />
                )}

                {!loading && items.length > 0 && (
                    <SegmentedTabs
                        items={FILTERS.map(f => ({
                            key: f.key,
                            label: f.label,
                            count: f.key === 'critical' ? criticalCount : f.key === 'low' ? lowCount : items.length,
                        }))}
                        value={filterKey}
                        onChange={setFilterKey}
                    />
                )}

                {!loading && filtered.length > 0 && (
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                        <TouchableOpacity onPress={toggleSelectAll} activeOpacity={0.75} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
                            <Ionicons
                                name={allFilteredSelected ? 'checkbox' : 'square-outline'}
                                size={18}
                                color={allFilteredSelected ? C.primary : C.mutedForeground}
                            />
                            <Text style={{ color: allFilteredSelected ? C.primary : C.mutedForeground, fontSize: 13.5, fontWeight: '700' }}>
                                {allFilteredSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                            </Text>
                        </TouchableOpacity>
                        <Text style={{ color: C.mutedForeground, fontSize: 13 }}>{formatNumber(filtered.length)} صنف</Text>
                    </View>
                )}
            </View>

            {/* ── List ───────────────────────────────────────────────────── */}
            {loading && !refreshing ? (
                <View style={{ padding: 16, gap: 12 }}>
                    {[1, 2, 3].map(i => <Skeleton key={i} height={200} radius={Radius.card} />)}
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ flexGrow: filtered.length === 0 ? 1 : 0, padding: 16, paddingTop: 6, paddingBottom: selectedItems.length > 0 ? 130 : 32 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                    ListEmptyComponent={
                        <EmptyState
                            icon="checkmark-circle-outline"
                            title="لا توجد نواقص"
                            subtitle={filterKey !== 'all' ? 'لا توجد أصناف في هذه الفئة' : 'لا توجد أصناف تحتاج إلى إعادة طلب حالياً'}
                        />
                    }
                />
            )}

            {/* ── Bottom action bar (multi-select) ───────────────────────── */}
            {selectedItems.length > 0 && (
                <View style={{
                    position: 'absolute', bottom: 12, left: 12, right: 12,
                    backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.primary,
                    padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '800', textAlign: 'right' }}>
                            {formatNumber(selectedItems.length)} صنف محدد
                        </Text>
                        {/* Shows that the selection spans tabs */}
                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 1 }}>
                            {formatNumber(selectedCritical)} عاجل · {formatNumber(selectedItems.length - selectedCritical)} متابعة
                        </Text>
                    </View>
                    <AppButton label="إلغاء" variant="outline" compact onPress={() => setSelectedIds(new Set())} />
                    <AppButton label="مراجعة الطلب" icon="document-text-outline" compact onPress={() => openCreateModal()} />
                </View>
            )}

            {/* ── Create Order Modal ──────────────────────────────────────── */}
            <Modal
                visible={createModal !== null}
                transparent
                animationType="slide"
                onRequestClose={() => { if (!submitting) { setCreateModal(null); setShowSupplierPicker(false); } }}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <View style={{
                            backgroundColor: C.background,
                            borderTopLeftRadius: Radius.card, borderTopRightRadius: Radius.card,
                            maxHeight: '88%',
                        }}>

                            {showSupplierPicker ? (
                                /* ── Supplier picker ─────────────────────────────────── */
                                <>
                                    <View style={{
                                        flexDirection: 'row-reverse', justifyContent: 'space-between',
                                        alignItems: 'center', padding: 16,
                                        borderBottomWidth: 1, borderBottomColor: C.border,
                                    }}>
                                        <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '800' }}>
                                            اختر المورد
                                        </Text>
                                        <TouchableOpacity onPress={() => setShowSupplierPicker(false)}>
                                            <Ionicons name="arrow-forward" size={22} color={C.foreground} />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Supplier search */}
                                    <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                                        <View style={{
                                            flexDirection: 'row-reverse', alignItems: 'center',
                                            backgroundColor: C.input, borderRadius: Radius.control,
                                            borderWidth: 1, borderColor: C.border,
                                            paddingHorizontal: 12, gap: 8,
                                        }}>
                                            <Ionicons name="search" size={15} color={C.mutedForeground} />
                                            <TextInput
                                                style={{ flex: 1, color: C.foreground, paddingVertical: 10, textAlign: 'right', fontSize: 13 }}
                                                placeholder="ابحث عن مورد..."
                                                placeholderTextColor={C.mutedForeground}
                                                value={supplierSearch}
                                                onChangeText={setSupplierSearch}
                                                returnKeyType="search"
                                            />
                                        </View>
                                    </View>

                                    <FlatList
                                        data={filteredSuppliers}
                                        keyExtractor={s => s.id}
                                        style={{ maxHeight: 340 }}
                                        // First tap selects even while the search keyboard is open.
                                        keyboardShouldPersistTaps="handled"
                                        keyboardDismissMode="on-drag"
                                        renderItem={({ item: s }) => {
                                            const isActive = supplierId === s.id;
                                            return (
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        Keyboard.dismiss();
                                                        setSupplierId(s.id);
                                                        setSupplierName(s.name);
                                                        setShowSupplierPicker(false);
                                                    }}
                                                    activeOpacity={0.7}
                                                    style={{
                                                        flexDirection: 'row-reverse',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        paddingHorizontal: 16, paddingVertical: 14,
                                                        borderBottomWidth: 1, borderBottomColor: C.border,
                                                        backgroundColor: isActive ? C.primaryMuted : 'transparent',
                                                    }}
                                                >
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{
                                                            color: isActive ? C.primary : C.foreground,
                                                            fontSize: 14, fontWeight: isActive ? '700' : '400',
                                                            textAlign: 'right',
                                                        }}>
                                                            {s.name}
                                                        </Text>
                                                        {s.phone && (
                                                            <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                                                                {s.phone}
                                                            </Text>
                                                        )}
                                                    </View>
                                                    {isActive && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
                                                </TouchableOpacity>
                                            );
                                        }}
                                        ListEmptyComponent={
                                            <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
                                                <Ionicons name="business-outline" size={32} color={C.mutedForeground} />
                                                <Text style={{ color: C.mutedForeground, fontSize: 13 }}>
                                                    {supplierSearch ? `لا يوجد مورد بهذا الاسم` : 'لا يوجد موردون مسجلون'}
                                                </Text>
                                            </View>
                                        }
                                    />
                                </>

                            ) : (
                                /* ── Main create order view ──────────────────────────── */
                                <>
                                    {/* Header */}
                                    <View style={{
                                        padding: 16,
                                        borderBottomWidth: 1, borderBottomColor: C.border,
                                    }}>
                                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                                                <View style={{ backgroundColor: C.primaryMuted, borderRadius: Radius.control, padding: 7 }}>
                                                    <Ionicons name="cart" size={18} color={C.primary} />
                                                </View>
                                                <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900' }}>
                                                    مراجعة طلب الشراء
                                                </Text>
                                            </View>
                                            <TouchableOpacity
                                                onPress={() => setCreateModal(null)}
                                                disabled={submitting}
                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            >
                                                <Ionicons name="close" size={24} color={submitting ? C.border : C.foreground} />
                                            </TouchableOpacity>
                                        </View>
                                        {/* Summary chips */}
                                        {createModal && (
                                            <View style={{ flexDirection: 'row-reverse', gap: 6, marginTop: 10 }}>
                                                <View style={{
                                                    backgroundColor: C.primaryMuted, borderRadius: Radius.control,
                                                    paddingHorizontal: 9, paddingVertical: 4,
                                                    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
                                                }}>
                                                    <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>
                                                        {createModal.items.length} صنف
                                                    </Text>
                                                </View>
                                                {createModal.items.filter(i => i.isCritical).length > 0 && (
                                                    <View style={{
                                                        backgroundColor: C.dangerBg, borderRadius: Radius.control,
                                                        paddingHorizontal: 9, paddingVertical: 4,
                                                        flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
                                                    }}>
                                                        <Ionicons name="warning" size={11} color={C.danger} />
                                                        <Text style={{ color: C.danger, fontSize: 12, fontWeight: '700' }}>
                                                            {createModal.items.filter(i => i.isCritical).length} عاجل
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                        )}
                                    </View>

                                    <ScrollView
                                        contentContainerStyle={{ padding: 16 }}
                                        keyboardShouldPersistTaps="handled"
                                    >
                                        {/* Supplier picker */}
                                        <Text style={{
                                            color: C.mutedForeground, fontSize: 12, fontWeight: '600',
                                            textAlign: 'right', marginBottom: 6,
                                        }}>
                                            المورد *
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => !loadingSuppliers && setShowSupplierPicker(true)}
                                            activeOpacity={0.8}
                                            style={{
                                                flexDirection: 'row-reverse', alignItems: 'center',
                                                justifyContent: 'space-between',
                                                backgroundColor: C.input, borderRadius: Radius.control,
                                                borderWidth: 1.5,
                                                borderColor: supplierId ? C.primary : C.border,
                                                paddingHorizontal: 13, paddingVertical: 13,
                                                marginBottom: 20,
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flex: 1 }}>
                                                {loadingSuppliers ? (
                                                    <ActivityIndicator size="small" color={C.mutedForeground} />
                                                ) : (
                                                    <Ionicons
                                                        name={supplierId ? 'business' : 'business-outline'}
                                                        size={17}
                                                        color={supplierId ? C.primary : C.mutedForeground}
                                                    />
                                                )}
                                                <Text style={{
                                                    color: supplierId ? C.foreground : C.mutedForeground,
                                                    fontSize: 14, fontWeight: supplierId ? '700' : '400',
                                                }}>
                                                    {loadingSuppliers
                                                        ? 'جاري تحميل الموردين...'
                                                        : supplierName || 'اختر المورد...'}
                                                </Text>
                                            </View>
                                            {!loadingSuppliers && (
                                                supplierId
                                                    ? <Ionicons name="checkmark-circle" size={18} color={C.primary} />
                                                    : <Ionicons name="chevron-down" size={16} color={C.mutedForeground} />
                                            )}
                                        </TouchableOpacity>

                                        {/* Receiving branch */}
                                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.card, borderRadius: Radius.control, borderWidth: 1, borderColor: C.border, paddingHorizontal: 13, paddingVertical: 12, marginBottom: 20 }}>
                                            <Text style={{ color: C.mutedForeground, fontSize: 13 }}>فرع الاستلام</Text>
                                            <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '700' }}>{receiveBranchName ?? 'فرعك الحالي'}</Text>
                                        </View>

                                        {/* Items list */}
                                        <Text style={{
                                            color: C.mutedForeground, fontSize: 12, fontWeight: '600',
                                            textAlign: 'right', marginBottom: 10,
                                        }}>
                                            الأصناف ({createModal?.items.length ?? 0})
                                        </Text>

                                        <View style={{ gap: 8 }}>
                                            {createModal?.items.map((item, idx) => {
                                                const accent = item.isCritical ? C.danger : C.warning;
                                                const qty = item.quantity;
                                                return (
                                                    <View
                                                        key={item.drugId}
                                                        style={{
                                                            flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                                                            backgroundColor: C.card, borderRadius: Radius.control,
                                                            borderWidth: 1, borderColor: qty > 0 ? C.border : C.danger,
                                                            paddingVertical: 9, paddingRight: 12, paddingLeft: 8,
                                                        }}
                                                    >
                                                        {/* Name + urgency/stock line */}
                                                        <View style={{ flex: 1, minWidth: 0 }}>
                                                            <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 14, textAlign: 'right' }} numberOfLines={1}>
                                                                {item.drugName}
                                                            </Text>
                                                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 2 }}>
                                                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
                                                                <Text style={{ color: accent, fontSize: 11.5, fontWeight: '700' }}>
                                                                    {item.isCritical ? 'عاجل' : 'متابعة'}
                                                                </Text>
                                                                <Text style={{ color: C.mutedForeground, fontSize: 11.5 }}>
                                                                    · المتوفر {formatNumber(item.currentQuantity)}
                                                                </Text>
                                                            </View>
                                                        </View>

                                                        {/* Quantity only — the price is set when the goods are received */}
                                                        <View style={{
                                                            flexDirection: 'row-reverse', alignItems: 'center',
                                                            backgroundColor: C.input, borderRadius: Radius.control,
                                                            borderWidth: 1, borderColor: C.border, height: 38,
                                                        }}>
                                                            <TouchableOpacity
                                                                onPress={() => updateCreateItem(idx, 'quantity', String(qty + 1))}
                                                                hitSlop={4}
                                                                accessibilityLabel={`زيادة كمية ${item.drugName}`}
                                                                style={{ width: 34, height: '100%', alignItems: 'center', justifyContent: 'center' }}
                                                            >
                                                                <Ionicons name="add" size={18} color={C.primary} />
                                                            </TouchableOpacity>
                                                            <TextInput
                                                                style={{
                                                                    width: 48, height: '100%', paddingVertical: 0,
                                                                    color: C.foreground, textAlign: 'center', fontSize: 15, fontWeight: '800',
                                                                    borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border,
                                                                }}
                                                                keyboardType="number-pad"
                                                                value={qty > 0 ? String(qty) : ''}
                                                                placeholder="0"
                                                                placeholderTextColor={C.mutedForeground}
                                                                onChangeText={v => updateCreateItem(idx, 'quantity', v.replace(/[^0-9]/g, ''))}
                                                                accessibilityLabel={`كمية ${item.drugName}`}
                                                                selectTextOnFocus
                                                            />
                                                            <TouchableOpacity
                                                                onPress={() => updateCreateItem(idx, 'quantity', String(Math.max(0, qty - 1)))}
                                                                disabled={qty <= 0}
                                                                hitSlop={4}
                                                                accessibilityLabel={`إنقاص كمية ${item.drugName}`}
                                                                style={{ width: 34, height: '100%', alignItems: 'center', justifyContent: 'center', opacity: qty <= 0 ? 0.35 : 1 }}
                                                            >
                                                                <Ionicons name="remove" size={18} color={C.primary} />
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                        <Text style={{ color: C.mutedForeground, fontSize: 11.5, textAlign: 'right', marginTop: 10 }}>
                                            السعر يُحدَّد عند استلام البضاعة من المورد.
                                        </Text>
                                    </ScrollView>

                                    {/* Actions */}
                                    <View style={{
                                        flexDirection: 'row-reverse', gap: 10,
                                        padding: 16,
                                        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
                                        borderTopWidth: 1,
                                        borderTopColor: C.border,
                                    }}>
                                        <TouchableOpacity
                                            onPress={() => setCreateModal(null)}
                                            disabled={submitting}
                                            style={{
                                                flex: 1, backgroundColor: C.card,
                                                borderRadius: Radius.control, borderWidth: 1, borderColor: C.border,
                                                paddingVertical: 13, alignItems: 'center',
                                                opacity: submitting ? 0.5 : 1,
                                            }}
                                        >
                                            <Text style={{ color: C.foreground, fontWeight: '600', fontSize: 14 }}>إلغاء</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={handleSubmitOrder}
                                            disabled={submitting || !supplierId}
                                            activeOpacity={0.85}
                                            style={{
                                                flex: 2,
                                                backgroundColor: supplierId && !submitting ? C.primary : C.border,
                                                borderRadius: Radius.control, paddingVertical: 13,
                                                flexDirection: 'row-reverse',
                                                justifyContent: 'center', alignItems: 'center', gap: 7,
                                            }}
                                        >
                                            {submitting ? (
                                                <ActivityIndicator size="small" color="#fff" />
                                            ) : (
                                                <Ionicons name="cart" size={16} color="#fff" />
                                            )}
                                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                                                {submitting ? 'جاري الإنشاء...' : !supplierId ? 'اختر المورد أولاً' : 'إنشاء الطلب'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            <OrderCreatedModal
                order={createdOrder}
                onClose={() => setCreatedOrder(null)}
                onViewOrders={() => {
                    setCreatedOrder(null);
                    router.push('/(tabs)/purchases' as any);
                }}
            />
        </View>
    );
}

/**
 * Success after creating a purchase order: what was ordered, from whom, where it
 * will be received, and the next step (prices are entered at receipt).
 */
function OrderCreatedModal({ order, onClose, onViewOrders }: {
    order: CreatedOrderSummary | null; onClose: () => void; onViewOrders: () => void;
}) {
    const C = usePalette();
    const reduceMotion = useReduceMotion();
    const scale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!order || reduceMotion) return;
        scale.setValue(0.6);
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }).start();
    }, [order, reduceMotion, scale]);

    const row = (label: string, value: React.ReactNode) => (
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
            <Text style={{ color: C.mutedForeground, fontSize: 13.5 }}>{label}</Text>
            {typeof value === 'string'
                ? <Text style={{ flexShrink: 1, color: C.foreground, fontSize: 14, fontWeight: '800', textAlign: 'left' }} numberOfLines={1}>{value}</Text>
                : value}
        </View>
    );
    const divider = <View style={{ height: 1, backgroundColor: C.border }} />;

    return (
        <Modal visible={!!order} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', paddingHorizontal: 22 }}>
                {order && (
                    <View style={{ backgroundColor: C.card, borderRadius: Radius.card, padding: 20, gap: 16, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
                        {/* Header */}
                        <View style={{ alignItems: 'center', gap: 10 }}>
                            <Animated.View style={{
                                width: 64, height: 64, borderRadius: 32, backgroundColor: C.successBg,
                                alignItems: 'center', justifyContent: 'center', transform: [{ scale }],
                            }}>
                                <Ionicons name="checkmark" size={34} color={C.success} />
                            </Animated.View>
                            <View style={{ alignItems: 'center', gap: 4 }}>
                                <Text style={{ color: C.foreground, fontSize: 19, fontWeight: '900', textAlign: 'center' }}>تم إنشاء طلب الشراء</Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 13.5, textAlign: 'center' }}>الطلب بانتظار الاستلام، ويمكنك متابعته من صفحة المشتريات.</Text>
                            </View>
                        </View>

                        {/* Summary */}
                        <View style={{ backgroundColor: C.background, borderRadius: Radius.control, paddingHorizontal: 14, paddingVertical: 2 }}>
                            {row('المورد', order.supplierName || '—')}
                            {divider}
                            {row('الأصناف', (
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '800' }}>
                                        {formatNumber(order.itemCount)} صنف · {formatNumber(order.totalUnits)} وحدة
                                    </Text>
                                    {order.criticalCount > 0 && <StatusBadge label={`${formatNumber(order.criticalCount)} عاجل`} tone="danger" />}
                                </View>
                            ))}
                            {divider}
                            {row('فرع الاستلام', order.branchName ?? 'فرعك الحالي')}
                            {divider}
                            {row('الحالة', <StatusBadge label="قيد الانتظار" tone="warning" />)}
                        </View>

                        {/* Next step */}
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="information-circle-outline" size={18} color={C.primary} />
                            <Text style={{ flex: 1, color: C.mutedForeground, fontSize: 12.5, textAlign: 'right' }}>
                                أدخل أسعار الشراء عند استلام البضاعة من المورد.
                            </Text>
                        </View>

                        {/* Actions — side by side */}
                        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                            <AppButton label="عرض الطلبات" icon="list-outline" onPress={onViewOrders} style={{ flex: 1.3 }} />
                            <AppButton label="حسناً" variant="outline" onPress={onClose} style={{ flex: 1 }} />
                        </View>
                    </View>
                )}
            </View>
        </Modal>
    );
}
