import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, FlatList, TextInput,
    Alert, Modal, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { apiService } from '../../services/api';
import { dbService } from '../../services/db';
import { syncService } from '../../services/sync';
import { printerService } from '../../services/printer';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

interface CartItem {
    id: string;
    tradeName?: string;
    name: string;
    price: number;
    quantity: number;
    stock?: number;
    scientificName?: string;
}

interface Patient {
    id: string;
    name: string;
    phone: string;
    balance?: number;
}

// Memoized cart row — token-based colors
const CartItemRow = React.memo(({ item, C, onUpdateQuantity, onRemove }: {
    item: CartItem;
    C: ReturnType<typeof Colors>;
    onUpdateQuantity: (id: string, change: number) => void;
    onRemove: (id: string) => void;
}) => (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {/* Drug icon */}
        <View style={{ backgroundColor: `${C.primary}18`, borderRadius: 6, padding: 8 }}>
            <Ionicons name="medical" size={18} color={C.primary} />
        </View>

        {/* Drug info */}
        <View style={{ flex: 1 }}>
            <Text style={{ color: C.foreground, fontWeight: '600', fontSize: 13, textAlign: 'right' }} numberOfLines={1}>
                {item.tradeName ?? item.name}
            </Text>
            <Text style={{ color: C.success, fontSize: 12, textAlign: 'right' }}>
                {item.price.toLocaleString()} د.ع
            </Text>
            {item.stock !== undefined && item.stock <= 5 && (
                <Text style={{ color: C.warning, fontSize: 11, textAlign: 'right' }}>⚠ متبقي {item.stock}</Text>
            )}
        </View>

        {/* Qty controls */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.border, borderRadius: 6, overflow: 'hidden' }}>
            <TouchableOpacity onPress={() => onUpdateQuantity(item.id, -1)} style={{ padding: 8 }}>
                <Ionicons name="remove" size={16} color={C.danger} />
            </TouchableOpacity>
            <Text style={{ color: C.foreground, fontWeight: '700', minWidth: 24, textAlign: 'center' }}>{item.quantity}</Text>
            <TouchableOpacity onPress={() => onUpdateQuantity(item.id, 1)} style={{ padding: 8 }}>
                <Ionicons name="add" size={16} color={C.success} />
            </TouchableOpacity>
        </View>

        {/* Line total + remove */}
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 13 }}>
                {(item.price * item.quantity).toLocaleString()}
            </Text>
            <TouchableOpacity onPress={() => onRemove(item.id)}>
                <Ionicons name="trash-outline" size={16} color={C.danger} />
            </TouchableOpacity>
        </View>
    </View>
));

export default function SalesScreen() {
    const { isDarkMode } = useTheme();
    const { branchId } = useAuth();
    const C = Colors(isDarkMode);
    const params = useLocalSearchParams();

    const [cart, setCart] = useState<CartItem[]>([]);
    const [barcode, setBarcode] = useState('');
    const [loading, setLoading] = useState(false);

    // Drug interaction / allergy warnings
    const [interactions, setInteractions] = useState<Array<{ drug1: string; drug2: string; severity: string; description: string }>>([]);
    const [allergyWarnings, setAllergyWarnings] = useState<string[]>([]);

    // Patient selection
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [showPatientModal, setShowPatientModal] = useState(false);
    const [patientQuery, setPatientQuery] = useState('');
    const [patientResults, setPatientResults] = useState<Patient[]>([]);
    const [searchingPatient, setSearchingPatient] = useState(false);

    // Discount & loyalty
    const [manualDiscount, setManualDiscount] = useState(0);
    const [manualDiscountInput, setManualDiscountInput] = useState('');
    const [loyaltySettings, setLoyaltySettings] = useState<{
        loyaltyEnabled: boolean;
        loyaltyPointsPerDinar: number;
        loyaltyRedemptionValue: number;
        loyaltyMinRedemption: number;
    } | null>(null);
    const [loyaltyAccount, setLoyaltyAccount] = useState<{
        totalPoints: number;
        tier: string;
    } | null>(null);
    const [pointsToRedeem, setPointsToRedeem] = useState(0);

    // Recently sold quick-add (last 5 cart items from session)
    const [recentItems, setRecentItems] = useState<CartItem[]>([]);

    // Fetch loyalty settings once on mount
    useEffect(() => {
        apiService.getLoyaltySettings().then(setLoyaltySettings).catch(() => {});
    }, []);

    // Fetch loyalty account whenever patient changes
    useEffect(() => {
        setLoyaltyAccount(null);
        setPointsToRedeem(0);
        if (!selectedPatient) return;
        apiService.getLoyaltyAccount(selectedPatient.id).then(setLoyaltyAccount).catch(() => {});
    }, [selectedPatient]);

    // Handle barcode passed back from scan.tsx
    useEffect(() => {
        if (params.scannedBarcode) {
            handleBarcodeAdd(params.scannedBarcode as string);
            router.setParams({ scannedBarcode: '' });
        }
    }, [params.scannedBarcode]);

    // Patient search debounce
    useEffect(() => {
        if (patientQuery.length < 2) { setPatientResults([]); return; }
        const timer = setTimeout(async () => {
            setSearchingPatient(true);
            try {
                const results = await apiService.searchPatients(patientQuery);
                setPatientResults(results ?? []);
            } finally {
                setSearchingPatient(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [patientQuery]);

    const handleBarcodeAdd = useCallback(async (code: string) => {
        if (!code.trim()) return;
        setLoading(true);
        try {
            const drug = await apiService.getDrugByBarcode(code.trim(), branchId ?? undefined);
            if (!drug) { Alert.alert('غير موجود', 'لم يُعثر على هذا الدواء'); return; }
            addToCart(drug);
        } finally {
            setLoading(false);
            setBarcode('');
        }
    }, [branchId]);

    const addToCart = useCallback((drug: any) => {
        setCart(prev => {
            const existing = prev.find(i => i.id === drug.id);
            if (existing) {
                if (drug.quantity !== undefined && existing.quantity >= drug.quantity) {
                    Alert.alert('تنبيه', `الكمية المتوفرة فقط ${drug.quantity}`);
                    return prev;
                }
                return prev.map(i => i.id === drug.id ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...prev, { id: drug.id, name: drug.name, tradeName: drug.tradeName, price: drug.price, quantity: 1, stock: drug.quantity, scientificName: drug.scientificName }];
        });

        // Run pharmacovigilance check
        const allNames = cart.map(i => i.scientificName ?? i.name).concat(drug.scientificName ?? drug.name);
        if (allNames.length > 1) {
            apiService.checkPharmacovigilance(allNames, selectedPatient?.id).then(result => {
                if (result?.interactions) setInteractions(result.interactions);
                if (result?.allergyWarnings) setAllergyWarnings(result.allergyWarnings);
            }).catch(() => {});
        }
    }, [cart, selectedPatient]);

    const removeFromCart = useCallback((id: string) => {
        setCart(prev => prev.filter(i => i.id !== id));
    }, []);

    const updateQuantity = useCallback((id: string, change: number) => {
        setCart(prev => prev.map(item => {
            if (item.id !== id) return item;
            const next = item.quantity + change;
            if (next <= 0) return item;
            if (item.stock !== undefined && next > item.stock) {
                Alert.alert('تنبيه', `الكمية المتوفرة فقط ${item.stock}`);
                return item;
            }
            return { ...item, quantity: next };
        }));
    }, []);

    const subTotal = useMemo(() => cart.reduce((acc, i) => acc + i.price * i.quantity, 0), [cart]);
    const itemCount = useMemo(() => cart.reduce((acc, i) => acc + i.quantity, 0), [cart]);

    const redemptionValue = loyaltySettings?.loyaltyRedemptionValue ?? 2.5;
    const minRedemption   = loyaltySettings?.loyaltyMinRedemption  ?? 500;
    const loyaltyDiscount = Math.floor(pointsToRedeem * redemptionValue);
    const totalDiscount   = manualDiscount + loyaltyDiscount;
    const total           = Math.max(0, subTotal - totalDiscount);

    const resetCart = useCallback(() => {
        setCart([]); setSelectedPatient(null); setInteractions([]); setAllergyWarnings([]);
        setManualDiscount(0); setManualDiscountInput(''); setPointsToRedeem(0); setLoyaltyAccount(null);
    }, []);

    const handleCheckout = useCallback((method: 'CASH' | 'CREDIT') => {
        if (cart.length === 0) { Alert.alert('تنبيه', 'السلة فارغة'); return; }
        if (method === 'CREDIT' && !selectedPatient) {
            Alert.alert('تنبيه', 'يجب اختيار عميل للبيع الآجل', [
                { text: 'اختيار عميل', onPress: () => setShowPatientModal(true) },
                { text: 'إلغاء' },
            ]);
            return;
        }
        const discountLine = totalDiscount > 0 ? `\nخصم: ${totalDiscount.toLocaleString()} د.ع` : '';
        Alert.alert(
            'تأكيد البيع',
            `الإجمالي: ${total.toLocaleString()} د.ع${discountLine}\nطريقة الدفع: ${method === 'CASH' ? 'نقدي' : 'آجل'}${selectedPatient ? `\nالعميل: ${selectedPatient.name}` : ''}`,
            [{ text: 'إلغاء', style: 'cancel' }, { text: 'تأكيد', onPress: () => processSale(method) }],
        );
    }, [cart, selectedPatient, total, totalDiscount]);

    const processSale = async (method: 'CASH' | 'CREDIT') => {
        setLoading(true);

        // 1. Redeem loyalty points first (online — must succeed before sale)
        if (pointsToRedeem > 0 && selectedPatient) {
            try {
                await apiService.redeemLoyaltyPoints(selectedPatient.id, pointsToRedeem);
            } catch {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert('خطأ', 'فشل استبدال نقاط الولاء. تحقق من الاتصال.');
                setLoading(false);
                return;
            }
        }

        const saleData = {
            items: cart.map(i => ({ drugId: i.id, quantity: i.quantity, price: i.price })),
            totalAmount: total,
            patientId: selectedPatient?.id,
            paymentMethod: method,
            discount: totalDiscount,
            branchId: branchId ?? undefined,
        };

        // CREDIT sales are always online-only (creates patient debt record on server)
        if (method === 'CREDIT') {
            const online = await syncService.isOnline();
            if (!online) {
                Alert.alert('تنبيه', 'البيع الآجل غير متاح بدون اتصال');
                setLoading(false);
                return;
            }
            try {
                const result: any = await apiService.createSale(saleData);
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                const creditCartSnapshot = [...cart];
                const creditTotalSnapshot = total;
                setRecentItems(prev => {
                    const seen = new Set<string>();
                    return [...creditCartSnapshot.slice(0, 5), ...prev]
                        .filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; })
                        .slice(0, 5);
                });
                resetCart();
                Alert.alert('تمت العملية', 'تمت عملية البيع', [
                    { text: 'طباعة', onPress: () => printReceipt(creditCartSnapshot, creditTotalSnapshot) },
                    { text: 'موافق' },
                ]);
            } catch (e) {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert('خطأ', 'فشل إتمام البيع الآجل. تحقق من الاتصال وحاول مجدداً.');
            }
            setLoading(false);
            return;
        }

        // CASH — optimistic flow: save locally first, show success, then sync in background
        try {
            await dbService.saveOfflineSale(saleData.items, saleData.totalAmount);
        } catch {
            // Local save failed — warn about deducted points (rollback logged for admin)
            if (pointsToRedeem > 0 && selectedPatient) {
                // Points were already deducted server-side; log for manual reconciliation
                const raw = await AsyncStorage.getItem('pendingLoyaltyRollbacks').catch(() => null);
                const queue: { patientId: string; points: number; ts: number }[] = raw ? JSON.parse(raw) : [];
                queue.push({ patientId: selectedPatient.id, points: pointsToRedeem, ts: Date.now() });
                await AsyncStorage.setItem('pendingLoyaltyRollbacks', JSON.stringify(queue)).catch(() => {});
                Alert.alert('خطأ', 'تعذر حفظ عملية البيع. تم تسجيل خصم النقاط — يرجى التواصل مع المشرف لاستعادتها.');
            } else {
                Alert.alert('خطأ', 'تعذر حفظ عملية البيع محلياً');
            }
            setLoading(false);
            return;
        }

        // Optimistic success — clear cart immediately
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const cartSnapshot = [...cart];
        const patientSnapshot = selectedPatient;
        const finalSnapshot  = total;
        setRecentItems(prev => {
            const seen = new Set<string>();
            return [...cartSnapshot.slice(0, 5), ...prev]
                .filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; })
                .slice(0, 5);
        });
        resetCart();
        setLoading(false);
        Alert.alert('تمت العملية', 'تمت عملية البيع', [
            { text: 'طباعة', onPress: () => printReceipt(cartSnapshot, finalSnapshot) },
            { text: 'موافق' },
        ]);

        // Background: sync + earn loyalty points (with AsyncStorage queue for retry)
        void syncService.syncData();
        if (patientSnapshot && loyaltySettings?.loyaltyEnabled && finalSnapshot > 0) {
            try {
                await apiService.earnLoyaltyPoints(patientSnapshot.id, null, finalSnapshot);
            } catch {
                // Network failed — queue for retry on next sync
                try {
                    const raw = await AsyncStorage.getItem('pendingLoyaltyEarns');
                    const queue: { patientId: string; amount: number; ts: number }[] = raw ? JSON.parse(raw) : [];
                    queue.push({ patientId: patientSnapshot.id, amount: finalSnapshot, ts: Date.now() });
                    await AsyncStorage.setItem('pendingLoyaltyEarns', JSON.stringify(queue));
                } catch {
                    console.warn('[Sales] Failed to queue pending loyalty earn');
                }
            }
        }
    };

    const printReceipt = async (receiptCart: typeof cart, receiptTotal: number) => {
        const printer = await printerService.getSavedPrinter();
        if (!printer) { Alert.alert('تنبيه', 'لا توجد طابعة متصلة'); return; }
        await printerService.printReceipt('Faramace Pharmacy', receiptCart.map(i => ({
            name: i.tradeName ?? i.name,
            quantity: i.quantity,
            price: i.price,
        })), receiptTotal);
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {/* ── Top: Scanner-first area ── */}
            <View style={{ backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 8 : 4, paddingBottom: 12 }}>
                {/* Title row */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '800' }}>نقطة البيع</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {/* Patient picker */}
                        <TouchableOpacity
                            onPress={() => setShowPatientModal(true)}
                            style={{ backgroundColor: selectedPatient ? C.primaryMuted : C.border, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                        >
                            <Ionicons name={selectedPatient ? 'person' : 'person-add-outline'} size={16} color={selectedPatient ? C.primary : C.mutedForeground} />
                            <Text style={{ color: selectedPatient ? C.primary : C.mutedForeground, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                                {selectedPatient ? selectedPatient.name : 'عميل'}
                            </Text>
                        </TouchableOpacity>
                        {/* Scan button — opens camera screen */}
                        <TouchableOpacity
                            onPress={() => router.push({ pathname: '/scan', params: { from: 'sales' } } as any)}
                            style={{ backgroundColor: C.primary, borderRadius: 6, padding: 9 }}
                        >
                            <Ionicons name="scan" size={20} color="#FFFFFF" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Barcode / drug name search input */}
                <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                    <View style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.input, borderRadius: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, gap: 8 }}>
                        <Ionicons name="barcode-outline" size={18} color={C.mutedForeground} />
                        <TextInput
                            style={{ flex: 1, color: C.foreground, paddingVertical: 10, textAlign: 'right', fontSize: 14 }}
                            placeholder="أدخل الباركود أو اسم الدواء..."
                            placeholderTextColor={C.mutedForeground}
                            value={barcode}
                            onChangeText={setBarcode}
                            onSubmitEditing={() => handleBarcodeAdd(barcode)}
                            keyboardType="default"
                            returnKeyType="search"
                        />
                        {loading && <ActivityIndicator size="small" color={C.primary} />}
                    </View>
                    <TouchableOpacity
                        onPress={() => handleBarcodeAdd(barcode)}
                        style={{ backgroundColor: C.success, borderRadius: 6, padding: 12, justifyContent: 'center' }}
                    >
                        <Ionicons name="add" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Drug Interaction / Allergy Banners ── */}
            {(allergyWarnings.length > 0 || interactions.length > 0) && (
                <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 8 }}>
                    {allergyWarnings.length > 0 && (
                        <View style={{ backgroundColor: C.dangerBg, borderWidth: 1, borderColor: `${C.danger}40`, borderRadius: 6, padding: 12, flexDirection: 'row-reverse', gap: 10, alignItems: 'flex-start' }}>
                            <Ionicons name="warning" size={20} color={C.danger} />
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.danger, fontWeight: '700', textAlign: 'right', fontSize: 13 }}>تحذير حساسية!</Text>
                                <Text style={{ color: C.danger, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                                    {allergyWarnings.join('، ')}
                                </Text>
                            </View>
                        </View>
                    )}
                    {interactions.map((ix, i) => (
                        <View key={i} style={{ backgroundColor: ix.severity === 'HIGH' ? C.dangerBg : C.warningBg, borderWidth: 1, borderColor: `${ix.severity === 'HIGH' ? C.danger : C.warning}40`, borderRadius: 6, padding: 12, flexDirection: 'row-reverse', gap: 10, alignItems: 'flex-start' }}>
                            <Ionicons name="warning" size={20} color={ix.severity === 'HIGH' ? C.danger : C.warning} />
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: ix.severity === 'HIGH' ? C.danger : C.warning, fontWeight: '700', textAlign: 'right', fontSize: 13 }}>
                                    تفاعل دوائي ({ix.severity === 'HIGH' ? 'خطير' : 'متوسط'})
                                </Text>
                                <Text style={{ color: ix.severity === 'HIGH' ? C.danger : C.warning, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                                    {ix.drug1} + {ix.drug2} — {ix.description}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {/* ── Quick-add recently sold ── */}
            {recentItems.length > 0 && cart.length === 0 && (
                <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
                    <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '600', textAlign: 'right', marginBottom: 8 }}>
                        آخر المبيعات
                    </Text>
                    <View style={{ flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' }}>
                        {recentItems.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                onPress={() => addToCart(item)}
                                style={{ backgroundColor: C.card, borderRadius: 6, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 8 }}
                            >
                                <Text style={{ color: C.foreground, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                                    {item.tradeName ?? item.name}
                                </Text>
                                <Text style={{ color: C.primary, fontSize: 11 }}>{item.price.toLocaleString()} د.ع</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            {/* ── Cart (lower ~60% of screen) ── */}
            <FlatList
                data={cart}
                renderItem={({ item }) => (
                    <CartItemRow item={item} C={C} onUpdateQuantity={updateQuantity} onRemove={removeFromCart} />
                )}
                keyExtractor={item => item.id}
                style={{ flex: 1 }}
                contentContainerStyle={cart.length === 0 ? { flex: 1 } : undefined}
                ListEmptyComponent={
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 48 }}>
                        <View style={{ backgroundColor: C.border, borderRadius: 12, padding: 20, marginBottom: 14 }}>
                            <Ionicons name="cart-outline" size={40} color={C.mutedForeground} />
                        </View>
                        <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 16 }}>السلة فارغة</Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 13, marginTop: 4 }}>امسح باركود المنتج أو أدخله</Text>
                    </View>
                }
            />

            {/* ── Footer: discount + loyalty + total + checkout ── */}
            <View style={{ backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, padding: 14, paddingBottom: Platform.OS === 'ios' ? 28 : 14 }}>

                {/* Discount row */}
                {cart.length > 0 && (
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <Ionicons name="pricetag-outline" size={15} color={C.mutedForeground} />
                        <Text style={{ color: C.mutedForeground, fontSize: 12, flex: 1, textAlign: 'right' }}>خصم يدوي</Text>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.input, borderRadius: 6, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, height: 36, gap: 4, minWidth: 110 }}>
                            <TextInput
                                style={{ color: C.foreground, fontSize: 14, fontWeight: '700', textAlign: 'right', flex: 1 }}
                                placeholder="0"
                                placeholderTextColor={C.mutedForeground}
                                keyboardType="numeric"
                                value={manualDiscountInput}
                                onChangeText={v => {
                                    setManualDiscountInput(v);
                                    const n = parseFloat(v) || 0;
                                    setManualDiscount(Math.min(n, subTotal));
                                }}
                            />
                            <Text style={{ color: C.mutedForeground, fontSize: 11 }}>د.ع</Text>
                        </View>
                    </View>
                )}

                {/* Loyalty row */}
                {cart.length > 0 && selectedPatient && loyaltySettings?.loyaltyEnabled && loyaltyAccount && (
                    <View style={{ backgroundColor: C.primaryMuted, borderRadius: 8, padding: 10, marginBottom: 10 }}>
                        {/* Header: tier + balance */}
                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                                <Ionicons name="star" size={14} color={C.primary} />
                                <Text style={{ color: C.primary, fontWeight: '700', fontSize: 12 }}>
                                    {loyaltyAccount.tier === 'GOLD' ? 'ذهبي' : loyaltyAccount.tier === 'SILVER' ? 'فضي' : 'برونزي'}
                                </Text>
                            </View>
                            <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>
                                {loyaltyAccount.totalPoints.toLocaleString()} نقطة
                            </Text>
                        </View>
                        {/* Points redemption controls */}
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                            <TouchableOpacity
                                onPress={() => setPointsToRedeem(p => Math.max(0, p - 100))}
                                style={{ backgroundColor: C.card, borderRadius: 4, padding: 6, borderWidth: 1, borderColor: C.border }}
                            >
                                <Ionicons name="remove" size={14} color={C.danger} />
                            </TouchableOpacity>
                            <View style={{ flex: 1, alignItems: 'center' }}>
                                <Text style={{ color: C.primary, fontWeight: '800', fontSize: 13 }}>
                                    {pointsToRedeem} نقطة
                                </Text>
                                {pointsToRedeem > 0 && (
                                    <Text style={{ color: C.success, fontSize: 11, marginTop: 2 }}>
                                        ← خصم {loyaltyDiscount.toLocaleString()} د.ع
                                    </Text>
                                )}
                            </View>
                            <TouchableOpacity
                                onPress={() => {
                                    const maxByBalance = Math.floor(loyaltyAccount.totalPoints / 100) * 100;
                                    const maxByBill    = Math.floor(Math.max(0, subTotal - manualDiscount) / redemptionValue / 100) * 100;
                                    const cap = Math.min(maxByBalance, maxByBill);
                                    setPointsToRedeem(p => Math.min(p + 100, cap));
                                }}
                                style={{ backgroundColor: C.card, borderRadius: 4, padding: 6, borderWidth: 1, borderColor: C.border }}
                            >
                                <Ionicons name="add" size={14} color={C.success} />
                            </TouchableOpacity>
                        </View>
                        {loyaltyAccount.totalPoints < minRedemption && (
                            <Text style={{ color: C.mutedForeground, fontSize: 10, textAlign: 'center', marginTop: 6 }}>
                                الحد الأدنى للاستبدال {minRedemption} نقطة
                            </Text>
                        )}
                    </View>
                )}

                {/* Total row */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <View>
                        {totalDiscount > 0 ? (
                            <>
                                <Text style={{ color: C.mutedForeground, fontSize: 11, textDecorationLine: 'line-through' }}>
                                    {subTotal.toLocaleString()} د.ع
                                </Text>
                                <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '900' }}>
                                    {total.toLocaleString()} <Text style={{ fontSize: 13, color: C.mutedForeground }}>د.ع</Text>
                                </Text>
                                <Text style={{ color: C.success, fontSize: 11 }}>وفرت {totalDiscount.toLocaleString()} د.ع</Text>
                            </>
                        ) : (
                            <>
                                <Text style={{ color: C.mutedForeground, fontSize: 12 }}>المجموع الكلي</Text>
                                <Text style={{ color: C.foreground, fontSize: 24, fontWeight: '900' }}>
                                    {total.toLocaleString()} <Text style={{ fontSize: 14, color: C.mutedForeground }}>د.ع</Text>
                                </Text>
                            </>
                        )}
                    </View>
                    <Badge label={`${itemCount} صنف`} variant={itemCount > 0 ? 'info' : 'default'} />
                </View>
                <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                    {(() => {
                        const btnText = isDarkMode ? '#FFFFFF' : '#18120F';
                        const creditBg = cart.length === 0 ? C.border : C.warning;
                        const cashBg   = cart.length === 0 ? C.border : C.success;
                        return (
                            <>
                                <TouchableOpacity
                                    onPress={() => handleCheckout('CREDIT')}
                                    disabled={cart.length === 0 || loading}
                                    style={{ flex: 1, backgroundColor: creditBg, borderRadius: 6, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: cart.length === 0 ? 0.5 : 1 }}
                                >
                                    <Ionicons name="time-outline" size={18} color={btnText} />
                                    <Text style={{ color: btnText, fontWeight: '700', fontSize: 15 }}>آجل</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => handleCheckout('CASH')}
                                    disabled={cart.length === 0 || loading}
                                    style={{ flex: 2, backgroundColor: cashBg, borderRadius: 6, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: cart.length === 0 ? 0.5 : 1 }}
                                >
                                    {loading
                                        ? <ActivityIndicator size="small" color={btnText} />
                                        : <><Ionicons name="cash-outline" size={18} color={btnText} /><Text style={{ color: btnText, fontWeight: '700', fontSize: 15 }}>نقدي</Text></>
                                    }
                                </TouchableOpacity>
                            </>
                        );
                    })()}
                </View>
            </View>

            {/* Patient modal */}
            <Modal visible={showPatientModal} animationType="slide" transparent onRequestClose={() => setShowPatientModal(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: C.card, borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 20, maxHeight: '70%' }}>
                        <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
                        <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '700', textAlign: 'right', marginBottom: 12 }}>بحث عن عميل</Text>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.input, borderRadius: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, marginBottom: 12, gap: 8 }}>
                            <Ionicons name="search" size={18} color={C.mutedForeground} />
                            <TextInput
                                style={{ flex: 1, color: C.foreground, paddingVertical: 10, textAlign: 'right', fontSize: 14 }}
                                placeholder="الاسم أو رقم الهاتف..."
                                placeholderTextColor={C.mutedForeground}
                                value={patientQuery}
                                onChangeText={setPatientQuery}
                                autoFocus
                            />
                        </View>
                        {searchingPatient
                            ? <ActivityIndicator size="small" color={C.primary} />
                            : patientResults.map(p => (
                                <TouchableOpacity key={p.id} onPress={() => { setSelectedPatient(p); setShowPatientModal(false); setPatientQuery(''); }}
                                    style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                                    <View>
                                        <Text style={{ color: C.foreground, fontWeight: '600', textAlign: 'right' }}>{p.name}</Text>
                                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right' }}>{p.phone}</Text>
                                    </View>
                                    {p.balance !== undefined && p.balance > 0 && (
                                        <Badge label={`${p.balance.toLocaleString()} د.ع`} variant="danger" />
                                    )}
                                </TouchableOpacity>
                            ))
                        }
                        <Button label="إغلاق" variant="ghost" onPress={() => setShowPatientModal(false)} className="mt-4" />
                    </View>
                </View>
            </Modal>
        </View>
    );
}
