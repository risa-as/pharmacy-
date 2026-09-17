import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, TouchableOpacity, TextInput, Alert, Modal, ActivityIndicator,
    ScrollView, KeyboardAvoidingView, Platform, InteractionManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect, Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useCheckout, CartItem, PaymentMethod } from '../../context/CheckoutContext';
import { Radius } from '../../constants/colors';
import { usePalette, Surface, AppButton, PressableCard, LinkLabel } from '../../components/ui/Kit';
import { PatientPickerModal } from '../../components/PatientPickerModal';
import { SafetyWarnings, LoyaltyPanel, Stepper } from '../../components/checkout/CheckoutParts';
import { CheckoutSheet } from '../../components/checkout/CheckoutSheet';
import { formatNumber, CURRENCY, initials } from '../../utils/format';
import { consumeManualEntry } from '../../utils/manual-entry';

type DrugResult = { id: string; name: string; tradeName: string; scientificName: string; barcode?: string; price: number; quantity: number };

// ── Payment button ────────────────────────────────────────────────────────────
/** Checkout button carrying its method's colour (cash green, card blue, credit orange). */
function PayButton({ label, icon, color, flex, disabled, onPress }: {
    label: string; icon: React.ComponentProps<typeof Ionicons>['name'];
    color: string; flex: number; disabled?: boolean; onPress: () => void;
}) {
    const C = usePalette();
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!disabled }}
            style={{
                flex,
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 11, paddingHorizontal: 8,
                borderRadius: Radius.control, borderWidth: 1,
                backgroundColor: disabled ? C.input : color,
                borderColor: disabled ? C.border : color,
            }}
        >
            <Ionicons name={icon} size={17} color={disabled ? C.mutedForeground : '#fff'} />
            <Text style={{ color: disabled ? C.mutedForeground : '#fff', fontSize: 15, fontWeight: '800' }}>{label}</Text>
        </TouchableOpacity>
    );
}

// ── Cart line ─────────────────────────────────────────────────────────────────
/**
 * Editable cart card, matching the desktop POS: the quantity and the unit price
 * are both tappable and typed in place. An overridden price keeps the list
 * price visible (struck through) and tints the card, so nobody sells at a
 * changed price without seeing it.
 */
const CartLine = React.memo(({ item, flagged, onChange, onRemove, onSetQuantity, onSetPrice }: {
    item: CartItem; flagged: boolean;
    onChange: (id: string, delta: number) => void;
    onRemove: (id: string) => void;
    onSetQuantity: (id: string, quantity: number) => void;
    onSetPrice: (id: string, price: number) => void;
}) => {
    const C = usePalette();
    const [editing, setEditing] = useState<'price' | 'qty' | null>(null);
    // Free-text while typing: a strictly controlled number field freezes the
    // moment the user clears it to retype.
    const [draft, setDraft] = useState('');
    const overridden = item.originalPrice !== undefined;

    const startEdit = (field: 'price' | 'qty') => {
        setDraft(String(field === 'price' ? item.price : item.quantity));
        setEditing(field);
    };
    const commit = () => {
        const value = Number(draft.replace(/[^\d.]/g, ''));
        if (editing === 'price') onSetPrice(item.id, value);
        else if (editing === 'qty') onSetQuantity(item.id, value);
        setEditing(null);
    };

    const editorStyle = {
        minWidth: 74, color: C.foreground, fontSize: 15, fontWeight: '800' as const, textAlign: 'center' as const,
        paddingVertical: 4, paddingHorizontal: 8,
        borderWidth: 1, borderColor: C.primary, borderRadius: Radius.control, backgroundColor: C.primaryMuted,
    };

    return (
        <Surface style={{ gap: 12, borderColor: overridden ? C.warning : C.border, backgroundColor: overridden ? C.warningBg : C.card }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                        {flagged && <Ionicons name="warning-outline" size={16} color={C.warning} />}
                        <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right', flexShrink: 1 }} numberOfLines={2}>
                            {item.tradeName ?? item.name}
                        </Text>
                        {overridden && (
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.badge, backgroundColor: C.card, borderWidth: 1, borderColor: C.warning }}>
                                <Ionicons name="pencil" size={10} color={C.warning} />
                                <Text style={{ color: C.warning, fontSize: 10.5, fontWeight: '800' }}>سعر معدّل</Text>
                            </View>
                        )}
                    </View>
                    {item.stock !== undefined && item.stock <= 5 && (
                        <Text style={{ color: C.warning, fontSize: 12, textAlign: 'right', marginTop: 2 }}>المتوفر {formatNumber(item.stock)}</Text>
                    )}
                </View>
                <TouchableOpacity onPress={() => onRemove(item.id)} hitSlop={10} accessibilityLabel={`حذف ${item.tradeName ?? item.name}`}>
                    <Ionicons name="trash-outline" size={20} color={C.mutedForeground} />
                </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: C.mutedForeground, fontSize: 12 }}>سعر الوحدة</Text>
                    {editing === 'price' ? (
                        <TextInput
                            value={draft}
                            onChangeText={setDraft}
                            onBlur={commit}
                            onSubmitEditing={commit}
                            keyboardType="numeric"
                            returnKeyType="done"
                            autoFocus
                            selectTextOnFocus
                            accessibilityLabel="سعر الوحدة"
                            style={editorStyle}
                        />
                    ) : (
                        <TouchableOpacity
                            onPress={() => startEdit('price')}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={`تعديل سعر ${item.tradeName ?? item.name}`}
                            style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}
                        >
                            {overridden && (
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textDecorationLine: 'line-through' }}>
                                    {formatNumber(item.originalPrice!)}
                                </Text>
                            )}
                            <Text style={{ color: overridden ? C.warning : C.foreground, fontSize: 15, fontWeight: '700' }}>
                                {formatNumber(item.price)} {CURRENCY}
                            </Text>
                            <Ionicons name="pencil-outline" size={13} color={overridden ? C.warning : C.mutedForeground} />
                        </TouchableOpacity>
                    )}
                </View>
                {editing === 'qty' ? (
                    <TextInput
                        value={draft}
                        onChangeText={setDraft}
                        onBlur={commit}
                        onSubmitEditing={commit}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        autoFocus
                        selectTextOnFocus
                        accessibilityLabel="الكمية"
                        style={editorStyle}
                    />
                ) : (
                    <Stepper
                        value={item.quantity}
                        onMinus={() => onChange(item.id, -1)}
                        onPlus={() => onChange(item.id, 1)}
                        onValuePress={() => startEdit('qty')}
                        minusDisabled={item.quantity <= 1}
                        plusDisabled={item.stock !== undefined && item.quantity >= item.stock}
                    />
                )}
                <View style={{ alignItems: 'flex-start' }}>
                    <Text style={{ color: C.mutedForeground, fontSize: 12 }}>المجموع</Text>
                    <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '900' }}>{formatNumber(item.price * item.quantity)} {CURRENCY}</Text>
                </View>
            </View>
        </Surface>
    );
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SalesScreen() {
    const C = usePalette();
    const insets = useSafeAreaInsets();
    const { branchId, user } = useAuth();
    const params = useLocalSearchParams();
    const checkout = useCheckout();
    const {
        cart, patient, subTotal, totalDiscount, total, itemCount, manualDiscount, interactions,
        addDrug, updateQuantity, setItemQuantity, setItemPrice, removeItem, setPatient, setMethod, setManualDiscount, resetCheckout,
        recentItems, dropRecent,
    } = checkout;

    const searchRef = useRef<TextInput>(null);
    const focusTask = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [nameResults, setNameResults] = useState<DrugResult[]>([]);
    const [searchingName, setSearchingName] = useState(false);
    const [notFoundMsg, setNotFoundMsg] = useState<string | null>(null);
    const [searchFocused, setSearchFocused] = useState(false);
    const notFoundTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [showPatientPicker, setShowPatientPicker] = useState(false);
    const [showCheckout, setShowCheckout] = useState(false);
    const [showDiscount, setShowDiscount] = useState(false);
    const [discountInput, setDiscountInput] = useState('');
    const [loadingRecentId, setLoadingRecentId] = useState<string | null>(null);

    const showNotFound = useCallback((msg: string) => {
        if (notFoundTimer.current) clearTimeout(notFoundTimer.current);
        setNotFoundMsg(msg);
        notFoundTimer.current = setTimeout(() => setNotFoundMsg(null), 3500);
    }, []);
    useEffect(() => () => { if (notFoundTimer.current) clearTimeout(notFoundTimer.current); }, []);

    // Live name search while typing letters.
    useEffect(() => {
        const hasLetters = /[a-zA-Z؀-ۿ]/.test(query);
        if (!hasLetters || query.trim().length < 2) { setNameResults([]); return; }
        let active = true;
        const timer = setTimeout(async () => {
            setSearchingName(true);
            try {
                const results = await apiService.searchDrugByName(query.trim(), branchId ?? undefined);
                if (active) setNameResults(results);
            } finally {
                if (active) setSearchingName(false);
            }
        }, 300);
        return () => { active = false; clearTimeout(timer); };
    }, [query, branchId]);

    const handleLookup = useCallback(async (code: string) => {
        const trimmed = code.trim();
        if (!trimmed) return;
        const isBarcode = /^[\d-]+$/.test(trimmed);
        setLoading(true);
        setNameResults([]);
        try {
            if (isBarcode) {
                const drug = await apiService.getDrugByBarcode(trimmed, branchId ?? undefined);
                if (!drug) { showNotFound('لم يُعثر على باركود مطابق في المخزون'); return; }
                if (addDrug(drug)) setQuery('');
            } else {
                const results = await apiService.searchDrugByName(trimmed, branchId ?? undefined);
                if (results.length === 0) { showNotFound(`لا يوجد دواء باسم "${trimmed}" في المخزون`); return; }
                if (results.length === 1) { if (addDrug(results[0])) setQuery(''); }
                else setNameResults(results);
            }
        } finally {
            setLoading(false);
        }
    }, [branchId, addDrug, showNotFound]);

    // Barcode handed over by the scanner via route params.
    useEffect(() => {
        if (params.scannedBarcode) {
            void handleLookup(params.scannedBarcode as string);
            router.setParams({ scannedBarcode: '' });
        }
    }, [params.scannedBarcode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Scanner returning with router.back() + prescription results → add to cart.
    useFocusEffect(
        useCallback(() => {
            let active = true;
            (async () => {
                try {
                    const code = await AsyncStorage.getItem('pendingScanBarcode');
                    if (code && active) {
                        await AsyncStorage.removeItem('pendingScanBarcode');
                        await handleLookup(code);
                    }
                    // "إدخال يدوي" in the scanner: open the keyboard on the search
                    // field. Focus only sticks once the screen transition is done.
                    if (await consumeManualEntry('sales')) {
                        if (active) focusTask.current = InteractionManager.runAfterInteractions(() => searchRef.current?.focus());
                    }
                    const raw = await AsyncStorage.getItem('pendingPrescriptionDrugs');
                    if (raw && active) {
                        await AsyncStorage.removeItem('pendingPrescriptionDrugs');
                        const names: unknown = JSON.parse(raw);
                        if (Array.isArray(names)) {
                            for (const name of names) if (typeof name === 'string') await handleLookup(name);
                        }
                    }
                } catch { /* ignore hand-off errors */ }
            })();
            return () => { active = false; focusTask.current?.cancel(); };
        }, [handleLookup]),
    );

    const handleRecent = useCallback(async (item: CartItem) => {
        if (loadingRecentId) return;
        setLoadingRecentId(item.id);
        try {
            const current = await apiService.getDrugCurrentStock(item.id, branchId ?? undefined);
            const stock = current ?? item.stock ?? 0;
            if (stock <= 0) {
                dropRecent(item.id);
                Alert.alert('نفاد المخزون', 'هذا الدواء غير متوفر حالياً في المخزون');
                return;
            }
            addDrug({ ...item, quantity: stock });
        } finally {
            setLoadingRecentId(null);
        }
    }, [branchId, addDrug, dropRecent, loadingRecentId]);

    const goToReview = (m: PaymentMethod) => {
        if (cart.length === 0) { Alert.alert('تنبيه', 'السلة فارغة'); return; }
        setMethod(m);
        setShowCheckout(true);
    };

    const flaggedNames = new Set(interactions.flatMap(ix => [ix.drug1, ix.drug2].map(n => n.toLowerCase())));
    const isFlagged = (i: CartItem) =>
        flaggedNames.has((i.scientificName ?? '').toLowerCase()) || flaggedNames.has((i.name ?? '').toLowerCase());

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {/* Header */}
            <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
                <Text style={{ flex: 1, color: C.foreground, fontSize: 24, fontWeight: '900', textAlign: 'right' }}>نقطة البيع</Text>
                <TouchableOpacity
                    onPress={() => router.push('/(tabs)/more' as Href)}
                    accessibilityLabel="المزيد والحساب"
                    style={{ width: 46, height: 46, borderRadius: Radius.card, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>{initials(user?.name, 1) || '؟'}</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}
                keyboardShouldPersistTaps="handled"
            >
                {/* Customer — one compact line; the whole row opens the picker. */}
                <PressableCard
                    onPress={() => setShowPatientPicker(true)}
                    padded={false}
                    style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12 }}
                    accessibilityLabel={patient ? `العميل ${patient.name}` : 'اختيار عميل'}
                    accessibilityHint="يفتح قائمة العملاء"
                >
                    <View style={{
                        width: 30, height: 30, borderRadius: Radius.control,
                        backgroundColor: patient ? C.primaryMuted : C.input,
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Ionicons name={patient ? 'person' : 'person-outline'} size={16} color={patient ? C.primary : C.mutedForeground} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                            style={{
                                color: patient ? C.foreground : C.mutedForeground,
                                fontSize: 15, fontWeight: patient ? '800' : '600', textAlign: 'right',
                            }}
                            numberOfLines={1}
                        >
                            {patient ? patient.name : 'بدون عميل'}
                        </Text>
                    </View>
                    {patient ? (
                        <TouchableOpacity onPress={() => setPatient(null)} hitSlop={10} accessibilityLabel="إزالة العميل">
                            <Ionicons name="close-circle" size={18} color={C.mutedForeground} />
                        </TouchableOpacity>
                    ) : null}
                    <LinkLabel
                        label={patient ? 'تغيير' : 'اختيار'}
                        style={{ color: C.primary, fontSize: 13.5, fontWeight: '700' }}
                        chevronSize={13}
                    />
                </PressableCard>

                {/* Search + scan — one 44pt line; the border carries the state. */}
                <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                    <View style={{
                        flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 10,
                        backgroundColor: C.card, borderRadius: Radius.control, borderWidth: 1,
                        // Colour-only state change: a thicker border would shift the row by a point.
                        borderColor: notFoundMsg ? C.danger : searchFocused || nameResults.length > 0 ? C.primary : C.border,
                    }}>
                        <Ionicons
                            name="search-outline"
                            size={18}
                            color={notFoundMsg ? C.danger : searchFocused || query.length > 0 ? C.primary : C.mutedForeground}
                        />
                        <TextInput
                            ref={searchRef}
                            value={query}
                            onChangeText={(v) => { setQuery(v); setNotFoundMsg(null); }}
                            onSubmitEditing={() => handleLookup(query)}
                            onFocus={() => setSearchFocused(true)}
                            onBlur={() => setSearchFocused(false)}
                            returnKeyType="search"
                            placeholder="ابحث باسم الدواء أو الباركود"
                            placeholderTextColor={C.mutedForeground}
                            style={{ flex: 1, color: C.foreground, paddingVertical: 10, textAlign: 'right', fontSize: 15 }}
                        />
                        {loading || searchingName ? (
                            <ActivityIndicator size="small" color={C.primary} />
                        ) : query.length > 0 ? (
                            <TouchableOpacity onPress={() => { setQuery(''); setNameResults([]); setNotFoundMsg(null); }} hitSlop={10} accessibilityLabel="مسح البحث">
                                <Ionicons name="close-circle" size={17} color={C.mutedForeground} />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                    <TouchableOpacity
                        onPress={() => router.push({ pathname: '/scan', params: { from: 'sales' } })}
                        activeOpacity={0.85}
                        accessibilityLabel="مسح باركود"
                        style={{ width: 44, borderRadius: Radius.control, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Ionicons name="scan-outline" size={21} color="#fff" />
                    </TouchableOpacity>
                </View>

                {notFoundMsg && (
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 12, backgroundColor: C.dangerBg, borderRadius: Radius.card }}>
                        <Ionicons name="search-outline" size={18} color={C.danger} />
                        <Text style={{ flex: 1, color: C.danger, fontSize: 13, textAlign: 'right' }}>{notFoundMsg}</Text>
                    </View>
                )}

                {nameResults.length > 1 && (
                    <Surface padded={false} style={{ overflow: 'hidden', borderColor: C.primary }}>
                        <Text style={{ color: C.primary, fontSize: 12.5, fontWeight: '700', textAlign: 'right', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.primaryMuted }}>
                            {nameResults.length} نتيجة — اختر دواءً
                        </Text>
                        {nameResults.slice(0, 8).map((drug, i) => (
                            <TouchableOpacity
                                key={drug.id}
                                onPress={() => { if (addDrug(drug)) { setQuery(''); setNameResults([]); } }}
                                activeOpacity={0.75}
                                style={{
                                    flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11,
                                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border,
                                }}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: C.foreground, fontSize: 14.5, fontWeight: '700', textAlign: 'right' }} numberOfLines={1}>{drug.tradeName}</Text>
                                    {drug.scientificName ? <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right' }} numberOfLines={1}>{drug.scientificName}</Text> : null}
                                </View>
                                <View style={{ alignItems: 'flex-start' }}>
                                    <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '700' }}>{formatNumber(drug.price)} {CURRENCY}</Text>
                                    <Text style={{ color: drug.quantity > 0 ? C.mutedForeground : C.danger, fontSize: 12 }}>
                                        {drug.quantity > 0 ? `المتوفر ${formatNumber(drug.quantity)}` : 'نفد المخزون'}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </Surface>
                )}

                {/* Recent chips on an empty cart */}
                {cart.length === 0 && recentItems.length > 0 && (
                    <View style={{ gap: 8 }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 13, fontWeight: '700', textAlign: 'right' }}>آخر المبيعات</Text>
                        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
                            {recentItems.map(item => (
                                <TouchableOpacity
                                    key={item.id}
                                    onPress={() => handleRecent(item)}
                                    disabled={loadingRecentId !== null}
                                    style={{
                                        flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
                                        backgroundColor: C.card, borderRadius: Radius.control, borderWidth: 1, borderColor: C.border,
                                        opacity: loadingRecentId === item.id ? 0.5 : 1,
                                    }}
                                >
                                    {loadingRecentId === item.id
                                        ? <ActivityIndicator size="small" color={C.primary} />
                                        : <Ionicons name="add-circle-outline" size={16} color={C.primary} />}
                                    <Text style={{ color: C.foreground, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{item.tradeName ?? item.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {/* Cart */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900' }}>السلة ({itemCount})</Text>
                    {cart.length > 0 && (
                        <TouchableOpacity
                            onPress={() => Alert.alert('إفراغ السلة', 'هل تريد إزالة كل الأصناف والعميل من السلة؟', [
                                { text: 'إلغاء', style: 'cancel' },
                                { text: 'إفراغ', style: 'destructive', onPress: resetCheckout },
                            ])}
                            hitSlop={8}
                        >
                            <Text style={{ color: C.danger, fontSize: 13, fontWeight: '700' }}>إفراغ السلة</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <SafetyWarnings compact />

                {cart.map(item => (
                    <CartLine
                        key={item.id}
                        item={item}
                        flagged={isFlagged(item)}
                        onChange={updateQuantity}
                        onRemove={removeItem}
                        onSetQuantity={setItemQuantity}
                        onSetPrice={setItemPrice}
                    />
                ))}

                <TouchableOpacity
                    onPress={() => searchRef.current?.focus()}
                    activeOpacity={0.8}
                    style={{
                        flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14,
                        borderRadius: Radius.card, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, backgroundColor: C.card,
                    }}
                >
                    <Ionicons name="add-circle-outline" size={22} color={C.primary} />
                    <Text style={{ color: C.primary, fontSize: 15, fontWeight: '800' }}>{cart.length === 0 ? 'امسح باركود أو ابحث لإضافة دواء' : 'إضافة دواء'}</Text>
                </TouchableOpacity>

                <LoyaltyPanel />
            </ScrollView>

            {/* Sticky summary */}
            <View style={{ backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 10 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 13 }}>الإجمالي</Text>
                        <Text style={{ color: C.foreground, fontSize: 26, fontWeight: '900' }}>
                            {formatNumber(total)} <Text style={{ fontSize: 14, color: C.mutedForeground, fontWeight: '600' }}>{CURRENCY}</Text>
                        </Text>
                        {totalDiscount > 0 && (
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textDecorationLine: 'line-through' }}>
                                    {formatNumber(subTotal)}
                                </Text>
                                <Text style={{ color: C.success, fontSize: 12, fontWeight: '700' }}>
                                    وفّر {formatNumber(totalDiscount)}
                                </Text>
                            </View>
                        )}
                    </View>
                    {manualDiscount > 0 ? (
                        // Applied: shows the amount and clears in one tap, instead of
                        // reopening the dialog only to remove it.
                        <View style={{
                            flexDirection: 'row-reverse', alignItems: 'center',
                            borderRadius: Radius.control, borderWidth: 1, borderColor: C.warning,
                            backgroundColor: C.warningBg, overflow: 'hidden',
                        }}>
                            <TouchableOpacity
                                onPress={() => { setDiscountInput(String(manualDiscount)); setShowDiscount(true); }}
                                accessibilityLabel="تعديل الخصم"
                                style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8 }}
                            >
                                <Ionicons name="pricetag" size={15} color={C.warning} />
                                <Text style={{ color: C.warning, fontSize: 13, fontWeight: '800' }}>{formatNumber(manualDiscount)}</Text>
                            </TouchableOpacity>
                            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: `${C.warning}55` }} />
                            <TouchableOpacity
                                onPress={() => setManualDiscount(0)}
                                accessibilityLabel="إزالة الخصم"
                                hitSlop={6}
                                style={{ paddingHorizontal: 9, paddingVertical: 8 }}
                            >
                                <Ionicons name="close" size={15} color={C.warning} />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            onPress={() => { setDiscountInput(''); setShowDiscount(true); }}
                            disabled={cart.length === 0}
                            accessibilityLabel="إضافة خصم"
                            style={{
                                flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
                                paddingHorizontal: 11, paddingVertical: 8,
                                borderRadius: Radius.control, borderWidth: 1, borderColor: C.border,
                                backgroundColor: C.input,
                                opacity: cart.length === 0 ? 0.5 : 1,
                            }}
                        >
                            <Ionicons name="pricetag-outline" size={15} color={C.mutedForeground} />
                            <Text style={{ color: C.mutedForeground, fontSize: 13, fontWeight: '700' }}>إضافة خصم</Text>
                        </TouchableOpacity>
                    )}
                </View>
                {/* One colour per payment method — the same coding used by the
                    payment badges and the desktop POS. */}
                <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                    <PayButton label="نقدي" icon="cash-outline" color={C.success} flex={1.2} disabled={cart.length === 0} onPress={() => goToReview('CASH')} />
                    <PayButton label="بطاقة" icon="card-outline" color={C.primary} flex={1} disabled={cart.length === 0} onPress={() => goToReview('CARD')} />
                    <PayButton label="آجل" icon="time-outline" color={C.warning} flex={1} disabled={cart.length === 0} onPress={() => goToReview('CREDIT')} />
                </View>
            </View>

            <PatientPickerModal visible={showPatientPicker} onClose={() => setShowPatientPicker(false)} onSelect={setPatient} />

            {/* Payment review — a sheet over the cart, not a separate screen. */}
            <CheckoutSheet visible={showCheckout} onClose={() => setShowCheckout(false)} />

            {/* Manual discount */}
            <Modal visible={showDiscount} transparent animationType="fade" onRequestClose={() => setShowDiscount(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
                        <View style={{ backgroundColor: C.card, borderRadius: Radius.card, padding: 20, gap: 14 }}>
                            <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '800', textAlign: 'right' }}>خصم يدوي</Text>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', borderWidth: 1.5, borderColor: C.primary, borderRadius: Radius.control, overflow: 'hidden' }}>
                                <TextInput
                                    value={discountInput}
                                    onChangeText={setDiscountInput}
                                    keyboardType="numeric"
                                    autoFocus
                                    placeholder="0"
                                    placeholderTextColor={C.mutedForeground}
                                    style={{ flex: 1, color: C.foreground, fontSize: 22, fontWeight: '800', textAlign: 'right', paddingHorizontal: 14, paddingVertical: 12 }}
                                />
                                <View style={{ alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 14, backgroundColor: C.input }}>
                                    <Text style={{ color: C.mutedForeground, fontWeight: '700' }}>{CURRENCY}</Text>
                                </View>
                            </View>
                            <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right' }}>المجموع قبل الخصم: {formatNumber(subTotal)} {CURRENCY}</Text>
                            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                                <AppButton
                                    label="تطبيق"
                                    style={{ flex: 2 }}
                                    onPress={() => {
                                        const n = parseFloat(discountInput.replace(/[^0-9.]/g, '')) || 0;
                                        setManualDiscount(Math.min(n, subTotal));
                                        setShowDiscount(false);
                                    }}
                                />
                                <AppButton
                                    label="إزالة الخصم"
                                    variant="dangerOutline"
                                    style={{ flex: 1 }}
                                    onPress={() => { setManualDiscount(0); setShowDiscount(false); }}
                                />
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}
