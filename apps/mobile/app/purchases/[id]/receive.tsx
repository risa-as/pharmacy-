import React, { useEffect, useState } from 'react';
import {
    View, Text, ScrollView, TextInput, TouchableOpacity,
    Alert, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { apiService } from '../../../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { Colors } from '../../../constants/colors';

interface ReceiveItem {
    id: string;
    itemId: string;
    drugName: string;
    quantity: number;
    receivedQuantity: string;
    batchNumber: string;
    expiryMonth: string;
    expiryYear: string;
}

export default function ReceiveItemsScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [items, setItems]       = useState<ReceiveItem[]>([]);
    const [loading, setLoading]   = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    useEffect(() => { if (id) fetchDetails(); }, [id]);

    const fetchDetails = async () => {
        try {
            const data = await apiService.getPurchaseDetails(id as string);
            const baseTs = Date.now().toString(36).toUpperCase();
            setItems(data.items.map((item: any, idx: number) => ({
                ...item,
                itemId:           item.id,
                receivedQuantity: item.quantity.toString(),
                batchNumber:      `B${baseTs}${String(idx + 1).padStart(2, '0')}`,
                expiryMonth:      '',
                expiryYear:       '',
            })));
        } catch (error) {
            console.error(error);
            Alert.alert('خطأ', 'تعذّر تحميل تفاصيل الطلب');
        } finally {
            setLoading(false);
        }
    };

    const updateItem = (index: number, field: keyof ReceiveItem, value: string) => {
        setItems(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const handleReceive = async () => {
        const nowYear = new Date().getFullYear();
        for (const item of items) {
            const month = parseInt(item.expiryMonth);
            const year  = parseInt(item.expiryYear);
            if (!item.expiryMonth || !item.expiryYear) {
                Alert.alert('حقل مطلوب', `يرجى إدخال تاريخ الانتهاء لـ "${item.drugName}"`);
                return;
            }
            if (isNaN(month) || month < 1 || month > 12) {
                Alert.alert('خطأ في الشهر', `الشهر يجب أن يكون بين 01 و 12 لـ "${item.drugName}"`);
                return;
            }
            if (isNaN(year) || year < nowYear) {
                Alert.alert('خطأ في السنة', `السنة "${year}" غير صحيحة أو منتهية لـ "${item.drugName}"`);
                return;
            }
        }

        setSubmitting(true);
        try {
            const payload = items.map(item => ({
                itemId:      item.itemId,
                quantity:    parseInt(item.receivedQuantity) || item.quantity,
                batchNumber: item.batchNumber,
                expiryDate:  new Date(
                    `${item.expiryYear}-${item.expiryMonth.padStart(2, '0')}-01`
                ).toISOString(),
            }));
            await apiService.receivePurchase(id as string, payload);
            Alert.alert('تم الاستلام ✓', 'تمت إضافة المواد إلى المخزون بنجاح', [
                { text: 'تم', onPress: () => router.back() },
            ]);
        } catch {
            Alert.alert('خطأ', 'فشل عملية الاستلام، يرجى المحاولة مرة أخرى');
        } finally {
            setSubmitting(false);
        }
    };

    const filledCount = items.filter(i => i.expiryMonth && i.expiryYear).length;
    const allFilled   = filledCount === items.length && items.length > 0;

    if (loading) return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background }}>
            <Stack.Screen options={{ title: 'استلام المواد', headerBackTitle: 'إلغاء' }} />
            <ActivityIndicator size="large" color={C.primary} />
        </View>
    );

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1, backgroundColor: C.background }}
        >
            <Stack.Screen options={{
                title: 'استلام المواد',
                headerBackTitle: 'إلغاء',
                headerStyle: { backgroundColor: C.card },
                headerTintColor: C.foreground,
            }} />

            <ScrollView
                contentContainerStyle={{ padding: 16 }}
                keyboardShouldPersistTaps="handled"
            >
                {/* Banner */}
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                    backgroundColor: C.infoBg, borderRadius: 5, padding: 13,
                    marginBottom: 16, borderWidth: 1, borderColor: `${C.info}35`,
                }}>
                    <View style={{ backgroundColor: C.info, borderRadius: 5, padding: 6 }}>
                        <Ionicons name="information" size={14} color="#fff" />
                    </View>
                    <Text style={{ flex: 1, color: C.info, fontSize: 13, textAlign: 'right', lineHeight: 20 }}>
                        أدخل تاريخ انتهاء الصلاحية (الشهر / السنة) لكل مادة
                    </Text>
                </View>

                {/* Progress bar — only when multiple items */}
                {items.length > 1 && (
                    <View style={{
                        backgroundColor: C.card, borderRadius: 5, padding: 12,
                        borderWidth: 1, borderColor: C.border, marginBottom: 14,
                        flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                    }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 12, flexShrink: 0 }}>
                            {filledCount} / {items.length}
                        </Text>
                        <View style={{ flex: 1, height: 5, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' }}>
                            <View style={{
                                width: `${(filledCount / items.length) * 100}%`,
                                height: '100%', backgroundColor: C.success, borderRadius: 3,
                            }} />
                        </View>
                        <Text style={{ color: allFilled ? C.success : C.mutedForeground, fontSize: 12, fontWeight: '700', flexShrink: 0 }}>
                            {allFilled ? 'مكتمل ✓' : 'قيد الإدخال'}
                        </Text>
                    </View>
                )}

                {/* Item cards */}
                {items.map((item, index) => {
                    const filled = !!(item.expiryMonth && item.expiryYear);
                    return (
                        <View
                            key={item.id}
                            style={{
                                flexDirection: 'row-reverse',
                                backgroundColor: C.card, borderRadius: 5,
                                borderWidth: 1,
                                borderColor: filled ? `${C.success}50` : C.border,
                                overflow: 'hidden', marginBottom: 12,
                                elevation: 1,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 1 },
                                shadowOpacity: 0.04, shadowRadius: 4,
                            }}
                        >
                            {/* Accent bar */}
                            <View style={{ width: 4, backgroundColor: filled ? C.success : C.primary }} />

                            <View style={{ flex: 1, padding: 14 }}>
                                {/* Header */}
                                <View style={{
                                    flexDirection: 'row-reverse', justifyContent: 'space-between',
                                    alignItems: 'center', marginBottom: 14,
                                    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border,
                                }}>
                                    <Text style={{
                                        color: C.foreground, fontWeight: '800', fontSize: 15,
                                        textAlign: 'right', flex: 1,
                                    }} numberOfLines={1}>
                                        {item.drugName}
                                    </Text>
                                    <View style={{
                                        backgroundColor: C.primaryMuted, borderRadius: 5,
                                        paddingHorizontal: 10, paddingVertical: 5, marginLeft: 8,
                                    }}>
                                        <Text style={{ color: C.primary, fontSize: 13, fontWeight: '800' }}>
                                            {item.quantity} قطعة
                                        </Text>
                                    </View>
                                </View>

                                {/* Expiry label */}
                                <Text style={{
                                    color: C.mutedForeground, fontSize: 12, fontWeight: '600',
                                    textAlign: 'right', marginBottom: 10,
                                }}>
                                    تاريخ انتهاء الصلاحية *
                                </Text>

                                {/* Month / Year inputs */}
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 8 }}>
                                    {/* Month */}
                                    <View style={{ flex: 1, alignItems: 'center' }}>
                                        <Text style={{
                                            color: C.mutedForeground, fontSize: 11, marginBottom: 6,
                                        }}>
                                            الشهر
                                        </Text>
                                        <TextInput
                                            style={{
                                                width: '100%',
                                                backgroundColor: C.input, borderRadius: 5,
                                                borderWidth: 1.5,
                                                borderColor: item.expiryMonth
                                                    ? (parseInt(item.expiryMonth) >= 1 && parseInt(item.expiryMonth) <= 12 ? C.success : C.danger)
                                                    : C.border,
                                                paddingVertical: 14, paddingHorizontal: 8,
                                                color: C.foreground, textAlign: 'center',
                                                fontSize: 22, fontWeight: '900',
                                            }}
                                            placeholder="MM"
                                            placeholderTextColor={C.mutedForeground}
                                            keyboardType="numeric"
                                            maxLength={2}
                                            value={item.expiryMonth}
                                            onChangeText={v => updateItem(index, 'expiryMonth', v.replace(/[^0-9]/g, ''))}
                                        />
                                    </View>

                                    {/* Separator */}
                                    <View style={{ paddingBottom: 14 }}>
                                        <Text style={{ color: C.mutedForeground, fontSize: 26, fontWeight: '200' }}>/</Text>
                                    </View>

                                    {/* Year */}
                                    <View style={{ flex: 2, alignItems: 'center' }}>
                                        <Text style={{
                                            color: C.mutedForeground, fontSize: 11, marginBottom: 6,
                                        }}>
                                            السنة
                                        </Text>
                                        <TextInput
                                            style={{
                                                width: '100%',
                                                backgroundColor: C.input, borderRadius: 5,
                                                borderWidth: 1.5,
                                                borderColor: item.expiryYear
                                                    ? (item.expiryYear.length === 4 ? C.success : C.border)
                                                    : C.border,
                                                paddingVertical: 14, paddingHorizontal: 8,
                                                color: C.foreground, textAlign: 'center',
                                                fontSize: 22, fontWeight: '900',
                                            }}
                                            placeholder="YYYY"
                                            placeholderTextColor={C.mutedForeground}
                                            keyboardType="numeric"
                                            maxLength={4}
                                            value={item.expiryYear}
                                            onChangeText={v => updateItem(index, 'expiryYear', v.replace(/[^0-9]/g, ''))}
                                        />
                                    </View>
                                </View>

                                {/* Confirmed display */}
                                {filled && (
                                    <View style={{
                                        flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 10,
                                    }}>
                                        <Ionicons name="checkmark-circle" size={15} color={C.success} />
                                        <Text style={{ color: C.success, fontSize: 12, fontWeight: '600' }}>
                                            ينتهي {item.expiryMonth.padStart(2, '0')} / {item.expiryYear}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    );
                })}

                <View style={{ height: 80 }} />
            </ScrollView>

            {/* Footer */}
            <View style={{
                padding: 16,
                paddingBottom: Platform.OS === 'ios' ? 32 : 16,
                backgroundColor: C.card,
                borderTopWidth: 1, borderTopColor: C.border,
            }}>
                <TouchableOpacity
                    onPress={handleReceive}
                    disabled={submitting || !allFilled}
                    activeOpacity={0.85}
                    style={{
                        backgroundColor: allFilled && !submitting ? C.primary : C.border,
                        borderRadius: 5, paddingVertical: 15,
                        flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 8,
                    }}
                >
                    {submitting
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    }
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                        {submitting
                            ? 'جاري المعالجة...'
                            : !allFilled
                                ? `أكمل بيانات ${items.length - filledCount} صنف`
                                : 'تأكيد الاستلام'}
                    </Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}
