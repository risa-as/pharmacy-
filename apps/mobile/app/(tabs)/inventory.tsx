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
    barcode?: string;
    drugName: string;
    quantity: number;
    price: number;
    reorderLevel: number;
    expiryDate?: string;
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
        minStock: '5', maxStock: '100', batchNumber: '', quantity: '', expiryDate: '',
    });

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
        if (!formData.quantity || !formData.batchNumber || !formData.expiryDate) {
            Alert.alert('تنبيه', 'يرجى ملء كافة الحقول الأساسية'); return;
        }
        setModalLoading(true);
        try {
            await apiService.addBatch({
                inventoryId: showBatchModal.id,
                batchNumber: formData.batchNumber,
                quantity: parseInt(formData.quantity) || 0,
                expiryDate: formData.expiryDate + 'T00:00:00.000Z',
            });
            setShowBatchModal(null);
            setFormData(f => ({ ...f, quantity: '', batchNumber: '', expiryDate: '' }));
            fetchInventory();
        } catch { Alert.alert('خطأ', 'فشل إضافة الجرعة'); }
        finally { setModalLoading(false); }
    };

    const handleAddToBranch = async () => {
        if (!formData.price || !formData.quantity || !formData.batchNumber || !formData.expiryDate) {
            Alert.alert('تنبيه', 'يرجى ملء كافة الحقول الأساسية'); return;
        }
        setModalLoading(true);
        try {
            await apiService.addToBranch({
                drugId: showBranchModal.id, branchId: selectedBranch!,
                price: parseFloat(formData.price) || 0,
                costPrice: parseFloat(formData.costPrice) || 0,
                minStock: parseInt(formData.minStock) || 5,
                maxStock: parseInt(formData.maxStock) || 100,
                batchNumber: formData.batchNumber,
                quantity: parseInt(formData.quantity) || 0,
                expiryDate: formData.expiryDate + 'T00:00:00.000Z',
            });
            setShowBranchModal(null);
            setFormData({ tradeName: '', scientificName: '', price: '', costPrice: '', minStock: '5', maxStock: '100', batchNumber: '', quantity: '', expiryDate: '' });
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
                batchNumber: formData.batchNumber, quantity: parseInt(formData.quantity) || 0,
                expiryDate: formData.expiryDate + 'T00:00:00.000Z',
            });
            setShowCreateModal(null);
            setFormData({ tradeName: '', scientificName: '', price: '', costPrice: '', minStock: '5', maxStock: '100', batchNumber: '', quantity: '', expiryDate: '' });
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
            if (activeTab === 'low-stock') return i.quantity <= i.reorderLevel;
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
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                    <Text style={{ color: C.mutedForeground, fontSize: 12 }}>حد الطلب: {item.reorderLevel}</Text>
                    {item.barcode && (
                        <Text style={{ color: C.mutedForeground, fontSize: 12 }}>{item.barcode}</Text>
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
                    <View style={{ backgroundColor: C.card, borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 24 }}>
                        <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '800', textAlign: 'right', marginBottom: 16 }}>
                            إضافة كمية: {showBatchModal?.drug?.tradeName}
                        </Text>
                        <TextInput style={inputStyle} placeholder="رقم التشغيلة (Batch)" placeholderTextColor={C.mutedForeground} value={formData.batchNumber} onChangeText={t => setFormData(f => ({ ...f, batchNumber: t }))} />
                        <TextInput style={inputStyle} placeholder="الكمية" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.quantity} onChangeText={t => setFormData(f => ({ ...f, quantity: t }))} />
                        <TextInput style={inputStyle} placeholder="تاريخ الصلاحية (YYYY-MM-DD)" placeholderTextColor={C.mutedForeground} value={formData.expiryDate} onChangeText={t => setFormData(f => ({ ...f, expiryDate: t }))} />
                        <View style={{ gap: 8, marginTop: 4 }}>
                            <Button label="حفظ" loading={modalLoading} onPress={handleAddBatch} />
                            <Button label="إلغاء" variant="ghost" onPress={() => setShowBatchModal(null)} />
                        </View>
                    </View>
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
                        <TextInput style={inputStyle} placeholder="رقم التشغيلة (Batch)" placeholderTextColor={C.mutedForeground} value={formData.batchNumber} onChangeText={t => setFormData(f => ({ ...f, batchNumber: t }))} />
                        <TextInput style={inputStyle} placeholder="الكمية" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.quantity} onChangeText={t => setFormData(f => ({ ...f, quantity: t }))} />
                        <TextInput style={inputStyle} placeholder="تاريخ الصلاحية (YYYY-MM-DD)" placeholderTextColor={C.mutedForeground} value={formData.expiryDate} onChangeText={t => setFormData(f => ({ ...f, expiryDate: t }))} />
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
                        <View style={{ height: 1, backgroundColor: C.border, marginVertical: 8 }} />
                        <TextInput style={inputStyle} placeholder="رقم التشغيلة *" placeholderTextColor={C.mutedForeground} value={formData.batchNumber} onChangeText={t => setFormData(f => ({ ...f, batchNumber: t }))} />
                        <TextInput style={inputStyle} placeholder="الكمية *" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.quantity} onChangeText={t => setFormData(f => ({ ...f, quantity: t }))} />
                        <TextInput style={inputStyle} placeholder="تاريخ الصلاحية (YYYY-MM-DD) *" placeholderTextColor={C.mutedForeground} value={formData.expiryDate} onChangeText={t => setFormData(f => ({ ...f, expiryDate: t }))} />
                        <View style={{ gap: 8, marginTop: 4, paddingBottom: 30 }}>
                            <Button label="حفظ الدواء" loading={modalLoading} onPress={handleCreateDrug} />
                            <Button label="إلغاء" variant="ghost" onPress={() => setShowCreateModal(null)} />
                        </View>
                    </ScrollView>
                </View>
            </Modal>
        </View>
    );
}
