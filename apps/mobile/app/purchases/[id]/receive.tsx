import React, { useEffect, useState } from 'react';
import {
    View, Text, ScrollView, TextInput, TouchableOpacity,
    Alert, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../../../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { managerPalette, Radius } from '../../../constants/colors';

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
    const insets = useSafeAreaInsets();
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

    useEffect(() => { if (id) fetchDetails(); }, [id]);

    const fetchDetails = async () => {
        try {
            const data: any = await apiService.getPurchaseDetails(id as string);
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

    // Custom header — replaces the native (brand-coloured) Stack header.
    const Header = (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={{
                paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 10,
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: C.background,
            }}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    activeOpacity={0.8}
                    style={{ width: 40, height: 40, borderRadius: Radius.xs, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Ionicons name="arrow-forward" size={20} color={C.foreground} />
                </TouchableOpacity>
                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }}>استلام المواد</Text>
                <View style={{ width: 40 }} />
            </View>
        </>
    );

    if (loading) return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {Header}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={C.primary} />
            </View>
        </View>
    );

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1, backgroundColor: C.background }}
        >
            {Header}

            <ScrollView
                contentContainerStyle={{ padding: 16 }}
                keyboardShouldPersistTaps="handled"
            >
                {/* Banner */}
                <View style={{
                    ...card(C.primary), padding: 13, marginBottom: 16,
                    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                }}>
                    <View style={{ width: 32, height: 32, borderRadius: Radius.xs, backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="information" size={16} color={C.primary} />
                    </View>
                    <Text style={{ flex: 1, color: C.foreground, fontSize: 13, textAlign: 'right', lineHeight: 20 }}>
                        أدخل تاريخ انتهاء الصلاحية (الشهر / السنة) لكل مادة
                    </Text>
                </View>

                {/* Progress bar — only when multiple items */}
                {items.length > 1 && (
                    <View style={{
                        ...card(C.primary), padding: 12, marginBottom: 14,
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
                            style={{ ...card(filled ? C.success : C.primary), padding: 14, marginBottom: 12 }}
                        >
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
                        borderRadius: Radius.sm, paddingVertical: 15,
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
