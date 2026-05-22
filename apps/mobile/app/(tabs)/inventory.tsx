import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    RefreshControl, ActivityIndicator, Alert, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { apiService } from '../../services/api';
import { dbService } from '../../services/db';
import { syncService } from '../../services/sync';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { BranchSelector } from '../../components/BranchSelector';
import { useSyncStatus } from '../../context/SyncContext';

type TabKey = 'all' | 'low-stock' | 'expiring';

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
    { key: 'all', label: 'الكل' },
    { key: 'low-stock', label: 'نواقص' },
    { key: 'expiring', label: 'قارب الانتهاء' },
];

function getDaysToExpiry(expiryDate?: string): number | null {
    if (!expiryDate) return null;
    const diff = new Date(expiryDate).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function InventoryScreen() {
    const { isDarkMode } = useTheme();
    const { isAdmin, branchId: authBranchId } = useAuth();
    const { triggerSync } = useSyncStatus();
    const C = Colors(isDarkMode);

    const [items, setItems] = useState<InventoryItem[]>([]);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<TabKey>('all');
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
    const [isOnline, setIsOnline] = useState(true);

    // Modal states (preserved)
    const [showBatchModal, setShowBatchModal] = useState<any | null>(null);
    const [showBranchModal, setShowBranchModal] = useState<any | null>(null);
    const [showCreateModal, setShowCreateModal] = useState<string | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [formData, setFormData] = useState({
        tradeName: '', scientificName: '', price: '', costPrice: '',
        minStock: '5', maxStock: '100', quantity: '', expiryDate: '', batchNumber: '',
    });
    const [isQuickSale, setIsQuickSale] = useState(false);
    const [quickSaleState, setQuickSaleState] = useState<Record<string, boolean>>({});
    const [togglingQuickSale, setTogglingQuickSale] = useState<string | null>(null);

    // Supplier picker state (shared across all modals)
    const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
    const [showSupplierPicker, setShowSupplierPicker] = useState(false);
    const [supplierSearch, setSupplierSearch] = useState('');
    // Which modal triggered the supplier picker ('batch' | 'branch' | 'create')
    const [supplierPickerContext, setSupplierPickerContext] = useState<'batch' | 'branch' | 'create'>('create');

    const params = useLocalSearchParams();

    // Auto-set branch for pharmacist
    useEffect(() => {
        if (!isAdmin && authBranchId) setSelectedBranch(authBranchId);
    }, [isAdmin, authBranchId]);

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const online = await syncService.isOnline();
            setIsOnline(online);
            if (online) {
                // Pharmacists are always scoped to their own branch.
                // Admins can browse any branch via the BranchSelector (selectedBranch).
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

    // Load suppliers when any modal that needs them opens
    useEffect(() => {
        if (showBatchModal || showBranchModal || showCreateModal) {
            apiService.getSuppliers().then(setSuppliers).catch(() => {});
        }
    }, [!!showBatchModal, !!showBranchModal, !!showCreateModal]);

    // Reset supplier selection when all modals close
    useEffect(() => {
        if (!showBatchModal && !showBranchModal && !showCreateModal) {
            setSelectedSupplierId(null);
            setSupplierSearch('');
        }
    }, [showBatchModal, showBranchModal, showCreateModal]);

    // Barcode scan return handler
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

    // Modal handlers (preserved)
    const handleAddBatch = async () => {
        if (!formData.quantity || !formData.expiryDate) {
            Alert.alert('تنبيه', 'يرجى ملء كافة الحقول الأساسية'); return;
        }
        setModalLoading(true);
        try {
            await apiService.addBatch({
                inventoryId: showBatchModal.id,
                quantity: parseInt(formData.quantity) || 0,
                costPrice: parseFloat(formData.costPrice) || 0,
                expiryDate: formData.expiryDate + 'T00:00:00.000Z',
                supplierId: selectedSupplierId || null,
            });
            setShowBatchModal(null);
            setFormData(f => ({ ...f, quantity: '', expiryDate: '', costPrice: '' }));
            fetchInventory();
        } catch { Alert.alert('خطأ', 'فشل إضافة الجرعة'); }
        finally { setModalLoading(false); }
    };

    const handleAddToBranch = async () => {
        if (!formData.price || !formData.quantity || !formData.expiryDate) {
            Alert.alert('تنبيه', 'يرجى ملء كافة الحقول الأساسية'); return;
        }
        setModalLoading(true);
        try {
            await apiService.addToBranch({
                drugId: showBranchModal.id, branchId: selectedBranch!,
                price: parseFloat(formData.price) || 0,
                cost: parseFloat(formData.costPrice) || 0,
                minStock: parseInt(formData.minStock) || 5,
                maxStock: parseInt(formData.maxStock) || 100,
                quantity: parseInt(formData.quantity) || 0,
                expiryDate: formData.expiryDate + 'T00:00:00.000Z',
                supplierId: selectedSupplierId || null,
            });
            setShowBranchModal(null);
            setFormData({ tradeName: '', scientificName: '', price: '', costPrice: '', minStock: '5', maxStock: '100', quantity: '', expiryDate: '', batchNumber: '' });
            fetchInventory();
        } catch { Alert.alert('خطأ', 'فشل إضافة الدواء للفرع'); }
        finally { setModalLoading(false); }
    };

    const handleCreateDrug = async () => {
        if (!formData.tradeName || !formData.price || !formData.quantity || !formData.expiryDate) {
            Alert.alert('تنبيه', 'يرجى ملء الحقول الأساسية'); return;
        }
        setModalLoading(true);
        try {
            await apiService.createQuickDrug({
                barcode: showCreateModal!, tradeName: formData.tradeName,
                scientificName: formData.scientificName, drugType: 'Tablet', dosage: 'Custom',
                unit: 'Box', category: 'General', manufacturer: 'Unknown', country: 'Unknown',
                branchId: selectedBranch!, price: parseFloat(formData.price) || 0,
                costPrice: parseFloat(formData.costPrice) || 0,
                minStock: parseInt(formData.minStock) || 5, maxStock: parseInt(formData.maxStock) || 100,
                quantity: parseInt(formData.quantity) || 0,
                expiryDate: formData.expiryDate + 'T00:00:00.000Z',
                supplierId: selectedSupplierId || null,
                isQuickSale,
            });
            setShowCreateModal(null);
            setIsQuickSale(false);
            setFormData({ tradeName: '', scientificName: '', price: '', costPrice: '', minStock: '5', maxStock: '100', quantity: '', expiryDate: '', batchNumber: '' });
            fetchInventory();
        } catch { Alert.alert('خطأ', 'فشل تسجيل الدواء الجديد'); }
        finally { setModalLoading(false); }
    };

    // Filter pipeline
    const filtered = items
        .filter(i => {
            const q = search.toLowerCase();
            return !q || i.drugName.toLowerCase().includes(q) || (i.barcode?.includes(search) ?? false);
        })
        .filter(i => {
            if (activeTab === 'low-stock') return i.quantity > 0 && i.quantity <= i.reorderLevel;
            if (activeTab === 'expiring') {
                const days = getDaysToExpiry(i.expiryDate);
                return days !== null && days <= 30 && days >= 0;
            }
            return true;
        });

    const stockBadge = (item: InventoryItem): { label: string; variant: 'success' | 'warning' | 'danger' } => {
        if (item.quantity === 0) return { label: 'نفاد المخزون', variant: 'danger' };
        if (item.quantity <= item.reorderLevel) return { label: `${item.quantity} — منخفض`, variant: 'warning' };
        return { label: `${item.quantity} — جيد`, variant: 'success' };
    };

    const renderItem = ({ item }: { item: InventoryItem }) => {
        const { label, variant } = stockBadge(item);
        const days = getDaysToExpiry(item.expiryDate);
        const expiryVariant = days !== null && days <= 7 ? 'danger' as const : days !== null && days <= 30 ? 'warning' as const : 'info' as const;

        return (
            <Card className="mb-3">
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <View style={{ flex: 1, paddingLeft: 8 }}>
                        <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 15, textAlign: 'right' }}>{item.drugName}</Text>
                        <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13, textAlign: 'right', marginTop: 3 }}>
                            {item.price.toLocaleString()} د.ع
                        </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <Badge label={label} variant={variant} />
                        {days !== null && (
                            <Badge label={`${days} يوم للانتهاء`} variant={expiryVariant} />
                        )}
                    </View>
                </View>
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 12 }}>حد الطلب: {item.reorderLevel}</Text>
                        {item.barcode && (
                            <Text style={{ color: C.mutedForeground, fontSize: 12 }}>{item.barcode}</Text>
                        )}
                    </View>
                    {item.drugId && (
                        <TouchableOpacity
                            onPress={() => handleQuickSaleToggle(item.drugId!)}
                            disabled={togglingQuickSale === item.drugId}
                            style={{
                                flexDirection: 'row', alignItems: 'center', gap: 4,
                                opacity: togglingQuickSale === item.drugId ? 0.5 : 1,
                            }}
                        >
                            <Text style={{ color: C.mutedForeground, fontSize: 11 }}>⚡</Text>
                            <View style={{
                                width: 32, height: 18, borderRadius: 9,
                                backgroundColor: quickSaleState[item.drugId] ? '#f59e0b' : C.border,
                                justifyContent: 'center', paddingHorizontal: 2,
                            }}>
                                <View style={{
                                    width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff',
                                    alignSelf: quickSaleState[item.drugId] ? 'flex-end' : 'flex-start',
                                    elevation: 2,
                                }} />
                            </View>
                        </TouchableOpacity>
                    )}
                </View>
            </Card>
        );
    };

    const inputStyle = {
        backgroundColor: C.input, borderRadius: 6, borderWidth: 1, borderColor: C.border,
        paddingHorizontal: 16, height: 50, marginBottom: 12, fontSize: 16,
        textAlign: 'right' as const, color: C.foreground,
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {/* Pinned header */}
            <View style={{ backgroundColor: C.background, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                {isAdmin && (
                    <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} />
                )}

                {!isOnline && (
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.dangerBg, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10, gap: 6 }}>
                        <Ionicons name="cloud-offline" size={14} color={C.danger} />
                        <Text style={{ color: C.danger, fontSize: 12, fontWeight: '700' }}>وضع عدم الاتصال</Text>
                    </View>
                )}

                {/* Search bar */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.input, borderRadius: 6, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, marginBottom: 10, gap: 8 }}>
                    <Ionicons name="search" size={18} color={C.mutedForeground} />
                    <TextInput
                        style={{ flex: 1, color: C.foreground, paddingVertical: 10, textAlign: 'right', fontSize: 14 }}
                        placeholder="ابحث عن دواء أو باركود..."
                        placeholderTextColor={C.mutedForeground}
                        value={search}
                        onChangeText={setSearch}
                    />
                    <TouchableOpacity onPress={() => router.push({ pathname: '/scan', params: { from: 'inventory' } })}>
                        <Ionicons name="scan-outline" size={22} color={C.primary} />
                    </TouchableOpacity>
                </View>

                {/* Tab filter pills */}
                <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 6 }}>
                    {TABS.map(tab => {
                        const active = activeTab === tab.key;
                        return (
                            <TouchableOpacity
                                key={tab.key}
                                onPress={() => setActiveTab(tab.key)}
                                style={{
                                    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 4,
                                    backgroundColor: active ? C.primary : C.card,
                                    borderWidth: 1, borderColor: active ? C.primary : C.border,
                                }}
                            >
                                <Text style={{ color: active ? '#fff' : C.mutedForeground, fontSize: 13, fontWeight: '600' }}>
                                    {tab.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Summary counts */}
                {!loading && (
                    <View style={{ flexDirection: 'row-reverse', gap: 10, paddingBottom: 6 }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 12 }}>{filtered.length} عنصر</Text>
                        {activeTab === 'all' && (
                            <>
                                <Text style={{ color: C.mutedForeground, fontSize: 12 }}>·</Text>
                                <Text style={{ color: C.warning, fontSize: 12 }}>
                                    {items.filter(i => i.quantity <= i.reorderLevel && i.quantity > 0).length} نواقص
                                </Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12 }}>·</Text>
                                <Text style={{ color: C.danger, fontSize: 12 }}>
                                    {items.filter(i => i.quantity === 0).length} نفاد
                                </Text>
                            </>
                        )}
                    </View>
                )}
            </View>

            {/* Drug list */}
            {loading && !refreshing ? (
                <View style={{ padding: 16, gap: 10 }}>
                    {[1, 2, 3, 4, 5].map(i => (
                        <Skeleton key={i} height={72} radius={8} />
                    ))}
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: 110 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                    ListEmptyComponent={
                        <EmptyState
                            icon="cube-outline"
                            title="لا توجد عناصر"
                            subtitle={
                                search ? 'لا توجد نتائج للبحث' :
                                activeTab === 'low-stock' ? 'المخزون بمستويات جيدة' :
                                'لا توجد أدوية قاربت الانتهاء'
                            }
                        />
                    }
                />
            )}

            {/* Add Batch Modal */}
            <Modal visible={!!showBatchModal} transparent animationType="slide" onRequestClose={() => setShowBatchModal(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <ScrollView style={{ backgroundColor: C.card, borderTopLeftRadius: 12, borderTopRightRadius: 12 }} contentContainerStyle={{ padding: 24 }}>
                        <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '800', textAlign: 'right', marginBottom: 16 }}>
                            إضافة دفعة: {showBatchModal?.drug?.tradeName}
                        </Text>
                        <TextInput style={inputStyle} placeholder="الكمية *" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.quantity} onChangeText={t => setFormData(f => ({ ...f, quantity: t }))} />
                        <TextInput style={inputStyle} placeholder="سعر التكلفة" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.costPrice} onChangeText={t => setFormData(f => ({ ...f, costPrice: t }))} />
                        <TextInput style={inputStyle} placeholder="تاريخ الصلاحية (YYYY-MM-DD) *" placeholderTextColor={C.mutedForeground} value={formData.expiryDate} onChangeText={t => setFormData(f => ({ ...f, expiryDate: t }))} />
                        <TouchableOpacity
                            onPress={() => { setSupplierPickerContext('batch'); setShowSupplierPicker(true); }}
                            style={[inputStyle, { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }]}
                        >
                            <Text style={{ color: selectedSupplierId ? C.foreground : C.mutedForeground, fontSize: 14 }}>
                                {selectedSupplierId ? (suppliers.find(s => s.id === selectedSupplierId)?.name ?? 'مورد محدد') : 'المورد (اختياري)'}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color={C.mutedForeground} />
                        </TouchableOpacity>
                        <View style={{ gap: 8, marginTop: 4, paddingBottom: 24 }}>
                            <Button label="حفظ" loading={modalLoading} onPress={handleAddBatch} />
                            <Button label="إلغاء" variant="ghost" onPress={() => setShowBatchModal(null)} />
                        </View>
                    </ScrollView>
                </View>
            </Modal>

            {/* Add to Branch Modal */}
            <Modal visible={!!showBranchModal} transparent animationType="slide" onRequestClose={() => setShowBranchModal(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <ScrollView style={{ backgroundColor: C.card, borderTopLeftRadius: 12, borderTopRightRadius: 12 }} contentContainerStyle={{ padding: 24 }}>
                        <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '800', textAlign: 'right', marginBottom: 16 }}>
                            تنشيط دواء: {showBranchModal?.tradeName}
                        </Text>
                        <TextInput style={inputStyle} placeholder="سعر البيع" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.price} onChangeText={t => setFormData(f => ({ ...f, price: t }))} />
                        <TextInput style={inputStyle} placeholder="سعر التكلفة" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.costPrice} onChangeText={t => setFormData(f => ({ ...f, costPrice: t }))} />
                        <TextInput style={inputStyle} placeholder="حد النواقص" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.minStock} onChangeText={t => setFormData(f => ({ ...f, minStock: t }))} />
                        <View style={{ height: 1, backgroundColor: C.border, marginVertical: 8 }} />
                        <TextInput style={inputStyle} placeholder="الكمية" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.quantity} onChangeText={t => setFormData(f => ({ ...f, quantity: t }))} />
                        <TextInput style={inputStyle} placeholder="تاريخ الصلاحية (YYYY-MM-DD)" placeholderTextColor={C.mutedForeground} value={formData.expiryDate} onChangeText={t => setFormData(f => ({ ...f, expiryDate: t }))} />
                        <TouchableOpacity
                            onPress={() => { setSupplierPickerContext('branch'); setShowSupplierPicker(true); }}
                            style={[inputStyle, { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }]}
                        >
                            <Text style={{ color: selectedSupplierId ? C.foreground : C.mutedForeground, fontSize: 14 }}>
                                {selectedSupplierId ? (suppliers.find(s => s.id === selectedSupplierId)?.name ?? 'مورد محدد') : 'المورد (اختياري)'}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color={C.mutedForeground} />
                        </TouchableOpacity>
                        <View style={{ gap: 8, marginTop: 4, paddingBottom: 24 }}>
                            <Button label="تنشيط وإضافة" loading={modalLoading} onPress={handleAddToBranch} />
                            <Button label="إلغاء" variant="ghost" onPress={() => setShowBranchModal(null)} />
                        </View>
                    </ScrollView>
                </View>
            </Modal>

            {/* Create Drug Modal */}
            <Modal visible={!!showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <ScrollView style={{ backgroundColor: C.card, borderTopLeftRadius: 12, borderTopRightRadius: 12 }} contentContainerStyle={{ padding: 24 }}>
                        <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '800', textAlign: 'right', marginBottom: 2 }}>
                            تسجيل دواء جديد
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginBottom: 16 }}>
                            الباركود: {showCreateModal}
                        </Text>
                        <TextInput style={inputStyle} placeholder="الاسم التجاري *" placeholderTextColor={C.mutedForeground} value={formData.tradeName} onChangeText={t => setFormData(f => ({ ...f, tradeName: t }))} />
                        <TextInput style={inputStyle} placeholder="الاسم العلمي" placeholderTextColor={C.mutedForeground} value={formData.scientificName} onChangeText={t => setFormData(f => ({ ...f, scientificName: t }))} />
                        <TextInput style={inputStyle} placeholder="سعر البيع *" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.price} onChangeText={t => setFormData(f => ({ ...f, price: t }))} />
                        <TextInput style={inputStyle} placeholder="سعر التكلفة" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.costPrice} onChangeText={t => setFormData(f => ({ ...f, costPrice: t }))} />
                        <TextInput style={inputStyle} placeholder="حد النواقص" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.minStock} onChangeText={t => setFormData(f => ({ ...f, minStock: t }))} />
                        {/* Supplier picker */}
                        <TouchableOpacity
                            onPress={() => { setSupplierPickerContext('create'); setShowSupplierPicker(true); }}
                            style={[inputStyle, { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }]}
                        >
                            <Text style={{ color: selectedSupplierId ? C.foreground : C.mutedForeground, fontSize: 14 }}>
                                {selectedSupplierId ? (suppliers.find(s => s.id === selectedSupplierId)?.name ?? 'مورد محدد') : 'المورد (اختياري)'}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color={C.mutedForeground} />
                        </TouchableOpacity>
                        <View style={{ height: 1, backgroundColor: C.border, marginVertical: 8 }} />
                        <TextInput style={inputStyle} placeholder="الكمية *" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.quantity} onChangeText={t => setFormData(f => ({ ...f, quantity: t }))} />
                        <TextInput style={inputStyle} placeholder="تاريخ الصلاحية (YYYY-MM-DD) *" placeholderTextColor={C.mutedForeground} value={formData.expiryDate} onChangeText={t => setFormData(f => ({ ...f, expiryDate: t }))} />
                        {/* Quick Sale Toggle */}
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
                        <View style={{ gap: 8, marginTop: 4, paddingBottom: 30 }}>
                            <Button label="حفظ الدواء" loading={modalLoading} onPress={handleCreateDrug} />
                            <Button label="إلغاء" variant="ghost" onPress={() => setShowCreateModal(null)} />
                        </View>
                    </ScrollView>
                </View>
            </Modal>

            {/* Supplier picker modal */}
            <Modal visible={showSupplierPicker} transparent animationType="slide" onRequestClose={() => setShowSupplierPicker(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: C.card, borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 20, maxHeight: '70%' }}>
                        <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
                        <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '700', textAlign: 'right', marginBottom: 12 }}>اختر مورداً</Text>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.input, borderRadius: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, marginBottom: 12, gap: 8 }}>
                            <Ionicons name="search" size={16} color={C.mutedForeground} />
                            <TextInput
                                style={{ flex: 1, color: C.foreground, paddingVertical: 8, textAlign: 'right', fontSize: 14 }}
                                placeholder="بحث..."
                                placeholderTextColor={C.mutedForeground}
                                value={supplierSearch}
                                onChangeText={setSupplierSearch}
                            />
                        </View>
                        {/* Clear option */}
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
        </View>
    );
}
