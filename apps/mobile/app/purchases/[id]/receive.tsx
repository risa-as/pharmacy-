import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TextInput,
    TouchableOpacity,
    Alert,
    Platform,
    KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { apiService } from '../../../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { Colors } from '../../../constants/colors';

export default function ReceiveItemsScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [items, setItems] = useState<any[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    useEffect(() => { if (id) fetchDetails(); }, [id]);

    const fetchDetails = async () => {
        try {
            const data = await apiService.getPurchaseDetails(id as string);
            setItems(data.items.map((item: any) => ({
                ...item,
                itemId: item.id,
                receivedQuantity: item.quantity.toString(),
                batchNumber: '',
                expiryDate: '',
            })));
        } catch (error) {
            console.error(error);
        }
    };

    const updateItem = (index: number, field: string, value: string) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const handleReceive = async () => {
        for (const item of items) {
            if (!item.batchNumber) {
                Alert.alert('خطأ', `يرجى إدخال رقم الوجبة لـ ${item.drugName}`);
                return;
            }
            if (!item.expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(item.expiryDate)) {
                Alert.alert('خطأ', `يرجى إدخال تاريخ انتهاء صحيح (YYYY-MM-DD) لـ ${item.drugName}`);
                return;
            }
        }

        setSubmitting(true);
        try {
            const payload = items.map(item => ({
                itemId: item.itemId,
                quantity: parseInt(item.receivedQuantity) || item.quantity,
                batchNumber: item.batchNumber,
                expiryDate: new Date(item.expiryDate).toISOString(),
            }));
            await apiService.receivePurchase(id as string, payload);
            Alert.alert('نجاح', 'تم استلام المواد وتحديث المخزون', [
                { text: 'تم', onPress: () => router.push('/(tabs)/smart-orders' as any) },
            ]);
        } catch {
            Alert.alert('خطأ', 'فشل عملية الاستلام');
        } finally {
            setSubmitting(false);
        }
    };

    const inputStyle = {
        backgroundColor: C.input,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 10,
        padding: 12,
        fontSize: 14,
        color: C.foreground,
        textAlign: 'right' as const,
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1, backgroundColor: C.background }}
        >
            <Stack.Screen options={{ title: 'استلام المواد', headerBackTitle: 'إلغاء' }} />

            <ScrollView contentContainerStyle={{ padding: 20 }}>
                {/* Info Banner */}
                <View style={{
                    flexDirection: 'row-reverse',
                    backgroundColor: C.infoBg,
                    padding: 16, borderRadius: 12, marginBottom: 20, gap: 12, alignItems: 'center',
                }}>
                    <Ionicons name="information-circle" size={24} color={C.info} />
                    <Text style={{ flex: 1, fontSize: 14, color: C.info, textAlign: 'right', lineHeight: 20 }}>
                        يرجى إدخال تفاصيل الدفعة وتاريخ الانتهاء لكل مادة ليتم إضافتها للمخزون.
                    </Text>
                </View>

                {items.map((item, index) => (
                    <View key={item.id} style={{
                        backgroundColor: C.card,
                        borderRadius: 16, padding: 16, marginBottom: 16,
                        borderWidth: 1, borderColor: C.border,
                    }}>
                        {/* Card Header */}
                        <View style={{
                            flexDirection: 'row-reverse',
                            justifyContent: 'space-between',
                            marginBottom: 16,
                            borderBottomWidth: 1, borderBottomColor: C.border,
                            paddingBottom: 12,
                        }}>
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.foreground }}>{item.drugName}</Text>
                            <Text style={{ fontSize: 14, color: C.primary, fontWeight: '600' }}>الكمية: {item.quantity}</Text>
                        </View>

                        <View style={{ marginBottom: 12 }}>
                            <Text style={{ fontSize: 12, color: C.mutedForeground, marginBottom: 6, textAlign: 'right' }}>
                                رقم الوجبة (Batch)
                            </Text>
                            <TextInput
                                style={inputStyle}
                                placeholder="مثال: BT123"
                                placeholderTextColor={C.mutedForeground}
                                value={item.batchNumber}
                                onChangeText={text => updateItem(index, 'batchNumber', text)}
                            />
                        </View>

                        <View style={{ marginBottom: 4 }}>
                            <Text style={{ fontSize: 12, color: C.mutedForeground, marginBottom: 6, textAlign: 'right' }}>
                                تاريخ الانتهاء (YYYY-MM-DD)
                            </Text>
                            <TextInput
                                style={inputStyle}
                                placeholder="2026-12-31"
                                placeholderTextColor={C.mutedForeground}
                                value={item.expiryDate}
                                onChangeText={text => updateItem(index, 'expiryDate', text)}
                                keyboardType="numeric"
                            />
                        </View>
                    </View>
                ))}

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Footer */}
            <View style={{
                padding: 20,
                backgroundColor: C.card,
                borderTopWidth: 1, borderTopColor: C.border,
            }}>
                <TouchableOpacity
                    style={{
                        backgroundColor: submitting ? C.primarySoft : C.primary,
                        padding: 16, borderRadius: 16, alignItems: 'center',
                        opacity: submitting ? 0.7 : 1,
                    }}
                    onPress={handleReceive}
                    disabled={submitting}
                    activeOpacity={0.8}
                >
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                        {submitting ? 'جاري المعالجة...' : 'تأكيد الاستلام'}
                    </Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}
