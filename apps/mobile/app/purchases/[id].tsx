import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { apiService } from '../../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

export default function PurchaseDetailsScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [purchase, setPurchase] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    useEffect(() => { if (id) fetchDetails(); }, [id]);

    const fetchDetails = async () => {
        try {
            const data = await apiService.getPurchaseDetails(id as string);
            setPurchase(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleWhatsApp = () => {
        if (!purchase) return;
        const itemsList = purchase.items.map((i: any) => `- ${i.drugName}: ${i.quantity} قطعة`).join('\n');
        const message = `*طلب شراء جديد من ${purchase.branch.name}*\n\n${itemsList}`;
        let phone = (purchase.supplier.phone?.replace(/\D/g, '') || '');
        if (phone.startsWith('07')) phone = '964' + phone.substring(1);
        const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
        Linking.canOpenURL(url).then(supported => {
            Linking.openURL(supported ? url : `https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
        });
    };

    if (loading) return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background }}>
            <ActivityIndicator size="large" color={C.primary} />
        </View>
    );

    if (!purchase) return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background }}>
            <Text style={{ color: C.mutedForeground, fontSize: 18, textAlign: 'center', marginTop: 50 }}>الطلب غير موجود</Text>
        </View>
    );

    const isPending = purchase.status === 'PENDING';

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <Stack.Screen options={{
                title: `طلب #${purchase.id.slice(0, 8)}`,
                headerBackTitle: 'عودة',
                headerStyle: { backgroundColor: C.card },
                headerTintColor: C.foreground,
            }} />

            <ScrollView contentContainerStyle={{ padding: 20 }}>
                {/* Header Card */}
                <View style={{
                    backgroundColor: C.card,
                    borderRadius: 8, padding: 20, marginBottom: 20,
                    borderWidth: 1, borderColor: C.border,
                }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 16 }}>
                        <View style={{
                            width: 48, height: 48, borderRadius: 6,
                            backgroundColor: C.primaryMuted,
                            justifyContent: 'center', alignItems: 'center', marginLeft: 16,
                        }}>
                            <Ionicons name="business" size={24} color={C.primary} />
                        </View>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 12, color: C.mutedForeground, marginBottom: 4 }}>المورد</Text>
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.foreground }}>{purchase.supplier.name}</Text>
                        </View>
                    </View>

                    <View style={{ height: 1, backgroundColor: C.border, marginBottom: 16 }} />

                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 12, color: C.mutedForeground, marginBottom: 4 }}>التاريخ</Text>
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.foreground }}>
                                {new Date(purchase.createdAt).toLocaleDateString('ar-EG')}
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 12, color: C.mutedForeground, marginBottom: 4 }}>الحالة</Text>
                            <View style={{
                                paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4,
                                backgroundColor: isPending ? C.warningBg : C.successBg,
                            }}>
                                <Text style={{
                                    fontWeight: 'bold', fontSize: 12,
                                    color: isPending ? C.warning : C.success,
                                }}>
                                    {isPending ? 'قيد الانتظار' : 'مكتمل'}
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Actions */}
                <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: 24 }}>
                    <TouchableOpacity
                        style={{
                            flex: 1, flexDirection: 'row-reverse',
                            justifyContent: 'center', alignItems: 'center',
                            padding: 16, borderRadius: 6, gap: 8,
                            backgroundColor: '#25D366',
                        }}
                        onPress={handleWhatsApp}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>مراسلة المورد</Text>
                    </TouchableOpacity>

                    {isPending && (
                        <TouchableOpacity
                            style={{
                                flex: 1, flexDirection: 'row-reverse',
                                justifyContent: 'center', alignItems: 'center',
                                padding: 16, borderRadius: 6, gap: 8,
                                backgroundColor: C.primary,
                            }}
                            onPress={() => router.push(`/purchases/${id}/receive` as any)}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="archive" size={20} color="#fff" />
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>استلام المواد</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Items */}
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: C.foreground, marginBottom: 16, textAlign: 'right' }}>
                    المواد المطلوبة
                </Text>

                {purchase.items.map((item: any, index: number) => (
                    <View key={index} style={{
                        backgroundColor: C.card,
                        borderRadius: 6, padding: 16, marginBottom: 12,
                        borderWidth: 1, borderColor: C.border,
                    }}>
                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.foreground }}>{item.drugName}</Text>
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.primary }}>x{item.quantity}</Text>
                        </View>
                        <Text style={{ fontSize: 14, color: C.mutedForeground, textAlign: 'right' }}>
                            {item.cost.toLocaleString()} د.ع / قطعة
                        </Text>
                    </View>
                ))}

                {/* Total */}
                <View style={{
                    flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
                    backgroundColor: C.card, padding: 20, borderRadius: 8, marginTop: 10,
                    borderWidth: 1, borderColor: C.border,
                }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.mutedForeground }}>الإجمالي التقديري</Text>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', color: C.foreground }}>
                        {purchase.total.toLocaleString()} د.ع
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}
