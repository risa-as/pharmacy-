import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View, Text, FlatList, RefreshControl,
    TouchableOpacity, Alert, Modal, ScrollView, TextInput,
    KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { managerPalette, Radius } from '../../constants/colors';
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

type FilterKey = 'all' | 'critical' | 'low';

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',      label: 'الكل' },
    { key: 'critical', label: 'عاجل' },
    { key: 'low',      label: 'مراقبة' },
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

    const toggleSelectAll = useCallback(() => {
        if (selectedIds.size === filtered.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filtered.map(i => i.id)));
        }
    }, [selectedIds, filtered]);

    // ── Create order helpers ──────────────────────────────────────────────────
    const openCreateModal = useCallback((item?: SmartOrderItem) => {
        const targets = item ? [item] : filtered.filter(i => selectedIds.has(i.id));
        if (targets.length === 0) return;
        const branchId = selectedBranch ?? targets[0]?.branchId ?? authBranchId ?? '';
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
    }, [filtered, selectedIds, selectedBranch, authBranchId]);

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
            setCreateModal(null);
            setSelectedIds(new Set());
            Alert.alert(
                'تم بنجاح ✓',
                'تم إنشاء طلب الشراء، يمكنك تتبعه في صفحة المشتريات',
                [
                    { text: 'حسناً' },
                    { text: 'عرض الطلبات', onPress: () => router.push('/(tabs)/purchases' as any) },
                ],
            );
        } catch {
            Alert.alert('خطأ', 'فشل في إنشاء طلب الشراء، يرجى المحاولة مرة أخرى');
        } finally {
            setSubmitting(false);
        }
    }, [createModal, supplierId]);

    // ── Item card ─────────────────────────────────────────────────────────────
    const renderItem = ({ item }: { item: SmartOrderItem }) => {
        const urgency    = getUrgency(item);
        const isCritical = urgency === 'critical';
        const isSelected = selectedIds.has(item.id);
        const accentColor = isCritical ? C.danger : C.warning;
        const accentBg    = isCritical ? C.dangerBg : C.warningBg;
        const days        = item.daysUntilStockout;
        const subtitle    = [item.drug?.scientificName, item.branch?.name].filter(Boolean).join('  ·  ');
        const daysColor   = days === undefined ? C.mutedForeground : days <= 3 ? C.danger : days <= 7 ? C.warning : C.primary;
        const daysBg      = days === undefined ? C.border : days <= 3 ? C.dangerBg : days <= 7 ? C.warningBg : C.primaryMuted;

        return (
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => toggleSelect(item.id)}
                style={{
                    backgroundColor: C.card,
                    borderRadius: Radius.sm,
                    marginBottom: 12,
                    borderWidth: isSelected ? 2 : 1.5,
                    borderColor: isSelected ? accentColor : `${accentColor}40`,
                    padding: 14,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.05,
                    shadowRadius: 8,
                    elevation: isSelected ? 2 : 1,
                }}
            >
                {/* ── Header: checkbox + name/subtitle + urgency pill ── */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    {/* Checkbox */}
                    <View style={{
                        width: 22, height: 22, borderRadius: Radius.xs,
                        borderWidth: 2, borderColor: isSelected ? accentColor : C.border,
                        backgroundColor: isSelected ? accentColor : 'transparent',
                        justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                    }}>
                        {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
                    </View>

                    {/* Drug info */}
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15, textAlign: 'right' }} numberOfLines={1}>
                            {item.drug?.tradeName ?? 'دواء غير محدد'}
                        </Text>
                        {!!subtitle && (
                            <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>
                                {subtitle}
                            </Text>
                        )}
                    </View>

                    {/* Urgency pill */}
                    <View style={{
                        flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
                        backgroundColor: accentBg, borderRadius: Radius.xs,
                        paddingHorizontal: 9, paddingVertical: 5, flexShrink: 0,
                    }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accentColor }} />
                        <Text style={{ color: accentColor, fontSize: 11, fontWeight: '800' }}>
                            {isCritical ? 'عاجل' : 'مراقبة'}
                        </Text>
                    </View>
                </View>

                {/* ── Reorder flow: current → suggested (one unified panel) ── */}
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center',
                    backgroundColor: C.background, borderRadius: Radius.xs,
                    borderWidth: 1, borderColor: C.border,
                    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12,
                }}>
                    {/* Current */}
                    <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 10.5, fontWeight: '600', marginBottom: 4 }}>
                            المخزون الحالي
                        </Text>
                        <Text style={{ color: accentColor, fontSize: 24, fontWeight: '900' }}>
                            {item.currentQuantity}
                        </Text>
                    </View>

                    {/* Arrow */}
                    <View style={{
                        width: 30, height: 30, borderRadius: Radius.xs,
                        backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center',
                        marginHorizontal: 6,
                    }}>
                        <Ionicons name="arrow-back" size={16} color={C.primary} />
                    </View>

                    {/* Suggested */}
                    <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 10.5, fontWeight: '600', marginBottom: 4 }}>
                            الكمية المقترحة
                        </Text>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 3 }}>
                            <Text style={{ color: C.primary, fontSize: 24, fontWeight: '900' }}>
                                {item.suggestedReorderQuantity}
                            </Text>
                            <Text style={{ color: C.mutedForeground, fontSize: 10, fontWeight: '700' }}>وحدة</Text>
                        </View>
                    </View>
                </View>

                {/* ── Footer: days + order button ── */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                    {days !== undefined ? (
                        <View style={{
                            flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
                            backgroundColor: daysBg, borderRadius: Radius.xs, paddingHorizontal: 9, paddingVertical: 5,
                        }}>
                            <Ionicons name="timer-outline" size={12} color={daysColor} />
                            <Text style={{ fontSize: 12, fontWeight: '700', color: daysColor }}>
                                {days === 0 ? 'نفاد اليوم' : `${days} يوم للنفاد`}
                            </Text>
                        </View>
                    ) : (
                        <View />
                    )}

                    {/* Quick order button */}
                    <TouchableOpacity
                        onPress={() => openCreateModal(item)}
                        activeOpacity={0.85}
                        style={{
                            flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
                            backgroundColor: C.primary, borderRadius: Radius.xs,
                            paddingHorizontal: 14, paddingVertical: 8,
                        }}
                    >
                        <Ionicons name="cart-outline" size={15} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>
                            إنشاء طلب
                        </Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>

            {/* ── Header ─────────────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, backgroundColor: C.background }}>

                {/* Title row */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <View>
                        <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '900', textAlign: 'right' }}>
                            الطلبات الذكية
                        </Text>
                        {!loading && items.length > 0 && (
                            <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }}>
                                {criticalCount > 0 ? `${criticalCount} عاجل · ` : ''}{lowCount} للمراقبة
                            </Text>
                        )}
                    </View>
                    <View style={{ backgroundColor: C.warningBg, borderRadius: 5, padding: 10 }}>
                        <Ionicons name="bulb" size={22} color={C.warning} />
                    </View>
                </View>

                {/* Branch selector */}
                {isAdmin && (
                    <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} hideIfSingle />
                )}

                {/* ── Filter tabs ─────────────────────────────────────────── */}
                {!loading && items.length > 0 && (
                    <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 10 }}>
                        {FILTERS.map(f => {
                            const active = filterKey === f.key;
                            const count  = f.key === 'critical' ? criticalCount
                                         : f.key === 'low'      ? lowCount
                                         : items.length;
                            const fColor = f.key === 'critical' ? C.danger
                                         : f.key === 'low'      ? C.warning
                                         : C.primary;
                            const fBg    = f.key === 'critical' ? C.dangerBg
                                         : f.key === 'low'      ? C.warningBg
                                         : C.primaryMuted;
                            return (
                                <TouchableOpacity
                                    key={f.key}
                                    onPress={() => setFilterKey(f.key)}
                                    activeOpacity={0.8}
                                    style={{
                                        flex: 1, flexDirection: 'row-reverse',
                                        alignItems: 'center', justifyContent: 'center', gap: 5,
                                        paddingVertical: 8, borderRadius: 5,
                                        backgroundColor: active ? fBg : C.card,
                                        borderWidth: 1.5,
                                        borderColor: active ? fColor : C.border,
                                    }}
                                >
                                    <Text style={{ color: active ? fColor : C.mutedForeground, fontSize: 13, fontWeight: '700' }}>
                                        {f.label}
                                    </Text>
                                    {count > 0 && (
                                        <View style={{
                                            backgroundColor: active ? `${fColor}22` : C.border,
                                            borderRadius: 10, minWidth: 20,
                                            paddingHorizontal: 5, paddingVertical: 1, alignItems: 'center',
                                        }}>
                                            <Text style={{ color: active ? fColor : C.mutedForeground, fontSize: 11, fontWeight: '800' }}>
                                                {count}
                                            </Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                {/* ── Select all row ───────────────────────────────────────── */}
                {!loading && filtered.length > 0 && (
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <TouchableOpacity
                            onPress={toggleSelectAll}
                            activeOpacity={0.75}
                            style={{
                                flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
                                backgroundColor: selectedIds.size > 0 ? C.primaryMuted : 'transparent',
                                borderRadius: 5, paddingHorizontal: 10, paddingVertical: 5,
                                borderWidth: 1,
                                borderColor: selectedIds.size > 0 ? C.primary : C.border,
                            }}
                        >
                            <Ionicons
                                name={selectedIds.size === filtered.length && filtered.length > 0 ? 'checkbox' : 'square-outline'}
                                size={15}
                                color={selectedIds.size > 0 ? C.primary : C.mutedForeground}
                            />
                            <Text style={{
                                color: selectedIds.size > 0 ? C.primary : C.mutedForeground,
                                fontSize: 12, fontWeight: selectedIds.size > 0 ? '700' : '500',
                            }}>
                                {selectedIds.size === filtered.length && filtered.length > 0 ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                            </Text>
                        </TouchableOpacity>
                        <Text style={{ color: C.mutedForeground, fontSize: 12 }}>
                            {filtered.length} صنف
                        </Text>
                    </View>
                )}
            </View>

            {/* ── List ───────────────────────────────────────────────────── */}
            {loading && !refreshing ? (
                <View style={{ padding: 16, gap: 12 }}>
                    {[1, 2, 3].map(i => <Skeleton key={i} height={180} radius={5} />)}
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{
                        padding: 16, paddingTop: 6,
                        paddingBottom: selectedIds.size > 0 ? 130 : 110,
                    }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                    ListEmptyComponent={
                        <EmptyState
                            icon="checkmark-circle"
                            title="المخزون ممتاز!"
                            subtitle={
                                filterKey !== 'all'
                                    ? 'لا توجد أصناف في هذه الفئة'
                                    : 'لا توجد أصناف تحتاج إلى إعادة طلب حالياً'
                            }
                        />
                    }
                />
            )}

            {/* ── Bottom action bar (multi-select) ───────────────────────── */}
            {selectedIds.size > 0 && (
                <View style={{
                    position: 'absolute', bottom: 12, left: 12, right: 12,
                    backgroundColor: C.primary, borderRadius: Radius.sm,
                    padding: 14, flexDirection: 'row-reverse',
                    alignItems: 'center', justifyContent: 'space-between',
                    elevation: 8,
                    shadowColor: C.primary,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.35, shadowRadius: 12,
                }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                        <View style={{
                            backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 5,
                            width: 28, height: 28, justifyContent: 'center', alignItems: 'center',
                        }}>
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>
                                {selectedIds.size}
                            </Text>
                        </View>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                            صنف محدد
                        </Text>
                    </View>

                    <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                        <TouchableOpacity
                            onPress={() => setSelectedIds(new Set())}
                            style={{
                                backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 5,
                                paddingHorizontal: 12, paddingVertical: 8,
                            }}
                            activeOpacity={0.75}
                        >
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>إلغاء</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => openCreateModal()}
                            style={{
                                backgroundColor: '#fff', borderRadius: 5,
                                paddingHorizontal: 14, paddingVertical: 8,
                                flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
                            }}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="cart" size={14} color={C.primary} />
                            <Text style={{ color: C.primary, fontSize: 13, fontWeight: '800' }}>
                                إنشاء الطلبات
                            </Text>
                        </TouchableOpacity>
                    </View>
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
                            borderTopLeftRadius: 16, borderTopRightRadius: 16,
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
                                            backgroundColor: C.input, borderRadius: 5,
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
                                                autoFocus
                                            />
                                        </View>
                                    </View>

                                    <FlatList
                                        data={filteredSuppliers}
                                        keyExtractor={s => s.id}
                                        style={{ maxHeight: 340 }}
                                        renderItem={({ item: s }) => {
                                            const isActive = supplierId === s.id;
                                            return (
                                                <TouchableOpacity
                                                    onPress={() => {
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
                                                <View style={{ backgroundColor: C.primaryMuted, borderRadius: 5, padding: 7 }}>
                                                    <Ionicons name="cart" size={18} color={C.primary} />
                                                </View>
                                                <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900' }}>
                                                    إنشاء طلب شراء
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
                                                    backgroundColor: C.primaryMuted, borderRadius: 5,
                                                    paddingHorizontal: 9, paddingVertical: 4,
                                                    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
                                                }}>
                                                    <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>
                                                        {createModal.items.length} صنف
                                                    </Text>
                                                </View>
                                                {createModal.items.filter(i => i.isCritical).length > 0 && (
                                                    <View style={{
                                                        backgroundColor: C.dangerBg, borderRadius: 5,
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
                                                backgroundColor: C.input, borderRadius: 5,
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

                                        {/* Items list */}
                                        <Text style={{
                                            color: C.mutedForeground, fontSize: 12, fontWeight: '600',
                                            textAlign: 'right', marginBottom: 10,
                                        }}>
                                            الأصناف ({createModal?.items.length ?? 0})
                                        </Text>

                                        {createModal?.items.map((item, idx) => {
                                            const accentColor = item.isCritical ? C.danger : C.warning;
                                            const accentBg    = item.isCritical ? C.dangerBg : C.warningBg;
                                            return (
                                                <View
                                                    key={idx}
                                                    style={{
                                                        flexDirection: 'row-reverse',
                                                        backgroundColor: C.card, borderRadius: 5,
                                                        borderWidth: 1, borderColor: C.border,
                                                        overflow: 'hidden', marginBottom: 10,
                                                    }}
                                                >
                                                    {/* Urgency accent bar */}
                                                    <View style={{ width: 3, backgroundColor: accentColor }} />

                                                    <View style={{ flex: 1, padding: 13 }}>
                                                        {/* Name + urgency badge */}
                                                        <View style={{
                                                            flexDirection: 'row-reverse', justifyContent: 'space-between',
                                                            alignItems: 'flex-start', marginBottom: 4,
                                                        }}>
                                                            <Text style={{
                                                                color: C.foreground, fontWeight: '800', fontSize: 14,
                                                                textAlign: 'right', flex: 1,
                                                            }} numberOfLines={1}>
                                                                {item.drugName}
                                                            </Text>
                                                            <View style={{
                                                                backgroundColor: accentBg, borderRadius: 5,
                                                                paddingHorizontal: 7, paddingVertical: 3, marginLeft: 8,
                                                            }}>
                                                                <Text style={{ color: accentColor, fontSize: 10, fontWeight: '800' }}>
                                                                    {item.isCritical ? '⚠ عاجل' : 'مراقبة'}
                                                                </Text>
                                                            </View>
                                                        </View>

                                                        {/* Current stock info */}
                                                        <Text style={{
                                                            color: C.mutedForeground, fontSize: 11,
                                                            textAlign: 'right', marginBottom: 12,
                                                        }}>
                                                            المخزون الحالي:{' '}
                                                            <Text style={{ color: accentColor, fontWeight: '700' }}>
                                                                {item.currentQuantity}
                                                            </Text>
                                                        </Text>

                                                        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                                                            {/* Quantity */}
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={{
                                                                    color: C.mutedForeground, fontSize: 11,
                                                                    textAlign: 'center', marginBottom: 5,
                                                                }}>
                                                                    الكمية
                                                                </Text>
                                                                <TextInput
                                                                    style={{
                                                                        backgroundColor: C.input, borderRadius: 5,
                                                                        borderWidth: 1, borderColor: C.border,
                                                                        paddingHorizontal: 8, paddingVertical: 10,
                                                                        color: C.foreground, textAlign: 'center',
                                                                        fontSize: 18, fontWeight: '900',
                                                                    }}
                                                                    keyboardType="numeric"
                                                                    value={item.quantity > 0 ? String(item.quantity) : ''}
                                                                    placeholder="0"
                                                                    placeholderTextColor={C.mutedForeground}
                                                                    onChangeText={v => updateCreateItem(idx, 'quantity', v)}
                                                                />
                                                            </View>
                                                            {/* Cost */}
                                                            <View style={{ flex: 1.7 }}>
                                                                <Text style={{
                                                                    color: C.mutedForeground, fontSize: 11,
                                                                    textAlign: 'center', marginBottom: 5,
                                                                }}>
                                                                    سعر الوحدة (د.ع)
                                                                </Text>
                                                                <TextInput
                                                                    style={{
                                                                        backgroundColor: C.input, borderRadius: 5,
                                                                        borderWidth: 1, borderColor: C.border,
                                                                        paddingHorizontal: 8, paddingVertical: 10,
                                                                        color: C.foreground, textAlign: 'center',
                                                                        fontSize: 18, fontWeight: '900',
                                                                    }}
                                                                    keyboardType="numeric"
                                                                    value={item.cost > 0 ? String(item.cost) : ''}
                                                                    placeholder="0"
                                                                    placeholderTextColor={C.mutedForeground}
                                                                    onChangeText={v => updateCreateItem(idx, 'cost', v)}
                                                                />
                                                            </View>
                                                        </View>

                                                        {/* Line total */}
                                                        {item.cost > 0 && item.quantity > 0 && (
                                                            <View style={{
                                                                flexDirection: 'row-reverse', justifyContent: 'flex-end',
                                                                alignItems: 'center', gap: 4, marginTop: 9,
                                                                paddingTop: 9, borderTopWidth: 1, borderTopColor: C.border,
                                                            }}>
                                                                <Text style={{ color: C.mutedForeground, fontSize: 11 }}>إجمالي الصنف:</Text>
                                                                <Text style={{ color: C.success, fontWeight: '800', fontSize: 13 }}>
                                                                    {(item.quantity * item.cost).toLocaleString('en-US')} د.ع
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </ScrollView>

                                    {/* Grand total */}
                                    {createModal && createModal.items.some(i => i.cost > 0) && (
                                        <View style={{
                                            flexDirection: 'row-reverse', justifyContent: 'space-between',
                                            alignItems: 'center',
                                            paddingHorizontal: 16, paddingVertical: 12,
                                            borderTopWidth: 1, borderTopColor: C.border,
                                            backgroundColor: C.card,
                                        }}>
                                            <Text style={{ color: C.mutedForeground, fontSize: 13 }}>الإجمالي التقديري</Text>
                                            <Text style={{ color: C.foreground, fontWeight: '900', fontSize: 17 }}>
                                                {createModal.items
                                                    .reduce((s, i) => s + i.quantity * i.cost, 0)
                                                    .toLocaleString('en-US')}{' '}
                                                <Text style={{ fontSize: 12, fontWeight: '500', color: C.mutedForeground }}>د.ع</Text>
                                            </Text>
                                        </View>
                                    )}

                                    {/* Actions */}
                                    <View style={{
                                        flexDirection: 'row-reverse', gap: 10,
                                        padding: 16,
                                        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
                                        borderTopWidth: createModal && createModal.items.some(i => i.cost > 0) ? 0 : 1,
                                        borderTopColor: C.border,
                                    }}>
                                        <TouchableOpacity
                                            onPress={() => setCreateModal(null)}
                                            disabled={submitting}
                                            style={{
                                                flex: 1, backgroundColor: C.card,
                                                borderRadius: 5, borderWidth: 1, borderColor: C.border,
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
                                                borderRadius: 5, paddingVertical: 13,
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

        </View>
    );
}
