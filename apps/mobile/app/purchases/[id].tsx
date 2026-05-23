import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, ScrollView, ActivityIndicator,
    TouchableOpacity, Linking, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { apiService } from '../../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';
import { formatDate } from '../../utils/date';

const STATUS_CONFIG: Record<string, { label: string; color: (C: any) => string; bg: (C: any) => string }> = {
    PENDING:   { label: 'قيد الانتظار', color: C => C.warning,  bg: C => C.warningBg  },
    COMPLETED: { label: 'مكتمل',        color: C => C.success,  bg: C => C.successBg  },
    RECEIVED:  { label: 'تم الاستلام',  color: C => C.info,     bg: C => C.infoBg     },
    CANCELLED: { label: 'ملغى',          color: C => C.danger,   bg: C => C.dangerBg   },
};

export default function PurchaseDetailsScreen() {
    const { id } = useLocalSearchParams();
    const router  = useRouter();
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    const [purchase, setPurchase]   = useState<any>(null);
    const [loading, setLoading]     = useState(true);
    const [cancelling, setCancelling] = useState(false);

    const fetchDetails = useCallback(async () => {
        try {
            const data = await apiService.getPurchaseDetails(id as string);
            setPurchase(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { if (id) fetchDetails(); }, [fetchDetails]);

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

    const handleCancel = () => {
        Alert.alert(
            'إلغاء الطلب',
            'هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.',
            [
                { text: 'تراجع', style: 'cancel' },
                {
                    text: 'نعم، إلغاء الطلب',
                    style: 'destructive',
                    onPress: async () => {
                        setCancelling(true);
                        try {
                            await apiService.cancelPurchase(id as string);
                            setPurchase((prev: any) => ({ ...prev, status: 'CANCELLED' }));
                            Alert.alert('تم', 'تم إلغاء الطلب بنجاح');
                        } catch {
                            Alert.alert('خطأ', 'فشل في إلغاء الطلب، يرجى المحاولة مرة أخرى');
                        } finally {
                            setCancelling(false);
                        }
                    },
                },
            ],
        );
    };

    if (loading) return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background }}>
            <Stack.Screen options={{ title: 'تفاصيل الطلب', headerBackTitle: 'عودة' }} />
            <ActivityIndicator size="large" color={C.primary} />
        </View>
    );

    if (!purchase) return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background }}>
            <Stack.Screen options={{ title: 'تفاصيل الطلب', headerBackTitle: 'عودة' }} />
            <Ionicons name="alert-circle-outline" size={48} color={C.mutedForeground} />
            <Text style={{ color: C.mutedForeground, fontSize: 16, marginTop: 12 }}>الطلب غير موجود</Text>
        </View>
    );

    const isPending   = purchase.status === 'PENDING';
    const isCancelled = purchase.status === 'CANCELLED';
    const statusCfg   = STATUS_CONFIG[purchase.status] ?? STATUS_CONFIG.PENDING;
    const refId       = purchase.id.slice(0, 8).toUpperCase();
    const invoiceTotal = purchase.items.reduce((s: number, i: any) => s + i.quantity * (i.cost ?? 0), 0);

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <Stack.Screen options={{
                title: `طلب #${refId}`,
                headerBackTitle: 'عودة',
                headerStyle: { backgroundColor: C.card },
                headerTintColor: C.foreground,
            }} />

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>

                {/* ── Header card ─────────────────────────────────────────── */}
                <View style={{
                    flexDirection: 'row-reverse',
                    backgroundColor: C.card, borderRadius: 5,
                    borderWidth: 1, borderColor: isCancelled ? `${C.danger}40` : C.border,
                    overflow: 'hidden', marginBottom: 14,
                    elevation: 1, shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4,
                }}>
                    <View style={{ width: 4, backgroundColor: statusCfg.color(C) }} />
                    <View style={{ flex: 1, padding: 16 }}>
                        {/* Supplier row */}
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                            <View style={{
                                backgroundColor: C.primaryMuted, borderRadius: 5, padding: 10,
                            }}>
                                <Ionicons name="business" size={22} color={C.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginBottom: 2 }}>المورد</Text>
                                <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 16, textAlign: 'right' }}>
                                    {purchase.supplier.name}
                                </Text>
                                {purchase.supplier.phone && (
                                    <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 1 }}>
                                        {purchase.supplier.phone}
                                    </Text>
                                )}
                            </View>
                        </View>

                        <View style={{ height: 1, backgroundColor: C.border, marginBottom: 14 }} />

                        {/* Meta row */}
                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 11, marginBottom: 4 }}>التاريخ</Text>
                                <Text style={{ color: C.foreground, fontWeight: '600', fontSize: 14 }}>
                                    {formatDate(purchase.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 11, marginBottom: 4 }}>رقم الطلب</Text>
                                <Text style={{ color: C.mutedForeground, fontWeight: '600', fontSize: 13, letterSpacing: 0.5 }}>
                                    REF# {refId}
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 11, marginBottom: 4 }}>الحالة</Text>
                                <View style={{
                                    backgroundColor: statusCfg.bg(C), borderRadius: 5,
                                    paddingHorizontal: 10, paddingVertical: 4,
                                }}>
                                    <Text style={{ color: statusCfg.color(C), fontSize: 12, fontWeight: '800' }}>
                                        {statusCfg.label}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* ── Actions ─────────────────────────────────────────────── */}
                {!isCancelled && (
                    <View style={{ gap: 10, marginBottom: 14 }}>
                        {/* WhatsApp */}
                        <TouchableOpacity
                            onPress={handleWhatsApp}
                            activeOpacity={0.85}
                            style={{
                                flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center',
                                gap: 8, backgroundColor: '#25D366', borderRadius: 5, paddingVertical: 13,
                            }}
                        >
                            <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>مراسلة المورد</Text>
                        </TouchableOpacity>

                        {isPending && (
                            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                                {/* Receive */}
                                <TouchableOpacity
                                    onPress={() => router.push(`/purchases/${id}/receive` as any)}
                                    activeOpacity={0.85}
                                    style={{
                                        flex: 1, flexDirection: 'row-reverse',
                                        justifyContent: 'center', alignItems: 'center', gap: 7,
                                        backgroundColor: C.primary, borderRadius: 5, paddingVertical: 13,
                                    }}
                                >
                                    <Ionicons name="archive" size={17} color="#fff" />
                                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>استلام المواد</Text>
                                </TouchableOpacity>

                                {/* Cancel */}
                                <TouchableOpacity
                                    onPress={handleCancel}
                                    disabled={cancelling}
                                    activeOpacity={0.85}
                                    style={{
                                        flex: 1, flexDirection: 'row-reverse',
                                        justifyContent: 'center', alignItems: 'center', gap: 7,
                                        backgroundColor: C.dangerBg, borderRadius: 5, paddingVertical: 13,
                                        borderWidth: 1.5, borderColor: `${C.danger}50`,
                                        opacity: cancelling ? 0.6 : 1,
                                    }}
                                >
                                    {cancelling
                                        ? <ActivityIndicator size="small" color={C.danger} />
                                        : <Ionicons name="close-circle-outline" size={17} color={C.danger} />
                                    }
                                    <Text style={{ color: C.danger, fontWeight: '700', fontSize: 14 }}>
                                        {cancelling ? 'جاري الإلغاء...' : 'إلغاء الطلب'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}

                {/* Cancelled banner */}
                {isCancelled && (
                    <View style={{
                        flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                        backgroundColor: C.dangerBg, borderRadius: 5, padding: 13,
                        marginBottom: 14, borderWidth: 1, borderColor: `${C.danger}35`,
                    }}>
                        <Ionicons name="close-circle" size={20} color={C.danger} />
                        <Text style={{ color: C.danger, fontSize: 13, fontWeight: '700' }}>
                            تم إلغاء هذا الطلب
                        </Text>
                    </View>
                )}

                {/* ── Items ───────────────────────────────────────────────── */}
                <Text style={{
                    color: C.foreground, fontSize: 16, fontWeight: '800',
                    textAlign: 'right', marginBottom: 10,
                }}>
                    المواد المطلوبة ({purchase.items.length} صنف)
                </Text>

                {purchase.items.map((item: any, index: number) => (
                    <View key={index} style={{
                        flexDirection: 'row-reverse',
                        backgroundColor: C.card, borderRadius: 5,
                        borderWidth: 1, borderColor: C.border,
                        overflow: 'hidden', marginBottom: 10,
                    }}>
                        <View style={{ width: 3, backgroundColor: C.primary }} />
                        <View style={{ flex: 1, padding: 13 }}>
                            <View style={{
                                flexDirection: 'row-reverse', justifyContent: 'space-between',
                                alignItems: 'flex-start', marginBottom: 6,
                            }}>
                                <Text style={{
                                    color: C.foreground, fontWeight: '700', fontSize: 14,
                                    textAlign: 'right', flex: 1,
                                }} numberOfLines={1}>
                                    {item.drugName}
                                </Text>
                                <View style={{
                                    backgroundColor: C.primaryMuted, borderRadius: 5,
                                    paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8,
                                }}>
                                    <Text style={{ color: C.primary, fontSize: 13, fontWeight: '800' }}>
                                        ×{item.quantity}
                                    </Text>
                                </View>
                            </View>
                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 12 }}>
                                    {(item.cost ?? 0).toLocaleString('en-US')} د.ع / قطعة
                                </Text>
                                <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 14 }}>
                                    {(item.quantity * (item.cost ?? 0)).toLocaleString('en-US')} د.ع
                                </Text>
                            </View>
                        </View>
                    </View>
                ))}

                {/* ── Total ───────────────────────────────────────────────── */}
                <View style={{
                    flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
                    backgroundColor: C.card, borderRadius: 5, padding: 16, marginTop: 4,
                    borderWidth: 1, borderColor: C.border,
                    borderRightWidth: 3, borderRightColor: C.primary,
                }}>
                    <Text style={{ color: C.mutedForeground, fontSize: 14 }}>الإجمالي التقديري</Text>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 4 }}>
                        <Text style={{ color: C.foreground, fontWeight: '900', fontSize: 20 }}>
                            {invoiceTotal.toLocaleString('en-US')}
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 12 }}>د.ع</Text>
                    </View>
                </View>

            </ScrollView>
        </View>
    );
}
