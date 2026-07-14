import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    RefreshControl, ActivityIndicator, Alert, Modal, ScrollView,
    InteractionManager, StyleSheet, Animated, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { apiService } from '../../services/api';
import { dbService } from '../../services/db';
import { syncService } from '../../services/sync';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { managerPalette, Radius } from '../../constants/colors';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { BranchSelector } from '../../components/BranchSelector';
import { useSyncStatus } from '../../context/SyncContext';

type TabKey = 'all' | 'low-stock' | 'expiring' | 'near-expiry';
type SortKey = 'name' | 'quantity' | 'expiry';

/**
 * Auto-format a typed expiry date into YYYY-MM-DD as the user types digits, so
 * they never have to enter the dashes manually. Strips non-digits, then inserts
 * the separators after the year and month segments.
 */
function formatExpiry(raw: string): string {
    const d = raw.replace(/\D/g, '').slice(0, 8); // YYYYMMDD
    let out = d.slice(0, 4);
    if (d.length > 4) out += '-' + d.slice(4, 6);
    if (d.length > 6) out += '-' + d.slice(6, 8);
    return out;
}

interface InventoryItem {
    id: string;
    drugId?: string;
    barcode?: string;
    drugName: string;
    quantity: number;
    price: number;
    reorderLevel: number;
    expiryDate?: string;
    isQuickSale?: boolean;
}

const TABS: { key: TabKey; label: string }[] = [
    { key: 'all',          label: 'الكل' },
    { key: 'low-stock',    label: 'نواقص' },
    { key: 'expiring',     label: 'نفاد' },
    { key: 'near-expiry',  label: 'قارب الانتهاء' },
];

const SORTS: { key: SortKey; label: string; icon: any }[] = [
    { key: 'name',     label: 'الاسم',     icon: 'text-outline' },
    { key: 'quantity', label: 'الكمية',    icon: 'layers-outline' },
    { key: 'expiry',   label: 'الصلاحية',  icon: 'calendar-outline' },
];

function getDaysToExpiry(expiryDate?: string): number | null {
    if (!expiryDate) return null;
    const diff = new Date(expiryDate).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** Compact Arabic number abbreviation for large money figures. */
function abbrNum(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}م`;
    if (n >= 1_000)     return `${Math.round(n / 1_000)} ألف`;
    return Math.round(n).toLocaleString('en-US');
}

export default function InventoryScreen() {
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

    const [items, setItems]               = useState<InventoryItem[]>([]);
    const [search, setSearch]             = useState('');
    const [activeTab, setActiveTab]       = useState<TabKey>('all');
    const [sortKey, setSortKey]           = useState<SortKey>('name');
    const [sortAsc, setSortAsc]           = useState(true);
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [isSorting, setIsSorting]       = useState(false);
    const [sorted, setSorted]             = useState<InventoryItem[]>([]);
    const [refreshing, setRefreshing]     = useState(false);
    const [loading, setLoading]           = useState(true);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
    const [isOnline, setIsOnline]         = useState(true);

    // Modal states (preserved)
    const [showBatchModal, setShowBatchModal]   = useState<any | null>(null);
    const [showBranchModal, setShowBranchModal] = useState<any | null>(null);
    const [showCreateModal, setShowCreateModal] = useState<string | null>(null);
    const [modalLoading, setModalLoading]       = useState(false);
    // Packet → strip cost calculator (cost per strip = packet price ÷ strips)
    const [packetPrice, setPacketPrice]         = useState('');
    const [stripsPerPacket, setStripsPerPacket] = useState('1');
    const [formData, setFormData] = useState({
        tradeName: '', scientificName: '', price: '', costPrice: '',
        minStock: '5', maxStock: '100', quantity: '', expiryDate: '', batchNumber: '',
    });
    const [isQuickSale, setIsQuickSale]           = useState(false);
    const [quickSaleState, setQuickSaleState]     = useState<Record<string, boolean>>({});
    const [togglingQuickSale, setTogglingQuickSale] = useState<string | null>(null);

    // Supplier picker state (shared across all modals)
    const [suppliers, setSuppliers]               = useState<Array<{ id: string; name: string }>>([]);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
    const [showSupplierPicker, setShowSupplierPicker] = useState(false);
    const [supplierSearch, setSupplierSearch]     = useState('');
    const [supplierPickerContext, setSupplierPickerContext] = useState<'batch' | 'branch' | 'create'>('create');

    const params = useLocalSearchParams();

    // Drag-to-dismiss for the sort bottom sheet.
    const sortSheetY = useRef(new Animated.Value(0)).current;
    const closeSortSheet = () => {
        // Slide fully off-screen, THEN unmount. Don't reset the value to 0 here —
        // doing so would render one visible frame at the resting position (a flash).
        // The next open resets the value before showing the sheet.
        Animated.timing(sortSheetY, { toValue: 600, duration: 200, useNativeDriver: false }).start(({ finished }) => {
            if (finished) setShowSortMenu(false);
        });
    };
    const sortPan = useRef(
        PanResponder.create({
            // Don't claim on touch-start (so option buttons stay tappable);
            // claim only when the user drags vertically downward.
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, g) => g.dy > 5 && g.dy > Math.abs(g.dx),
            onPanResponderMove: (_, g) => { if (g.dy > 0) sortSheetY.setValue(g.dy); },
            onPanResponderRelease: (_, g) => {
                if (g.dy > 70 || g.vy > 0.5) {
                    closeSortSheet();
                } else {
                    Animated.spring(sortSheetY, { toValue: 0, useNativeDriver: false, bounciness: 4 }).start();
                }
            },
            onPanResponderTerminationRequest: () => false,
        }),
    ).current;

    useEffect(() => {
        if (!isAdmin && authBranchId) setSelectedBranch(authBranchId);
    }, [isAdmin, authBranchId]);

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const online = await syncService.isOnline();
            setIsOnline(online);
            if (online) {
                const effectiveBranchId = !isAdmin ? authBranchId : selectedBranch;
                const data = await apiService.getInventory(effectiveBranchId || undefined);
                setItems(data);
                if (Array.isArray(data)) {
                    setQuickSaleState(Object.fromEntries(
                        data.filter((i: any) => i.drugId).map((i: any) => [i.drugId, i.isQuickSale ?? false])
                    ));
                }
            } else {
                const products = await dbService.searchProducts('');
                setItems(products.map((p: any) => ({
                    id: p.id, drugName: p.drugName, price: p.price,
                    quantity: p.quantity, reorderLevel: p.reorderLevel,
                })));
            }
        } catch {
            try {
                const products = await dbService.searchProducts('');
                setItems(products.map((p: any) => ({
                    id: p.id, drugName: p.drugName, price: p.price,
                    quantity: p.quantity, reorderLevel: p.reorderLevel,
                })));
            } catch { /* silent fallback */ }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedBranch, isAdmin, authBranchId]);

    useEffect(() => { fetchInventory(); }, [fetchInventory]);

    const handleQuickSaleToggle = async (drugId: string) => {
        if (togglingQuickSale === drugId) return;
        setTogglingQuickSale(drugId);
        const newValue = !quickSaleState[drugId];
        setQuickSaleState(prev => ({ ...prev, [drugId]: newValue }));
        try {
            const res = await apiService.toggleQuickSale(drugId, newValue);
            if (!res?.success) setQuickSaleState(prev => ({ ...prev, [drugId]: !newValue }));
        } catch {
            setQuickSaleState(prev => ({ ...prev, [drugId]: !newValue }));
        } finally {
            setTogglingQuickSale(null);
        }
    };

    useEffect(() => {
        if (showBatchModal || showBranchModal || showCreateModal) {
            apiService.getSuppliers().then(setSuppliers).catch(() => {});
        }
    }, [!!showBatchModal, !!showBranchModal, !!showCreateModal]);

    useEffect(() => {
        if (!showBatchModal && !showBranchModal && !showCreateModal) {
            setSelectedSupplierId(null);
            setSupplierSearch('');
            setPacketPrice(''); setStripsPerPacket('1');
        }
    }, [showBatchModal, showBranchModal, showCreateModal]);

    const handleScannedProduct = async (code: string) => {
        if (!isOnline) { Alert.alert('تنبيه', 'يجب أن تكون متصلاً بالإنترنت لإضافة عناصر جديدة.'); return; }
        setLoading(true);
        try {
            const res = await apiService.checkBarcodeExact(code, selectedBranch || undefined);
            if (res.success && res.exists) {
                if (res.inventory) setShowBatchModal(res.inventory);
                else if (res.drug) setShowBranchModal(res.drug);
            } else {
                setShowCreateModal(code);
            }
        } catch { Alert.alert('خطأ', 'فشل التحقق من المنتج'); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        if (params.scannedBarcode) {
            handleScannedProduct(params.scannedBarcode as string);
            router.setParams({ scannedBarcode: '' });
        }
    }, [params.scannedBarcode]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        triggerSync('inventory');
        await syncService.syncData();
        fetchInventory();
    }, [fetchInventory, triggerSync]);

    // Shared save guard: blocks a zero quantity, then warns (soft) when the
    // packet price is under 125 IQD, then warns when strips-per-packet looks
    // like the TOTAL strip count, before running the actual save callback.
    const guardAndSave = (proceed: () => void) => {
        const qty = parseInt(formData.quantity) || 0;
        if (qty <= 0) {
            Alert.alert('لا يمكن الحفظ', 'الكمية يجب أن تكون أكبر من صفر.');
            return;
        }
        const pkt = parseFloat(packetPrice) || 0;
        const strips = Math.max(1, parseInt(stripsPerPacket) || 1);
        // عدد الأشرطة في الباكيت يساوي الكمية الكلية أو مرتفع جداً = غالباً أُدخل الإجمالي بالخطأ
        const confirmStrips = () => {
            if (pkt > 0 && (strips > 20 || (qty > 10 && strips >= qty))) {
                Alert.alert(
                    'تنبيه: عدد الأشرطة في الباكيت',
                    `عدد الأشرطة في الباكيت (${strips}) يبدو غير صحيح — هذا الحقل يعني عدد الأشرطة داخل الباكيت الواحد، وليس إجمالي الأشرطة المستلمة (الكمية المدخلة: ${qty}).\n` +
                    `سعر التكلفة للشريط سيُحسب: ${pkt} ÷ ${strips} = ${(pkt / strips).toLocaleString('en', { maximumFractionDigits: 2 })} د.ع. هل أنت متأكد من المتابعة؟`,
                    [
                        { text: 'إلغاء', style: 'cancel' },
                        { text: 'متابعة', onPress: () => proceed() },
                    ],
                );
                return;
            }
            proceed();
        };
        if (pkt < 125) {
            Alert.alert(
                'تحذير: سعر الباكيت منخفض',
                `سعر الباكيت (${pkt.toLocaleString('en-US')} د.ع) أقل من 125 دينار. هل تريد المتابعة؟`,
                [
                    { text: 'إلغاء', style: 'cancel' },
                    { text: 'متابعة', onPress: () => confirmStrips() },
                ],
            );
            return;
        }
        confirmStrips();
    };

    // Modal handlers (preserved)
    const handleAddBatch = () => {
        if (!formData.quantity || !formData.expiryDate) {
            Alert.alert('تنبيه', 'يرجى ملء كافة الحقول الأساسية'); return;
        }
        guardAndSave(async () => {
            setModalLoading(true);
            try {
                await apiService.addBatch({
                    inventoryId: showBatchModal.id,
                    quantity: parseInt(formData.quantity) || 0,
                    costPrice: computedStripCost,
                    expiryDate: formData.expiryDate + 'T00:00:00.000Z',
                    supplierId: selectedSupplierId || null,
                });
                setShowBatchModal(null);
                setFormData(f => ({ ...f, quantity: '', expiryDate: '', costPrice: '' }));
                setPacketPrice(''); setStripsPerPacket('1');
                fetchInventory();
            } catch { Alert.alert('خطأ', 'فشل إضافة الجرعة'); }
            finally { setModalLoading(false); }
        });
    };

    const handleAddToBranch = () => {
        if (!formData.price || !formData.quantity || !formData.expiryDate) {
            Alert.alert('تنبيه', 'يرجى ملء كافة الحقول الأساسية'); return;
        }
        guardAndSave(async () => {
            setModalLoading(true);
            try {
                await apiService.addToBranch({
                    drugId: showBranchModal.id, branchId: selectedBranch!,
                    price: parseFloat(formData.price) || 0,
                    cost: computedStripCost,
                    minStock: parseInt(formData.minStock) || 5,
                    maxStock: parseInt(formData.maxStock) || 100,
                    quantity: parseInt(formData.quantity) || 0,
                    expiryDate: formData.expiryDate + 'T00:00:00.000Z',
                    supplierId: selectedSupplierId || null,
                });
                setShowBranchModal(null);
                setFormData({ tradeName: '', scientificName: '', price: '', costPrice: '', minStock: '5', maxStock: '100', quantity: '', expiryDate: '', batchNumber: '' });
                setPacketPrice(''); setStripsPerPacket('1');
                fetchInventory();
            } catch { Alert.alert('خطأ', 'فشل إضافة الدواء للفرع'); }
            finally { setModalLoading(false); }
        });
    };

    const handleCreateDrug = () => {
        if (!formData.tradeName || !formData.price || !formData.quantity || !formData.expiryDate) {
            Alert.alert('تنبيه', 'يرجى ملء الحقول الأساسية'); return;
        }
        guardAndSave(async () => {
            setModalLoading(true);
            try {
                await apiService.createQuickDrug({
                    barcode: showCreateModal!, tradeName: formData.tradeName,
                    scientificName: formData.scientificName, drugType: 'Tablet', dosage: 'Custom',
                    unit: 'Box', category: 'General', manufacturer: 'Unknown', country: 'Unknown',
                    branchId: selectedBranch!, price: parseFloat(formData.price) || 0,
                    costPrice: computedStripCost,
                    minStock: parseInt(formData.minStock) || 5, maxStock: parseInt(formData.maxStock) || 100,
                    batchNumber: formData.batchNumber || '',
                    quantity: parseInt(formData.quantity) || 0,
                    expiryDate: formData.expiryDate + 'T00:00:00.000Z',
                    supplierId: selectedSupplierId || null,
                    isQuickSale,
                });
                setShowCreateModal(null);
                setIsQuickSale(false);
                setFormData({ tradeName: '', scientificName: '', price: '', costPrice: '', minStock: '5', maxStock: '100', quantity: '', expiryDate: '', batchNumber: '' });
                setPacketPrice(''); setStripsPerPacket('1');
                fetchInventory();
            } catch { Alert.alert('خطأ', 'فشل تسجيل الدواء الجديد'); }
            finally { setModalLoading(false); }
        });
    };

    // Total inventory value at sale price (Σ quantity × price).
    const totalValue = useMemo(() => items.reduce((s, i) => s + i.quantity * i.price, 0), [items]);

    // ── Counts for tab badges ──────────────────────────────────────────────────
    const counts = useMemo(() => ({
        all:            items.length,
        'low-stock':    items.filter(i => i.quantity > 0 && i.quantity <= i.reorderLevel).length,
        expiring:       items.filter(i => i.quantity === 0).length,
        'near-expiry':  items.filter(i => { const d = getDaysToExpiry(i.expiryDate); return d !== null && d >= 0 && d < 120; }).length,
    }), [items]);

    // ── Collator instance — created once, 10-100× faster than localeCompare('ar') ──
    const collator = useMemo(() => new Intl.Collator('ar', { sensitivity: 'base' }), []);

    // ── Expiry cache — avoids recomputing Date math in every sort comparison ──
    const expiryCache = useMemo(() =>
        new Map(items.map(i => [i.id, getDaysToExpiry(i.expiryDate) ?? 9999])),
    [items]);

    // ── Fast filter (no sort) — runs synchronously, cheap ─────────────────────
    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return items.filter(i => {
            if (q && !i.drugName.toLowerCase().includes(q) && !(i.barcode?.includes(search) ?? false)) return false;
            if (activeTab === 'low-stock')   return i.quantity > 0 && i.quantity <= i.reorderLevel;
            if (activeTab === 'expiring')    return i.quantity === 0;
            if (activeTab === 'near-expiry') { const d = expiryCache.get(i.id)!; return d !== 9999 && d >= 0 && d < 120; }
            return true;
        });
    }, [items, search, activeTab, expiryCache]);

    // ── Async sort — shows loading state immediately, then sorts off the render cycle
    useEffect(() => {
        setIsSorting(true);
        const task = InteractionManager.runAfterInteractions(() => {
            const result = [...filtered].sort((a, b) => {
                let diff = 0;
                if (sortKey === 'name')          diff = collator.compare(a.drugName, b.drugName);
                else if (sortKey === 'quantity') diff = a.quantity - b.quantity;
                else                             diff = (expiryCache.get(a.id) ?? 9999) - (expiryCache.get(b.id) ?? 9999);
                return sortAsc ? diff : -diff;
            });
            setSorted(result);
            setIsSorting(false);
        });
        return () => task.cancel();
    }, [filtered, sortKey, sortAsc, collator, expiryCache]);

    // ── Item card ──────────────────────────────────────────────────────────────
    const renderItem = ({ item }: { item: InventoryItem }) => {
        const days        = getDaysToExpiry(item.expiryDate);
        const isOut       = item.quantity === 0;
        const isLow       = !isOut && item.quantity <= item.reorderLevel;
        const stockColor  = isOut ? C.danger : isLow ? C.warning : C.success;
        const stockBg     = isOut ? C.dangerBg : isLow ? C.warningBg : C.successBg;
        const stockLabel  = isOut ? 'نفاد' : isLow ? 'منخفض' : 'جيد';
        const stockVariant: 'danger' | 'warning' | 'success' = isOut ? 'danger' : isLow ? 'warning' : 'success';

        const expiryUrgent   = days !== null && days <= 7;
        const expiryWarning  = days !== null && days > 7 && days <= 30;

        const maxVisual   = Math.max(item.reorderLevel * 3, item.quantity, 1);
        const progress    = Math.min(item.quantity / maxVisual, 1);

        const isToggling  = togglingQuickSale === item.drugId;
        const isQuick     = item.drugId ? (quickSaleState[item.drugId] ?? false) : false;

        return (
            <View style={{ ...card(stockColor), marginBottom: 10, padding: 13 }}>
                {/* ── Row 1: name + restock + stock chip ── */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <View style={{ flex: 1, paddingLeft: 10 }}>
                        <Text
                            style={{ color: C.foreground, fontWeight: '800', fontSize: 15, textAlign: 'right' }}
                            numberOfLines={1}
                        >
                            {item.drugName}
                        </Text>
                        {item.barcode && (
                            <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                                {item.barcode}
                            </Text>
                        )}
                    </View>
                    {/* Stock chip */}
                    <View style={{ backgroundColor: stockBg, borderRadius: Radius.xs, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center' }}>
                        <Text style={{ color: stockColor, fontSize: 12, fontWeight: '800' }}>
                            {item.quantity}
                        </Text>
                        <Text style={{ color: stockColor, fontSize: 10, fontWeight: '600', opacity: 0.85 }}>
                            {stockLabel}
                        </Text>
                    </View>
                </View>

                {/* ── Progress bar ── */}
                <View style={{ marginBottom: 10 }}>
                    <View style={{ height: 5, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' }}>
                        <View style={{
                            width: `${Math.round(progress * 100)}%`,
                            height: '100%',
                            backgroundColor: stockColor,
                            borderRadius: 3,
                        }} />
                    </View>
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
                        <Text style={{ color: stockColor, fontSize: 11, fontWeight: '700' }}>
                            {item.quantity} وحدة
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 11 }}>
                            حد الطلب: {item.reorderLevel}
                        </Text>
                    </View>
                </View>

                {/* ── Bottom row: price + expiry + quick-sale ── */}
                <View style={{
                    flexDirection: 'row-reverse', justifyContent: 'space-between',
                    alignItems: 'center', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 9,
                }}>
                    <Text style={{ color: C.primary, fontWeight: '800', fontSize: 14 }}>
                        {item.price.toLocaleString('en-US')} <Text style={{ fontSize: 11, fontWeight: '600' }}>د.ع</Text>
                    </Text>

                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                        {/* Expiry badge — only if ≤ 30 days */}
                        {days !== null && days <= 30 && (
                            <View style={{
                                backgroundColor: expiryUrgent ? C.dangerBg : C.warningBg,
                                borderRadius: Radius.xs, paddingHorizontal: 7, paddingVertical: 3,
                                flexDirection: 'row-reverse', alignItems: 'center', gap: 3,
                            }}>
                                <Ionicons
                                    name="time-outline"
                                    size={10}
                                    color={expiryUrgent ? C.danger : C.warning}
                                />
                                <Text style={{
                                    color: expiryUrgent ? C.danger : C.warning,
                                    fontSize: 11, fontWeight: '700',
                                }}>
                                    {days}ي
                                </Text>
                            </View>
                        )}

                        {/* Quick-sale toggle */}
                        {item.drugId && (
                            <TouchableOpacity
                                onPress={() => handleQuickSaleToggle(item.drugId!)}
                                disabled={isToggling}
                                style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5, opacity: isToggling ? 0.5 : 1 }}
                                activeOpacity={0.75}
                            >
                                <Ionicons
                                    name="flash"
                                    size={12}
                                    color={isQuick ? '#f59e0b' : C.mutedForeground}
                                />
                                <View style={{
                                    width: 34, height: 19, borderRadius: 10,
                                    backgroundColor: isQuick ? '#f59e0b' : C.border,
                                    justifyContent: 'center', paddingHorizontal: 2,
                                }}>
                                    <View style={{
                                        width: 15, height: 15, borderRadius: 8, backgroundColor: '#fff',
                                        alignSelf: isQuick ? 'flex-end' : 'flex-start',
                                        elevation: 2,
                                        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2,
                                    }} />
                                </View>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        );
    };

    const inputStyle = {
        backgroundColor: C.input, borderRadius: 5, borderWidth: 1, borderColor: C.border,
        paddingHorizontal: 16, height: 50, marginBottom: 12, fontSize: 16,
        textAlign: 'right' as const, color: C.foreground,
    };

    const sectionLabelStyle = {
        color: C.mutedForeground, fontSize: 11, fontWeight: '700' as const,
        textAlign: 'right' as const, letterSpacing: 0.4, marginBottom: 8, marginTop: 6,
    };

    // Cost-per-strip derived from the packet calculator.
    const _pkt = parseFloat(packetPrice) || 0;
    const _strips = Math.max(1, parseInt(stripsPerPacket) || 1);
    const computedStripCost = _pkt > 0 ? _pkt / _strips : 0;

    // Inline hint under the quantity field: turns red and blocks the save when 0.
    const renderQtyHint = () => {
        const q = parseInt(formData.quantity) || 0;
        const bad = formData.quantity.trim().length > 0 && q <= 0;
        return (
            <Text style={{
                fontSize: 11, fontWeight: '600', textAlign: 'right', marginTop: -2, marginBottom: 8,
                color: bad ? C.danger : C.mutedForeground,
            }}>
                {bad ? '⚠ لا يُقبل الحفظ والكمية صفر' : '* الكمية مطلوبة ويجب أن تكون أكبر من صفر'}
            </Text>
        );
    };

    // Packet → strip cost calculator (mirrors the web inventory form).
    const renderCostCalculator = () => (
        <View>
            <Text style={sectionLabelStyle}>سعر التكلفة (من الباكيت)</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                <TextInput
                    style={[inputStyle, { flex: 1, marginBottom: 8 }]}
                    placeholder="سعر الباكيت" keyboardType="numeric" placeholderTextColor={C.mutedForeground}
                    value={packetPrice} onChangeText={setPacketPrice}
                />
                <TextInput
                    style={[inputStyle, { flex: 1, marginBottom: 8 }]}
                    placeholder="عدد الأشرطة" keyboardType="numeric" placeholderTextColor={C.mutedForeground}
                    value={stripsPerPacket} onChangeText={setStripsPerPacket}
                />
            </View>
            <View style={{
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: C.primaryMuted, borderRadius: 5, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12,
            }}>
                <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '600' }}>سعر التكلفة للشريط</Text>
                <Text style={{ color: C.primary, fontSize: 14, fontWeight: '800' }}>
                    {_pkt > 0 ? `${_pkt} ÷ ${_strips} = ${computedStripCost.toLocaleString('en', { maximumFractionDigits: 2 })}` : '—'}
                </Text>
            </View>
            {_pkt > 0 && _pkt < 125 ? (
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
                    backgroundColor: C.warningBg, borderRadius: 5, paddingHorizontal: 12, paddingVertical: 9, marginTop: -4, marginBottom: 12,
                }}>
                    <Ionicons name="warning-outline" size={14} color={C.warning} />
                    <Text style={{ color: C.warning, fontSize: 11, fontWeight: '700', flex: 1, textAlign: 'right' }}>
                        سعر الباكيت أقل من 125 دينار — سيظهر تأكيد عند الحفظ
                    </Text>
                </View>
            ) : null}
            {_strips > 20 ? (
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
                    backgroundColor: C.warningBg, borderRadius: 5, paddingHorizontal: 12, paddingVertical: 9, marginTop: -4, marginBottom: 12,
                }}>
                    <Ionicons name="warning-outline" size={14} color={C.warning} />
                    <Text style={{ color: C.warning, fontSize: 11, fontWeight: '700', flex: 1, textAlign: 'right' }}>
                        هذا الحقل هو عدد الأشرطة داخل الباكيت الواحد وليس إجمالي الأشرطة — سيظهر تأكيد عند الحفظ
                    </Text>
                </View>
            ) : null}
        </View>
    );

    // Branded modal action row: prominent primary save + outline cancel (radius 5).
    const renderModalActions = (
        saveLabel: string,
        saveIcon: keyof typeof Ionicons.glyphMap,
        onSave: () => void,
        onCancel: () => void,
    ) => (
        <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 8, paddingBottom: 24 }}>
            <TouchableOpacity
                onPress={onSave}
                disabled={modalLoading}
                activeOpacity={0.85}
                style={{
                    flex: 2, height: 50, borderRadius: 5, backgroundColor: C.primary,
                    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: modalLoading ? 0.6 : 1,
                    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
                }}
            >
                {modalLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                ) : (
                    <>
                        <Ionicons name={saveIcon} size={18} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>{saveLabel}</Text>
                    </>
                )}
            </TouchableOpacity>
            <TouchableOpacity
                onPress={onCancel}
                disabled={modalLoading}
                activeOpacity={0.7}
                style={{
                    flex: 1, height: 50, borderRadius: 5,
                    borderWidth: 1.5, borderColor: C.border,
                    alignItems: 'center', justifyContent: 'center',
                }}
            >
                <Text style={{ color: C.mutedForeground, fontSize: 15, fontWeight: '700' }}>إلغاء</Text>
            </TouchableOpacity>
        </View>
    );

    // Secondary controls that scroll WITH the list (branch + offline only).
    const listHeaderEl = (
        <View>
            {/* Branch selector */}
            {isAdmin && (
                <BranchSelector
                    selectedBranchId={selectedBranch}
                    onSelectBranch={setSelectedBranch}
                    hideIfSingle
                    accent={C.primary}
                    accentMuted={C.primaryMuted}
                />
            )}

            {/* Offline banner */}
            {!isOnline && (
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center',
                    backgroundColor: C.dangerBg, borderRadius: Radius.xs,
                    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10, gap: 6,
                }}>
                    <Ionicons name="cloud-offline" size={14} color={C.danger} />
                    <Text style={{ color: C.danger, fontSize: 12, fontWeight: '700' }}>وضع عدم الاتصال</Text>
                </View>
            )}
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>

            {/* ── Pinned header ──────────────────────────────────────────────── */}
            <View style={{ backgroundColor: C.background, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>

                {/* Title row */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '900', textAlign: 'right' }}>
                        المخزون الدوائي
                    </Text>
                    {/* Refresh icon */}
                    <TouchableOpacity
                        onPress={onRefresh}
                        style={{ backgroundColor: C.primaryMuted, borderRadius: Radius.xs, padding: 10 }}
                        activeOpacity={0.75}
                    >
                        <Ionicons name="refresh" size={20} color={C.primary} />
                    </TouchableOpacity>
                </View>

                {/* Compact inventory value summary (pinned, single thin row) */}
                <View style={{ ...card(C.primary), flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 14, marginBottom: 10 }}>
                    <View style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 7 }}>
                        <Ionicons name="wallet-outline" size={16} color={C.primary} />
                        <Text style={{ color: C.mutedForeground, fontSize: 11.5, fontWeight: '600' }}>قيمة المخزون</Text>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 2 }}>
                            <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '900' }}>{abbrNum(totalValue)}</Text>
                            <Text style={{ color: C.mutedForeground, fontSize: 10, fontWeight: '700' }}>د.ع</Text>
                        </View>
                    </View>
                    <View style={{ width: 1, height: 18, backgroundColor: C.border, marginHorizontal: 12 }} />
                    <View style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 7 }}>
                        <Ionicons name="cube-outline" size={16} color={C.primary} />
                        <Text style={{ color: C.mutedForeground, fontSize: 11.5, fontWeight: '600' }}>الأصناف</Text>
                        <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '900' }}>{counts.all.toLocaleString('en-US')}</Text>
                    </View>
                </View>

                {/* Search + sort row */}
                <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 10 }}>
                    <View style={{
                        flex: 1,
                        flexDirection: 'row-reverse', alignItems: 'center',
                        backgroundColor: C.input, borderRadius: Radius.xs,
                        borderWidth: 1, borderColor: C.border,
                        paddingHorizontal: 12, gap: 8,
                    }}>
                        <Ionicons name="search" size={18} color={C.mutedForeground} />
                        <TextInput
                            style={{ flex: 1, color: C.foreground, paddingVertical: 11, textAlign: 'right', fontSize: 14 }}
                            placeholder="ابحث عن دواء أو باركود..."
                            placeholderTextColor={C.mutedForeground}
                            value={search}
                            onChangeText={setSearch}
                        />
                        {search.length > 0 && (
                            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} activeOpacity={0.7}>
                                <Ionicons name="close-circle" size={18} color={C.mutedForeground} />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            onPress={() => router.push({ pathname: '/scan', params: { from: 'inventory' } })}
                            style={{ backgroundColor: C.primaryMuted, borderRadius: Radius.xs, padding: 6 }}
                            activeOpacity={0.75}
                        >
                            <Ionicons name="scan-outline" size={20} color={C.primary} />
                        </TouchableOpacity>
                    </View>
                    {/* Sort button — opens the sort menu */}
                    <TouchableOpacity
                        onPress={() => {
                            setShowSortMenu(true);
                            sortSheetY.setValue(400);
                            Animated.spring(sortSheetY, { toValue: 0, useNativeDriver: false, bounciness: 2 }).start();
                        }}
                        activeOpacity={0.8}
                        style={{ width: 48, borderRadius: Radius.xs, backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Ionicons name="swap-vertical" size={20} color={C.primary} />
                    </TouchableOpacity>
                </View>

                {/* Tab pills with count badges */}
                <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 10 }}>
                    {TABS.map(tab => {
                        const active = activeTab === tab.key;
                        const count  = counts[tab.key as keyof typeof counts] ?? 0;
                        return (
                            <TouchableOpacity
                                key={tab.key}
                                onPress={() => setActiveTab(tab.key)}
                                activeOpacity={0.8}
                                style={{
                                    flex: 1,
                                    flexDirection: 'row-reverse',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    paddingVertical: 9,
                                    borderRadius: 5,
                                    backgroundColor: active ? C.primary : C.card,
                                    borderWidth: 1.5,
                                    borderColor: active ? C.primary : C.border,
                                }}
                            >
                                <Text style={{ color: active ? '#fff' : C.foreground, fontSize: 13, fontWeight: '700' }}>
                                    {tab.label}
                                </Text>
                                {!loading && count > 0 && (
                                    <View style={{
                                        backgroundColor: active ? 'rgba(255,255,255,0.25)' : C.primaryMuted,
                                        borderRadius: 10, minWidth: 20, paddingHorizontal: 5, paddingVertical: 1,
                                        alignItems: 'center',
                                    }}>
                                        <Text style={{ color: active ? '#fff' : C.primary, fontSize: 11, fontWeight: '800' }}>
                                            {count}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

            </View>

            {/* ── Drug list ───────────────────────────────────────────────────── */}
            {loading && !refreshing ? (
                <View style={{ padding: 16, gap: 10 }}>
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height={130} radius={5} />)}
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    <FlatList
                        data={sorted}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        ListHeaderComponent={listHeaderEl}
                        contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 110 }}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                        removeClippedSubviews
                        maxToRenderPerBatch={12}
                        windowSize={8}
                        initialNumToRender={12}
                        ListEmptyComponent={
                            !isSorting ? (
                                <EmptyState
                                    icon="cube-outline"
                                    title="لا توجد عناصر"
                                    subtitle={
                                        search ? 'لا توجد نتائج للبحث' :
                                        activeTab === 'low-stock'   ? 'المخزون بمستويات جيدة' :
                                        activeTab === 'near-expiry' ? 'لا توجد أدوية تقترب من انتهاء الصلاحية' :
                                        'لا توجد أصناف نفد مخزونها'
                                    }
                                />
                            ) : null
                        }
                    />
                    {/* Sorting overlay — fades the list while sort runs */}
                    {isSorting && (
                        <View style={{
                            ...StyleSheet.absoluteFillObject,
                            backgroundColor: isDarkMode ? 'rgba(24,22,20,0.55)' : 'rgba(250,250,248,0.55)',
                            justifyContent: 'center', alignItems: 'center',
                        }}>
                            <View style={{
                                backgroundColor: C.card, borderRadius: 14,
                                paddingHorizontal: 28, paddingVertical: 18,
                                alignItems: 'center', gap: 10,
                                borderWidth: 1, borderColor: C.border,
                                shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
                            }}>
                                <ActivityIndicator size="large" color={C.primary} />
                                <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '700' }}>
                                    جاري الترتيب...
                                </Text>
                            </View>
                        </View>
                    )}
                </View>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                MODALS — untouched logic, preserved exactly
            ══════════════════════════════════════════════════════════════════ */}

            {/* Add Batch Modal */}
            <Modal visible={!!showBatchModal} transparent animationType="slide" onRequestClose={() => setShowBatchModal(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <ScrollView style={{ backgroundColor: C.card, borderTopLeftRadius: 5, borderTopRightRadius: 5, maxHeight: '90%' }} contentContainerStyle={{ padding: 20 }}>
                        <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 5, alignSelf: 'center', marginBottom: 16 }} />
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                            <View style={{ width: 44, height: 44, borderRadius: 5, backgroundColor: C.primaryMuted, justifyContent: 'center', alignItems: 'center' }}>
                                <Ionicons name="layers-outline" size={22} color={C.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '800', textAlign: 'right' }}>إضافة دفعة جديدة</Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>{showBatchModal?.drug?.tradeName}</Text>
                            </View>
                        </View>
                        <Text style={sectionLabelStyle}>تفاصيل الدفعة</Text>
                        <TextInput style={inputStyle} placeholder="الكمية *" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.quantity} onChangeText={t => setFormData(f => ({ ...f, quantity: t }))} />
                        {renderQtyHint()}
                        {renderCostCalculator()}
                        <TextInput style={inputStyle} placeholder="تاريخ الصلاحية (YYYY-MM-DD) *" keyboardType="numeric" maxLength={10} placeholderTextColor={C.mutedForeground} value={formData.expiryDate} onChangeText={t => setFormData(f => ({ ...f, expiryDate: formatExpiry(t) }))} />
                        <TouchableOpacity
                            onPress={() => { setSupplierPickerContext('batch'); setShowSupplierPicker(true); }}
                            style={[inputStyle, { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }]}
                        >
                            <Text style={{ color: selectedSupplierId ? C.foreground : C.mutedForeground, fontSize: 14 }}>
                                {selectedSupplierId ? (suppliers.find(s => s.id === selectedSupplierId)?.name ?? 'مورد محدد') : 'المورد (اختياري)'}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color={C.mutedForeground} />
                        </TouchableOpacity>
                        {renderModalActions('حفظ', 'save-outline', handleAddBatch, () => setShowBatchModal(null))}
                    </ScrollView>
                </View>
            </Modal>

            {/* Add to Branch Modal */}
            <Modal visible={!!showBranchModal} transparent animationType="slide" onRequestClose={() => setShowBranchModal(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <ScrollView style={{ backgroundColor: C.card, borderTopLeftRadius: 5, borderTopRightRadius: 5, maxHeight: '90%' }} contentContainerStyle={{ padding: 20 }}>
                        <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 5, alignSelf: 'center', marginBottom: 16 }} />
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                            <View style={{ width: 44, height: 44, borderRadius: 5, backgroundColor: C.primaryMuted, justifyContent: 'center', alignItems: 'center' }}>
                                <Ionicons name="cube-outline" size={22} color={C.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '800', textAlign: 'right' }}>إضافة الدواء للمخزون</Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>{showBranchModal?.tradeName}</Text>
                            </View>
                        </View>
                        <Text style={sectionLabelStyle}>التسعير والحدود</Text>
                        <TextInput style={inputStyle} placeholder="سعر البيع" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.price} onChangeText={t => setFormData(f => ({ ...f, price: t }))} />
                        <TextInput style={inputStyle} placeholder="حد النواقص" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.minStock} onChangeText={t => setFormData(f => ({ ...f, minStock: t }))} />
                        {renderCostCalculator()}
                        <Text style={sectionLabelStyle}>المخزون الأولي</Text>
                        <TextInput style={inputStyle} placeholder="الكمية" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.quantity} onChangeText={t => setFormData(f => ({ ...f, quantity: t }))} />
                        {renderQtyHint()}
                        <TextInput style={inputStyle} placeholder="تاريخ الصلاحية (YYYY-MM-DD)" keyboardType="numeric" maxLength={10} placeholderTextColor={C.mutedForeground} value={formData.expiryDate} onChangeText={t => setFormData(f => ({ ...f, expiryDate: formatExpiry(t) }))} />
                        <TouchableOpacity
                            onPress={() => { setSupplierPickerContext('branch'); setShowSupplierPicker(true); }}
                            style={[inputStyle, { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }]}
                        >
                            <Text style={{ color: selectedSupplierId ? C.foreground : C.mutedForeground, fontSize: 14 }}>
                                {selectedSupplierId ? (suppliers.find(s => s.id === selectedSupplierId)?.name ?? 'مورد محدد') : 'المورد (اختياري)'}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color={C.mutedForeground} />
                        </TouchableOpacity>
                        {renderModalActions('تنشيط وحفظ', 'checkmark-circle-outline', handleAddToBranch, () => setShowBranchModal(null))}
                    </ScrollView>
                </View>
            </Modal>

            {/* Create Drug Modal */}
            <Modal visible={!!showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <ScrollView style={{ backgroundColor: C.card, borderTopLeftRadius: 5, borderTopRightRadius: 5, maxHeight: '90%' }} contentContainerStyle={{ padding: 20 }}>
                        <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 5, alignSelf: 'center', marginBottom: 16 }} />
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                            <View style={{ width: 44, height: 44, borderRadius: 5, backgroundColor: C.primaryMuted, justifyContent: 'center', alignItems: 'center' }}>
                                <Ionicons name="medkit-outline" size={22} color={C.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '800', textAlign: 'right' }}>تسجيل دواء جديد</Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>الباركود: {showCreateModal}</Text>
                            </View>
                        </View>
                        <Text style={sectionLabelStyle}>معلومات الدواء</Text>
                        <TextInput style={inputStyle} placeholder="الاسم التجاري *" placeholderTextColor={C.mutedForeground} value={formData.tradeName} onChangeText={t => setFormData(f => ({ ...f, tradeName: t }))} />
                        <TextInput style={inputStyle} placeholder="الاسم العلمي" placeholderTextColor={C.mutedForeground} value={formData.scientificName} onChangeText={t => setFormData(f => ({ ...f, scientificName: t }))} />
                        <Text style={sectionLabelStyle}>التسعير والحدود</Text>
                        <TextInput style={inputStyle} placeholder="سعر البيع *" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.price} onChangeText={t => setFormData(f => ({ ...f, price: t }))} />
                        <TextInput style={inputStyle} placeholder="حد النواقص" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.minStock} onChangeText={t => setFormData(f => ({ ...f, minStock: t }))} />
                        {renderCostCalculator()}
                        <TouchableOpacity
                            onPress={() => { setSupplierPickerContext('create'); setShowSupplierPicker(true); }}
                            style={[inputStyle, { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }]}
                        >
                            <Text style={{ color: selectedSupplierId ? C.foreground : C.mutedForeground, fontSize: 14 }}>
                                {selectedSupplierId ? (suppliers.find(s => s.id === selectedSupplierId)?.name ?? 'مورد محدد') : 'المورد (اختياري)'}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color={C.mutedForeground} />
                        </TouchableOpacity>
                        <Text style={sectionLabelStyle}>المخزون الأولي</Text>
                        <TextInput style={inputStyle} placeholder="الكمية *" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.quantity} onChangeText={t => setFormData(f => ({ ...f, quantity: t }))} />
                        {renderQtyHint()}
                        <TextInput style={inputStyle} placeholder="تاريخ الصلاحية (YYYY-MM-DD) *" keyboardType="numeric" maxLength={10} placeholderTextColor={C.mutedForeground} value={formData.expiryDate} onChangeText={t => setFormData(f => ({ ...f, expiryDate: formatExpiry(t) }))} />
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, marginVertical: 4 }}>
                            <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '600' }}>بيع سريع ⚡</Text>
                            <TouchableOpacity
                                onPress={() => setIsQuickSale(v => !v)}
                                style={{
                                    width: 36, height: 20, borderRadius: 10,
                                    backgroundColor: isQuickSale ? '#f59e0b' : C.border,
                                    justifyContent: 'center', paddingHorizontal: 2,
                                }}
                                activeOpacity={0.8}
                            >
                                <View style={{
                                    width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff',
                                    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
                                    alignSelf: isQuickSale ? 'flex-end' : 'flex-start',
                                }} />
                            </TouchableOpacity>
                        </View>
                        {renderModalActions('حفظ', 'save-outline', handleCreateDrug, () => setShowCreateModal(null))}
                    </ScrollView>
                </View>
            </Modal>

            {/* Supplier picker modal */}
            <Modal visible={showSupplierPicker} transparent animationType="slide" onRequestClose={() => setShowSupplierPicker(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: C.card, borderTopLeftRadius: 5, borderTopRightRadius: 5, padding: 20, maxHeight: '70%' }}>
                        <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
                        <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '700', textAlign: 'right', marginBottom: 12 }}>اختر مورداً</Text>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.input, borderRadius: 5, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, marginBottom: 12, gap: 8 }}>
                            <Ionicons name="search" size={16} color={C.mutedForeground} />
                            <TextInput
                                style={{ flex: 1, color: C.foreground, paddingVertical: 8, textAlign: 'right', fontSize: 14 }}
                                placeholder="بحث..."
                                placeholderTextColor={C.mutedForeground}
                                value={supplierSearch}
                                onChangeText={setSupplierSearch}
                            />
                        </View>
                        <TouchableOpacity
                            onPress={() => { setSelectedSupplierId(null); setShowSupplierPicker(false); setSupplierSearch(''); }}
                            style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}
                        >
                            <Text style={{ color: C.mutedForeground, textAlign: 'right', fontSize: 14 }}>بدون مورد</Text>
                        </TouchableOpacity>
                        <FlatList
                            data={suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))}
                            keyExtractor={s => s.id}
                            renderItem={({ item: s }) => (
                                <TouchableOpacity
                                    onPress={() => { setSelectedSupplierId(s.id); setShowSupplierPicker(false); setSupplierSearch(''); }}
                                    style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}
                                >
                                    <Text style={{ color: C.foreground, fontWeight: '600', textAlign: 'right' }}>{s.name}</Text>
                                    {selectedSupplierId === s.id && <Ionicons name="checkmark" size={18} color={C.primary} />}
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={<Text style={{ color: C.mutedForeground, textAlign: 'center', paddingVertical: 20 }}>لا يوجد موردون</Text>}
                        />
                    </View>
                </View>
            </Modal>

            {/* ── Sort menu ──────────────────────────────────────────────────── */}
            {showSortMenu && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000 }}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} activeOpacity={1} onPress={() => setShowSortMenu(false)} />
                <Animated.View
                    {...sortPan.panHandlers}
                    style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        backgroundColor: C.card, borderTopLeftRadius: Radius.md, borderTopRightRadius: Radius.md,
                        paddingHorizontal: 20, paddingBottom: 32,
                        borderTopWidth: 1, borderColor: C.border,
                        transform: [{ translateY: sortSheetY }],
                    }}
                >
                    {/* Drag the sheet down to dismiss */}
                    <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 14 }}>
                        <View style={{ width: 44, height: 5, backgroundColor: C.border, borderRadius: 3 }} />
                    </View>
                    <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right', marginBottom: 12 }}>ترتيب حسب</Text>
                    {SORTS.map(s => {
                        const active = sortKey === s.key;
                        return (
                            <TouchableOpacity
                                key={s.key}
                                onPress={() => {
                                    if (sortKey === s.key) setSortAsc(v => !v);
                                    else { setSortKey(s.key); setSortAsc(true); }
                                    setShowSortMenu(false);
                                }}
                                activeOpacity={0.7}
                                style={{
                                    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                                    paddingVertical: 13, paddingHorizontal: 14, borderRadius: Radius.xs, marginBottom: 8,
                                    backgroundColor: active ? C.primaryMuted : 'transparent',
                                    borderWidth: 1, borderColor: active ? C.primary : C.border,
                                }}
                            >
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                                    <Ionicons name={s.icon} size={18} color={active ? C.primary : C.mutedForeground} />
                                    <Text style={{ color: active ? C.primary : C.foreground, fontSize: 14, fontWeight: active ? '800' : '500' }}>{s.label}</Text>
                                </View>
                                {active && (
                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
                                        <Ionicons name={sortAsc ? 'arrow-up' : 'arrow-down'} size={15} color={C.primary} />
                                        <Text style={{ color: C.primary, fontSize: 11, fontWeight: '700' }}>{sortAsc ? 'تصاعدي' : 'تنازلي'}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </Animated.View>
              </View>
            )}
        </View>
    );
}
