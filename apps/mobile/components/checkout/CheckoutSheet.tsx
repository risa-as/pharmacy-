import React, { useRef, useState } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
    Modal, Pressable, Animated, Easing,
} from 'react-native';
import { PanGestureHandler, GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService, isNetworkError } from '../../services/api';
import { dbService, OfflineSalePayload } from '../../services/db';
import { syncService } from '../../services/sync';
import { printerService } from '../../services/printer';
import { useAuth } from '../../context/AuthContext';
import { useCheckout, CartItem, PaymentMethod } from '../../context/CheckoutContext';
import { Radius } from '../../constants/colors';
import { usePalette, Surface, AppButton, FormField } from '../ui/Kit';
import { PatientPickerModal } from '../PatientPickerModal';
import { SafetyWarnings, LoyaltyPanel } from './CheckoutParts';
import { formatNumber, formatIQD, CURRENCY, paymentMethodLabel } from '../../utils/format';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const METHODS: Array<{ key: PaymentMethod; label: string; icon: IconName }> = [
    { key: 'CASH', label: 'نقدي', icon: 'cash-outline' },
    { key: 'CARD', label: 'بطاقة', icon: 'card-outline' },
    { key: 'CREDIT', label: 'آجل', icon: 'time-outline' },
];

interface SaleResult {
    status: 'recorded' | 'queued';
    invoiceNumber?: number | null;
    total: number;
    method: PaymentMethod;
    items: CartItem[];
    patientName?: string;
}

/**
 * Payment review — the single confirmation step of the sale flow
 * (navigation-map §6, design payment.png). Methods: cash, card, credit.
 *
 * A bottom sheet over the cart rather than a separate screen: the pharmacist
 * stays on the point of sale, and the confirmation (which carries the change
 * calculation, the credit-sale guard and the idempotency key) is one gesture
 * away from being dismissed.
 */
export function CheckoutSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const C = usePalette();
    const insets = useSafeAreaInsets();
    const { branchId } = useAuth();
    const checkout = useCheckout();
    const {
        cart, patient, method, subTotal, itemCount, manualDiscount, loyaltyDiscount, totalDiscount, total,
        pointsToRedeem, loyaltySettings, idempotencyKey, setMethod, setPatient, resetCheckout, recordSold,
    } = checkout;

    const [showPicker, setShowPicker] = useState(false);
    const [showItems, setShowItems] = useState(false);
    const [amountGiven, setAmountGiven] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<SaleResult | null>(null);
    const inFlight = useRef(false);

    const given = Number(amountGiven.replace(/[^0-9.]/g, '')) || 0;
    const cashShort = method === 'CASH' && amountGiven.trim() !== '' && given < total;
    const change = method === 'CASH' && given > total ? given - total : 0;
    const needsPatient = method === 'CREDIT' && !patient;

    // ── Result screen ────────────────────────────────────────────────────────
    if (result) {
        // The sale is done: closing returns to an empty cart, so the backdrop is
        // not a dismiss target — the pharmacist confirms with the button.
        const closeResult = () => { setResult(null); onClose(); };
        return (
            <SheetShell visible={visible} title="نتيجة العملية">
                <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}>
                    <Surface style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
                        <View style={{
                            width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: result.status === 'recorded' ? C.successBg : C.warningBg,
                        }}>
                            <Ionicons
                                name={result.status === 'recorded' ? 'checkmark-circle' : 'cloud-upload-outline'}
                                size={46}
                                color={result.status === 'recorded' ? C.success : C.warning}
                            />
                        </View>
                        <Text style={{ color: C.foreground, fontSize: 20, fontWeight: '900' }}>
                            {result.status === 'recorded' ? 'تم تسجيل البيع' : 'حُفظ البيع على الجهاز'}
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 13.5, textAlign: 'center', lineHeight: 20 }}>
                            {result.status === 'recorded'
                                ? (result.invoiceNumber != null ? `فاتورة #${result.invoiceNumber}` : 'تم تسجيل العملية على الخادم')
                                : 'لا يوجد اتصال الآن. سيُرسل البيع تلقائياً عند عودة الاتصال، ولن يُسجَّل مرتين.'}
                        </Text>
                        <Text style={{ color: C.primary, fontSize: 30, fontWeight: '900', marginTop: 6 }}>
                            {formatNumber(result.total)} <Text style={{ fontSize: 15, color: C.mutedForeground }}>{CURRENCY}</Text>
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 13 }}>
                            {paymentMethodLabel(result.method)}{result.patientName ? ` · ${result.patientName}` : ''}
                        </Text>
                    </Surface>

                    {printerService.isSupported() && <AppButton
                        label="طباعة الفاتورة"
                        icon="print-outline"
                        variant="outline"
                        onPress={() => printReceipt(result)}
                    />}
                    <AppButton label="بيع جديد" icon="cart-outline" onPress={closeResult} />
                </ScrollView>
            </SheetShell>
        );
    }

    // Nothing to confirm (the sheet only opens from a filled cart).
    if (!visible || cart.length === 0) return null;

    async function printReceipt(r: SaleResult) {
        // Printing is independent from the sale: a failure here never re-sends it.
        try {
            const printer = await printerService.getSavedPrinter();
            if (!printer) {
                Alert.alert('لا توجد طابعة متصلة', 'البيع مسجّل. يمكنك إعداد الطابعة ثم إعادة الطباعة لاحقاً.', [
                    { text: 'إغلاق', style: 'cancel' },
                    // Close the sheet first: a screen pushed under an open modal
                    // would be hidden behind it.
                    { text: 'إعداد الطابعة', onPress: () => { setResult(null); onClose(); router.push('/printer-settings'); } },
                ]);
                return;
            }
            await printerService.printReceipt(
                'Faramace Pharmacy',
                r.items.map(i => ({ name: i.tradeName ?? i.name, quantity: i.quantity, price: i.price })),
                r.total,
            );
        } catch {
            Alert.alert('تعذّرت الطباعة', 'البيع مسجّل ولم يتأثر. حاول الطباعة مرة أخرى.');
        }
    }

    const queueLoyaltyEarn = async (patientId: string, amount: number) => {
        try {
            const raw = await AsyncStorage.getItem('pendingLoyaltyEarns');
            const queue: Array<{ patientId: string; amount: number; ts: number }> = raw ? JSON.parse(raw) : [];
            queue.push({ patientId, amount, ts: Date.now() });
            await AsyncStorage.setItem('pendingLoyaltyEarns', JSON.stringify(queue));
        } catch { /* best effort */ }
    };

    const queueLoyaltyRollback = async (patientId: string, points: number) => {
        try {
            const raw = await AsyncStorage.getItem('pendingLoyaltyRollbacks');
            const queue: Array<{ patientId: string; points: number; ts: number }> = raw ? JSON.parse(raw) : [];
            queue.push({ patientId, points, ts: Date.now() });
            await AsyncStorage.setItem('pendingLoyaltyRollbacks', JSON.stringify(queue));
        } catch { /* best effort */ }
    };

    const finish = (status: SaleResult['status'], invoiceNumber?: number | null) => {
        const snapshot: SaleResult = {
            status, invoiceNumber, total, method: method!, items: [...cart], patientName: patient?.name,
        };
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        recordSold(cart);
        resetCheckout();
        setResult(snapshot);
    };

    const confirmSale = async () => {
        if (inFlight.current) return;               // double-tap guard
        if (!method) { Alert.alert('تنبيه', 'اختر طريقة الدفع'); return; }
        if (needsPatient) { Alert.alert('تنبيه', 'البيع الآجل يتطلب اختيار عميل'); return; }
        if (cashShort) { Alert.alert('تنبيه', 'المبلغ المستلم أقل من الإجمالي'); return; }

        inFlight.current = true;
        setSubmitting(true);

        const payload: OfflineSalePayload = {
            items: cart.map(i => ({
                drugId: i.id, quantity: i.quantity, price: i.price,
                originalPrice: i.originalPrice ?? null,
            })),
            totalAmount: total,
            paymentMethod: method,
            patientId: patient?.id ?? null,
            discount: totalDiscount,
            branchId: branchId ?? null,
        };
        const key = idempotencyKey;

        try {
            const online = await syncService.isOnline();

            if (!online && method === 'CREDIT') {
                Alert.alert('غير متاح دون اتصال', 'البيع الآجل يحتاج اتصالاً بالخادم لتسجيل الدين.');
                return;
            }
            if (!online && pointsToRedeem > 0) {
                Alert.alert('غير متاح دون اتصال', 'استبدال نقاط الولاء يحتاج اتصالاً. أزل الاستبدال أو انتظر عودة الاتصال.');
                return;
            }

            if (!online) {
                await dbService.saveOfflineSale(payload, key);
                if (patient && loyaltySettings?.loyaltyEnabled && total > 0) await queueLoyaltyEarn(patient.id, total);
                finish('queued');
                return;
            }

            // Loyalty redemption happens first; a later failure queues a rollback.
            if (pointsToRedeem > 0 && patient) {
                try {
                    await apiService.redeemLoyaltyPoints(patient.id, pointsToRedeem);
                } catch {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    Alert.alert('خطأ', 'فشل استبدال نقاط الولاء. لم يُسجَّل البيع.');
                    return;
                }
            }

            try {
                const res = await apiService.createSale(payload, key);
                if (patient && loyaltySettings?.loyaltyEnabled && total > 0) {
                    void apiService.earnLoyaltyPoints(patient.id, res?.sale?.id ?? null, total);
                }
                void syncService.syncData();
                finish('recorded', res?.sale?.invoiceNumber ?? null);
            } catch (error) {
                if (isNetworkError(error) && method !== 'CREDIT') {
                    // Outcome unknown: queue with the SAME key. If the first request did
                    // land, the server acknowledges the replay as a duplicate.
                    await dbService.saveOfflineSale(payload, key);
                    if (patient && loyaltySettings?.loyaltyEnabled && total > 0) await queueLoyaltyEarn(patient.id, total);
                    finish('queued');
                    return;
                }
                if (pointsToRedeem > 0 && patient) await queueLoyaltyRollback(patient.id, pointsToRedeem);
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                const message = error instanceof Error ? error.message : '';
                Alert.alert(
                    'لم يُسجَّل البيع',
                    isNetworkError(error)
                        ? 'انقطع الاتصال قبل تأكيد البيع الآجل. تحقق من سجل المبيعات قبل إعادة المحاولة — إعادة المحاولة من هذه الشاشة لن تكرر البيع.'
                        : (message || 'تعذّر إتمام البيع. حاول مرة أخرى.')
                            + (pointsToRedeem > 0 ? '\nتم تسجيل طلب استعادة نقاط الولاء المستبدلة.' : ''),
                );
            }
        } finally {
            inFlight.current = false;
            setSubmitting(false);
        }
    };

    return (
        <SheetShell visible={visible} title="الدفع" subtitle="مراجعة قبل التأكيد" onClose={onClose}>
                <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
                    {/* Order summary — collapsed to one line; the cart is a tap away. */}
                    <Surface style={{ gap: 10, padding: 12 }}>
                        <TouchableOpacity
                            onPress={() => setShowItems(v => !v)}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: showItems }}
                            style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}
                        >
                            <Ionicons name="document-text-outline" size={18} color={C.primary} />
                            <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '800' }}>
                                {formatNumber(itemCount)} {itemCount === 1 ? 'صنف' : 'أصناف'}
                            </Text>
                            <View style={{ flex: 1 }} />
                            <Text style={{ color: C.mutedForeground, fontSize: 13.5, fontWeight: '700' }}>{formatIQD(subTotal)}</Text>
                            <Ionicons name={showItems ? 'chevron-up' : 'chevron-down'} size={17} color={C.mutedForeground} />
                        </TouchableOpacity>
                        {showItems && cart.map((item, i) => (
                            <View key={item.id} style={{
                                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                                paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border,
                            }}>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                                        <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '800', textAlign: 'right', flexShrink: 1 }} numberOfLines={2}>{item.tradeName ?? item.name}</Text>
                                        {item.originalPrice !== undefined && (
                                            <Text style={{ color: C.warning, fontSize: 10.5, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.badge, borderWidth: 1, borderColor: C.warning }}>
                                                سعر معدّل
                                            </Text>
                                        )}
                                    </View>
                                    <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }}>
                                        {item.quantity} × {formatNumber(item.price)} {CURRENCY}
                                        {item.originalPrice !== undefined ? `  (بدل ${formatNumber(item.originalPrice)})` : ''}
                                    </Text>
                                </View>
                                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '900' }}>{formatNumber(item.price * item.quantity)} {CURRENCY}</Text>
                            </View>
                        ))}
                        {totalDiscount > 0 && (
                            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, gap: 5 }}>
                                {manualDiscount > 0 && <SummaryRow label="خصم يدوي" value={`− ${formatIQD(manualDiscount)}`} tone="success" />}
                                {loyaltyDiscount > 0 && <SummaryRow label={`خصم الولاء (${formatNumber(pointsToRedeem)} نقطة)`} value={`− ${formatIQD(loyaltyDiscount)}`} tone="success" />}
                            </View>
                        )}
                    </Surface>

                    {/* Payment method */}
                    <Surface style={{ gap: 10, padding: 12 }}>
                        {/* Selected method = filled in its own colour. A border on
                            one segment inside a clipped row shows only three sides. */}
                        <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                            {METHODS.map(m => {
                                const active = method === m.key;
                                const color = m.key === 'CASH' ? C.success : m.key === 'CARD' ? C.primary : C.warning;
                                return (
                                    <TouchableOpacity
                                        key={m.key}
                                        onPress={() => setMethod(m.key)}
                                        activeOpacity={0.8}
                                        accessibilityRole="radio"
                                        accessibilityState={{ selected: active }}
                                        style={{
                                            flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6,
                                            paddingVertical: 10, borderRadius: Radius.control,
                                            backgroundColor: active ? color : C.input,
                                            borderWidth: 1, borderColor: active ? color : C.border,
                                        }}
                                    >
                                        <Ionicons name={m.icon} size={17} color={active ? '#fff' : C.mutedForeground} />
                                        <Text style={{ color: active ? '#fff' : C.mutedForeground, fontSize: 14.5, fontWeight: '800' }}>{m.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        {!method && <Text style={{ color: C.danger, fontSize: 12.5, textAlign: 'right' }}>اختر طريقة الدفع</Text>}
                        {method === 'CASH' && (
                            <View style={{ gap: 8 }}>
                                <FormField
                                    label="المبلغ المستلم (اختياري)"
                                    value={amountGiven}
                                    onChangeText={setAmountGiven}
                                    keyboardType="numeric"
                                    placeholder={formatNumber(total)}
                                    suffix={CURRENCY}
                                    error={cashShort ? 'المبلغ المستلم أقل من الإجمالي' : null}
                                />
                                {change > 0 && <SummaryRow label="الباقي للعميل" value={formatIQD(change)} tone="primary" bold />}
                            </View>
                        )}
                        {method === 'CARD' && (
                            <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right', lineHeight: 19 }}>
                                تأكد من نجاح العملية على جهاز البطاقة قبل تأكيد البيع. لا يُضاف مبلغ البطاقة إلى درج النقد.
                            </Text>
                        )}
                    </Surface>

                    {/* Customer — one row; the title would only add height. */}
                    <Surface style={{ gap: 8, padding: 12 }}>
                        <TouchableOpacity
                            onPress={() => setShowPicker(true)}
                            activeOpacity={0.8}
                            style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}
                        >
                            <Ionicons name="person-outline" size={18} color={needsPatient ? C.danger : C.primary} />
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: patient ? C.foreground : C.mutedForeground, fontSize: 15, fontWeight: patient ? '800' : '600', textAlign: 'right' }} numberOfLines={1}>
                                    {patient ? patient.name : 'بدون عميل'}
                                </Text>
                            </View>
                            {patient && (
                                <TouchableOpacity onPress={() => setPatient(null)} hitSlop={8} accessibilityLabel="إزالة العميل">
                                    <Ionicons name="close-circle" size={18} color={C.mutedForeground} />
                                </TouchableOpacity>
                            )}
                            <Text style={{ color: C.primary, fontSize: 13, fontWeight: '700' }}>{patient ? 'تغيير' : 'اختيار'}</Text>
                        </TouchableOpacity>
                        {needsPatient && <Text style={{ color: C.danger, fontSize: 12.5, textAlign: 'right' }}>مطلوب عند البيع الآجل</Text>}
                        {method === 'CREDIT' && patient?.balance != null && patient.balance > 0 && (
                            <SummaryRow label="الرصيد المستحق الحالي" value={formatIQD(patient.balance)} tone="warning" />
                        )}
                    </Surface>

                    <LoyaltyPanel />

                    <SafetyWarnings />
                </ScrollView>

                {/* The total lives in the action bar — a card of its own only
                    pushed the confirm button off the screen. */}
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
                    paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 12,
                    backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border,
                }}>
                    <View>
                        <Text style={{ color: C.mutedForeground, fontSize: 12 }}>الإجمالي</Text>
                        <Text style={{ color: C.primary, fontSize: 22, fontWeight: '900' }}>
                            {formatNumber(total)} <Text style={{ fontSize: 12, color: C.mutedForeground, fontWeight: '600' }}>{CURRENCY}</Text>
                        </Text>
                    </View>
                    <AppButton
                        label="تأكيد البيع"
                        icon="checkmark-circle-outline"
                        loading={submitting}
                        disabled={!method || needsPatient || cashShort}
                        onPress={confirmSale}
                        style={{ flex: 1, paddingVertical: 12 }}
                    />
                </View>

            <PatientPickerModal visible={showPicker} onClose={() => setShowPicker(false)} onSelect={setPatient} />
        </SheetShell>
    );
}

/**
 * Bottom-sheet chrome: dimmed backdrop, grab handle, title row. Dismissing is
 * offered only while `onClose` is given (never after the sale is recorded).
 */
const DISMISS_DISTANCE = 110;   // drag further than this and the sheet closes
const DISMISS_VELOCITY = 700;   // …or flick it down faster than this (pt/s)

function SheetShell({ visible, title, subtitle, onClose, children }: {
    visible: boolean; title: string; subtitle?: string; onClose?: () => void; children: React.ReactNode;
}) {
    const C = usePalette();
    // Raw gesture value; negatives are clamped so the sheet cannot be dragged up.
    const dragY = useRef(new Animated.Value(0)).current;
    const translateY = dragY.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp' });
    const sheetHeight = useRef(600);

    React.useEffect(() => { if (visible) dragY.setValue(0); }, [visible, dragY]);

    const onGesture = Animated.event([{ nativeEvent: { translationY: dragY } }], { useNativeDriver: true });

    const onStateChange = (e: any) => {
        if (e.nativeEvent.oldState !== State.ACTIVE) return;
        const { translationY, velocityY } = e.nativeEvent;
        if (onClose && (translationY > DISMISS_DISTANCE || velocityY > DISMISS_VELOCITY)) {
            Animated.timing(dragY, {
                toValue: sheetHeight.current, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true,
            }).start(() => { dragY.setValue(0); onClose(); });
        } else {
            Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
            {/* Gesture handlers need their own root inside a Modal. */}
            <GestureHandlerRootView style={{ flex: 1 }}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
                    <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={onClose ? 'إغلاق' : undefined} />
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <Animated.View
                            onLayout={e => { sheetHeight.current = e.nativeEvent.layout.height; }}
                            style={{
                                maxHeight: '90%', backgroundColor: C.card,
                                borderTopLeftRadius: Radius.card, borderTopRightRadius: Radius.card,
                                borderTopWidth: 1, borderColor: C.border, overflow: 'hidden',
                                transform: [{ translateY }],
                            }}
                        >
                            {/* Grab area — the handle and the title row both drag. */}
                            <PanGestureHandler
                                enabled={!!onClose}
                                activeOffsetY={[-999, 6]}
                                failOffsetX={[-24, 24]}
                                onGestureEvent={onGesture}
                                onHandlerStateChange={onStateChange}
                            >
                                <Animated.View>
                                    <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 2 }}>
                                        <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: C.border }} />
                                    </View>
                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '900', textAlign: 'right' }}>{title}</Text>
                                            {subtitle ? <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right' }}>{subtitle}</Text> : null}
                                        </View>
                                        {onClose ? (
                                            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="إغلاق">
                                                <Ionicons name="close" size={22} color={C.mutedForeground} />
                                            </TouchableOpacity>
                                        ) : null}
                                    </View>
                                </Animated.View>
                            </PanGestureHandler>
                            <View style={{ height: 1, backgroundColor: C.border }} />
                            {children}
                        </Animated.View>
                    </KeyboardAvoidingView>
                </View>
            </GestureHandlerRootView>
        </Modal>
    );
}

function SummaryRow({ label, value, tone, bold }: { label: string; value: string; tone?: 'success' | 'warning' | 'primary'; bold?: boolean }) {
    const C = usePalette();
    const color = tone === 'success' ? C.success : tone === 'warning' ? C.warning : tone === 'primary' ? C.primary : C.foreground;
    return (
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: C.mutedForeground, fontSize: 13.5 }}>{label}</Text>
            <Text style={{ color, fontSize: bold ? 16 : 14, fontWeight: bold ? '900' : '700' }}>{value}</Text>
        </View>
    );
}
