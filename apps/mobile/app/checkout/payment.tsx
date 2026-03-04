import React, { useState, useMemo } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, TextInput,
    Alert, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { apiService } from '../../services/api';
import { dbService } from '../../services/db';
import { syncService } from '../../services/sync';
import { printerService } from '../../services/printer';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

type PaymentMethod = 'CASH' | 'CARD' | 'ZAINCASH' | 'DEBIT';

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
    { key: 'CASH',     label: 'نقدي',    icon: 'cash-outline' },
    { key: 'CARD',     label: 'بطاقة',   icon: 'card-outline' },
    { key: 'ZAINCASH', label: 'ZainCash', icon: 'phone-portrait-outline' },
    { key: 'DEBIT',    label: 'آجل',      icon: 'time-outline' },
];

/**
 * Standalone payment screen — T020.
 * Receives cart JSON + total + patientId via route params from sales.tsx.
 * Handles payment method selection, cash change calculator, and receipt printing.
 */
export default function PaymentScreen() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const params = useLocalSearchParams<{ cart: string; total: string; patientId?: string; patientName?: string }>();

    const cart: Array<{ id: string; name: string; tradeName?: string; price: number; quantity: number }> =
        useMemo(() => { try { return JSON.parse(params.cart ?? '[]'); } catch { return []; } }, [params.cart]);

    const total = Number(params.total ?? 0);
    const patientId = params.patientId ?? undefined;
    const patientName = params.patientName ?? undefined;

    const [method, setMethod] = useState<PaymentMethod>('CASH');
    const [amountGiven, setAmountGiven] = useState('');
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const given = Number(amountGiven.replace(/[^0-9.]/g, '')) || 0;
    const change = method === 'CASH' ? Math.max(0, given - total) : 0;
    const canConfirm = method !== 'CASH' || given >= total;

    const handleConfirm = async () => {
        if (!canConfirm) { Alert.alert('تنبيه', 'المبلغ المدفوع أقل من الإجمالي'); return; }
        if (method === 'DEBIT' && !patientId) { Alert.alert('تنبيه', 'يجب تحديد عميل للبيع الآجل'); return; }

        setLoading(true);
        const saleData = {
            items: cart.map(i => ({ drugId: i.id, quantity: i.quantity, price: i.price })),
            totalAmount: total,
            patientId,
            paymentMethod: method === 'DEBIT' ? 'CREDIT' : method,
            discount: 0,
        };

        const online = await syncService.isOnline();
        let success = false;
        if (online) {
            try { await apiService.createSale(saleData); success = true; }
            catch {
                if (method !== 'DEBIT') {
                    try { await dbService.saveOfflineSale(saleData.items, saleData.totalAmount); success = true; }
                    catch { Alert.alert('خطأ', 'فشل حفظ البيع'); }
                } else {
                    Alert.alert('خطأ', 'لا يمكن إجراء بيع آجل بدون اتصال');
                }
            }
        } else {
            if (method === 'DEBIT') { Alert.alert('تنبيه', 'البيع الآجل غير متاح بدون اتصال'); }
            else { try { await dbService.saveOfflineSale(saleData.items, saleData.totalAmount); success = true; } catch { Alert.alert('خطأ', 'فشل حفظ البيع'); } }
        }
        setLoading(false);
        if (success) setDone(true);
    };

    const handlePrint = async () => {
        const printer = await printerService.getSavedPrinter();
        if (!printer) { Alert.alert('تنبيه', 'لا توجد طابعة متصلة'); return; }
        await printerService.printReceipt(
            'Faramace Pharmacy',
            cart.map(i => ({ name: i.tradeName ?? i.name, quantity: i.quantity, price: i.price })),
            total,
        );
    };

    if (done) {
        return (
            <View style={{ flex: 1, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
                <View style={{ backgroundColor: C.successBg, borderRadius: 999, padding: 24, marginBottom: 20 }}>
                    <Ionicons name="checkmark-circle" size={64} color={C.success} />
                </View>
                <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 8 }}>
                    تمت العملية بنجاح!
                </Text>
                <Text style={{ color: C.mutedForeground, fontSize: 14, textAlign: 'center', marginBottom: 32 }}>
                    تم تسجيل البيع بقيمة {total.toLocaleString()} د.ع
                </Text>
                <View style={{ gap: 12, width: '100%' }}>
                    <Button label="طباعة الوصل" variant="secondary" onPress={handlePrint} />
                    <Button label="بيع جديد" onPress={() => router.replace('/(tabs)/sales' as any)} />
                </View>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {/* Header */}
            <View style={{ backgroundColor: C.card, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '800' }}>الدفع</Text>
                <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: C.border, borderRadius: 6, padding: 8 }}>
                    <Ionicons name="arrow-back" size={20} color={C.foreground} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
                {/* Order summary */}
                <Card className="mb-4">
                    <Text style={{ color: C.foreground, fontWeight: '700', textAlign: 'right', marginBottom: 10, fontSize: 15 }}>ملخص الطلب</Text>
                    {cart.map((item, idx) => (
                        <View key={item.id} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: C.border }}>
                            <Text style={{ color: C.foreground, fontSize: 13 }}>{item.tradeName ?? item.name} × {item.quantity}</Text>
                            <Text style={{ color: C.foreground, fontWeight: '600', fontSize: 13 }}>{(item.price * item.quantity).toLocaleString()}</Text>
                        </View>
                    ))}
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
                        <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 16 }}>الإجمالي</Text>
                        <Text style={{ color: C.primary, fontWeight: '900', fontSize: 18 }}>{total.toLocaleString()} د.ع</Text>
                    </View>
                    {patientName && (
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 8 }}>
                            <Ionicons name="person" size={14} color={C.mutedForeground} />
                            <Text style={{ color: C.mutedForeground, fontSize: 12 }}>{patientName}</Text>
                        </View>
                    )}
                </Card>

                {/* Payment method selector */}
                <Text style={{ color: C.foreground, fontWeight: '700', textAlign: 'right', marginBottom: 10, fontSize: 15 }}>طريقة الدفع</Text>
                <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                    {PAYMENT_METHODS.map(({ key, label, icon }) => {
                        const active = method === key;
                        return (
                            <TouchableOpacity key={key} onPress={() => setMethod(key)} style={{ flex: 1, minWidth: '45%', borderRadius: 6, borderWidth: active ? 2 : 1, borderColor: active ? C.primary : C.border, backgroundColor: active ? C.primaryMuted : C.card, paddingVertical: 14, alignItems: 'center', gap: 6 }}>
                                <Ionicons name={icon} size={22} color={active ? C.primary : C.mutedForeground} />
                                <Text style={{ color: active ? C.primary : C.foreground, fontWeight: '600', fontSize: 13 }}>{label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Cash change calculator */}
                {method === 'CASH' && (
                    <Card className="mb-4">
                        <Text style={{ color: C.foreground, fontWeight: '700', textAlign: 'right', marginBottom: 10 }}>حاسبة الباقي</Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginBottom: 6 }}>المبلغ المستلم</Text>
                        <TextInput
                            style={{ backgroundColor: C.input, borderRadius: 6, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 10, color: C.foreground, fontSize: 18, fontWeight: '800', textAlign: 'right', marginBottom: 12 }}
                            placeholder={total.toLocaleString()}
                            placeholderTextColor={C.mutedForeground}
                            keyboardType="numeric"
                            value={amountGiven}
                            onChangeText={setAmountGiven}
                        />
                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 14, backgroundColor: change > 0 ? C.successBg : C.border, borderRadius: 6 }}>
                            <Text style={{ color: C.foreground, fontWeight: '700' }}>الباقي</Text>
                            <Text style={{ color: change > 0 ? C.success : C.foreground, fontWeight: '900', fontSize: 18 }}>
                                {change.toLocaleString()} د.ع
                            </Text>
                        </View>
                    </Card>
                )}
            </ScrollView>

            {/* Confirm button */}
            <View style={{ backgroundColor: C.card, padding: 20, borderTopWidth: 1, borderTopColor: C.border, paddingBottom: Platform.OS === 'ios' ? 36 : 20 }}>
                <Button
                    label={loading ? '' : `تأكيد الدفع — ${total.toLocaleString()} د.ع`}
                    loading={loading}
                    disabled={!canConfirm || loading}
                    onPress={handleConfirm}
                />
            </View>
        </View>
    );
}
