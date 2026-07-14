import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, ScrollView, ActivityIndicator,
    TouchableOpacity, Linking, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { managerPalette, Radius } from '../../constants/colors';
import { formatDate } from '../../utils/date';

const STATUS_CONFIG: Record<string, { label: string; color: (C: any) => string; bg: (C: any) => string }> = {
    PENDING:   { label: 'قيد الانتظار', color: C => C.warning,  bg: C => C.warningBg  },
    COMPLETED: { label: 'مكتمل',        color: C => C.success,  bg: C => C.successBg  },
    RECEIVED:  { label: 'تم الاستلام',  color: C => C.primary,  bg: C => C.primaryMuted },
    CANCELLED: { label: 'ملغى',          color: C => C.danger,   bg: C => C.dangerBg   },
};

export default function PurchaseDetailsScreen() {
    const { id } = useLocalSearchParams();
    const router  = useRouter();
    const { isDarkMode } = useTheme();
    const insets = useSafeAreaInsets();
    const C = managerPalette(isDarkMode);

    const [purchase, setPurchase]   = useState<any>(null);
    const [loading, setLoading]     = useState(true);
    const [cancelling, setCancelling] = useState(false);

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

    // Custom header — replaces the native (brand-coloured) Stack header for a
    // look consistent with the rest of the manager screens.
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
                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }}>تفاصيل الطلب</Text>
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

    if (!purchase) return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {Header}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="alert-circle-outline" size={48} color={C.mutedForeground} />
                <Text style={{ color: C.mutedForeground, fontSize: 16, marginTop: 12 }}>الطلب غير موجود</Text>
            </View>
        </View>
    );

    const isPending   = purchase.status === 'PENDING';
    const isCancelled = purchase.status === 'CANCELLED';
    const statusCfg   = STATUS_CONFIG[purchase.status] ?? STATUS_CONFIG.PENDING;
    const statusColor = statusCfg.color(C);
    const refId       = purchase.id.slice(0, 8).toUpperCase();
    const totalQty    = purchase.items.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0);
    const invoiceTotal = purchase.items.reduce((s: number, i: any) => s + i.quantity * (i.cost ?? 0), 0);

    // Translucent chip used inside the coloured hero.
    const heroChip = (icon: keyof typeof Ionicons.glyphMap, text: string) => (
        <View style={{
            flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
            backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.xs,
            paddingHorizontal: 9, paddingVertical: 5,
        }}>
            <Ionicons name={icon} size={12} color="rgba(255,255,255,0.9)" />
            <Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '600' }}>{text}</Text>
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {Header}

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>

                {/* ── Hero summary ───────────────────────────────────────── */}
                <View style={{
                    borderRadius: Radius.sm,
                    shadowColor: C.primary, shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: isDarkMode ? 0.45 : 0.28, shadowRadius: 18, elevation: 8,
                    marginBottom: 14,
                }}>
                    <View style={{ borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: C.primary, padding: 20 }}>
                        {/* Top: identity + status */}
                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 9 }}>
                                <View style={{ width: 34, height: 34, borderRadius: Radius.xs, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                                    <Ionicons name="receipt" size={18} color="#fff" />
                                </View>
                                <View>
                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>طلب شراء</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, letterSpacing: 0.4 }}>REF# {refId}</Text>
                                </View>
                            </View>
                            <View style={{
                                flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
                                backgroundColor: '#fff', borderRadius: Radius.xs,
                                paddingHorizontal: 10, paddingVertical: 5,
                            }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
                                <Text style={{ color: statusColor, fontSize: 12, fontWeight: '800' }}>{statusCfg.label}</Text>
                            </View>
                        </View>

                        {/* Total headline */}
                        <View style={{ alignItems: 'flex-end', marginTop: 18 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>
                                الإجمالي التقديري
                            </Text>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6 }}>
                                <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: 0.3 }}>
                                    {invoiceTotal.toLocaleString('en-US')}
                                </Text>
                                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '700' }}>د.ع</Text>
                            </View>
                        </View>

                        {/* Meta chips */}
                        <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 16 }}>
                            {heroChip('calendar-outline', formatDate(purchase.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }))}
                            {heroChip('cube-outline', `${purchase.items.length} صنف · ${totalQty} قطعة`)}
                        </View>
                    </View>
                </View>

                {/* ── Supplier card ──────────────────────────────────────── */}
                <View style={{ ...card(C.primary), padding: 14, marginBottom: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 46, height: 46, borderRadius: Radius.xs, backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="business" size={22} color={C.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginBottom: 2 }}>المورد</Text>
                        <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15, textAlign: 'right' }} numberOfLines={1}>
                            {purchase.supplier.name}
                        </Text>
                        {purchase.supplier.phone && (
                            <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 1 }}>
                                {purchase.supplier.phone}
                            </Text>
                        )}
                    </View>
                    {!isCancelled && (
                        <TouchableOpacity
                            onPress={handleWhatsApp}
                            activeOpacity={0.85}
                            style={{ width: 46, height: 46, borderRadius: Radius.xs, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <Ionicons name="logo-whatsapp" size={24} color="#fff" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* ── Actions (pending) ──────────────────────────────────── */}
                {isPending && (
                    <View style={{ flexDirection: 'row-reverse', gap: 10, marginBottom: 14 }}>
                        <TouchableOpacity
                            onPress={() => router.push(`/purchases/${id}/receive` as any)}
                            activeOpacity={0.85}
                            style={{
                                flex: 1, flexDirection: 'row-reverse',
                                justifyContent: 'center', alignItems: 'center', gap: 7,
                                backgroundColor: C.primary, borderRadius: Radius.sm, paddingVertical: 14,
                            }}
                        >
                            <Ionicons name="archive" size={17} color="#fff" />
                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>استلام المواد</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleCancel}
                            disabled={cancelling}
                            activeOpacity={0.85}
                            style={{
                                flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 7,
                                backgroundColor: C.dangerBg, borderRadius: Radius.sm, paddingVertical: 14, paddingHorizontal: 18,
                                borderWidth: 1.5, borderColor: `${C.danger}50`,
                                opacity: cancelling ? 0.6 : 1,
                            }}
                        >
                            {cancelling
                                ? <ActivityIndicator size="small" color={C.danger} />
                                : <Ionicons name="close-circle-outline" size={17} color={C.danger} />
                            }
                            <Text style={{ color: C.danger, fontWeight: '800', fontSize: 14 }}>
                                {cancelling ? 'إلغاء...' : 'إلغاء'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Cancelled banner */}
                {isCancelled && (
                    <View style={{
                        ...card(C.danger), padding: 13, marginBottom: 14,
                        flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                    }}>
                        <View style={{ width: 32, height: 32, borderRadius: Radius.xs, backgroundColor: C.dangerBg, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="close-circle" size={18} color={C.danger} />
                        </View>
                        <Text style={{ color: C.foreground, fontSize: 13, fontWeight: '700' }}>
                            تم إلغاء هذا الطلب
                        </Text>
                    </View>
                )}

                {/* ── Items (invoice-style card) ──────────────────────────── */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 2 }}>
                    <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: C.primary }} />
                    <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '800', textAlign: 'right' }}>
                        المواد المطلوبة
                    </Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 13, fontWeight: '600' }}>
                        ({purchase.items.length} صنف)
                    </Text>
                </View>

                <View style={{ ...card(C.primary), overflow: 'hidden' }}>
                    {purchase.items.map((item: any, index: number) => (
                        <View key={index}>
                            {index > 0 && <View style={{ height: 1, backgroundColor: C.border }} />}
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', padding: 13, gap: 10 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 14, textAlign: 'right' }} numberOfLines={1}>
                                        {item.drugName}
                                    </Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }}>
                                        {(item.cost ?? 0).toLocaleString('en-US')} د.ع / قطعة
                                    </Text>
                                </View>
                                <View style={{ alignItems: 'flex-start', gap: 4 }}>
                                    <View style={{ backgroundColor: C.primaryMuted, borderRadius: Radius.xs, paddingHorizontal: 8, paddingVertical: 2 }}>
                                        <Text style={{ color: C.primary, fontSize: 12, fontWeight: '800' }}>×{item.quantity}</Text>
                                    </View>
                                    <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 14 }}>
                                        {(item.quantity * (item.cost ?? 0)).toLocaleString('en-US')} د.ع
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ))}

                    {/* Total footer */}
                    <View style={{ height: 1, backgroundColor: C.border }} />
                    <View style={{
                        flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
                        backgroundColor: C.primaryMuted, paddingHorizontal: 14, paddingVertical: 13,
                    }}>
                        <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '800' }}>الإجمالي</Text>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 4 }}>
                            <Text style={{ color: C.primary, fontWeight: '900', fontSize: 19 }}>
                                {invoiceTotal.toLocaleString('en-US')}
                            </Text>
                            <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '700' }}>د.ع</Text>
                        </View>
                    </View>
                </View>

            </ScrollView>
        </View>
    );
}
