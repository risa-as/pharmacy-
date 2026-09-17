import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../../services/api';
import { Radius } from '../../constants/colors';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { usePalette, Surface, IconTile, SectionTitle, StatusBadge, AppButton, InfoNote, StateBlock } from '../../components/ui/Kit';
import { formatDate } from '../../utils/date';
import { formatNumber, CURRENCY } from '../../utils/format';
import { purchaseStatus } from '../../utils/status';

/** Purchase order details (design purchase-detail.png). */
export default function PurchaseDetailsScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const C = usePalette();
    const insets = useSafeAreaInsets();

    const [purchase, setPurchase] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const fetchDetails = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            setPurchase(await apiService.getPurchaseDetails(id as string));
        } catch (error) {
            console.error(error);
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { if (id) fetchDetails(); }, [fetchDetails, id]);

    const handleWhatsApp = () => {
        if (!purchase) return;
        const itemsList = purchase.items.map((i: any) => `- ${i.drugName}: ${i.quantity}`).join('\n');
        const message = `*طلب شراء من ${purchase.branch?.name ?? ''}*\n\n${itemsList}`;
        let phone = (purchase.supplier?.phone?.replace(/\D/g, '') || '');
        if (phone.startsWith('07')) phone = '964' + phone.substring(1);
        const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
        Linking.canOpenURL(url).then(supported => {
            Linking.openURL(supported ? url : `https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
        });
    };

    const handleCancel = () => {
        Alert.alert(
            'إلغاء طلب الشراء',
            'سيُلغى الطلب ولن يمكن استلامه. لا يمكن التراجع عن هذا الإجراء.',
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

    const header = <ScreenHeader title="تفاصيل طلب الشراء" fallbackHref="/(tabs)/purchases" />;

    if (loading) return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {header}
            <StateBlock loading title="جارِ تحميل الطلب…" />
        </View>
    );

    if (failed || !purchase) return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {header}
            <StateBlock
                icon="alert-circle-outline"
                title={failed ? 'تعذّر تحميل الطلب' : 'الطلب غير موجود'}
                message={failed ? 'تحقق من الاتصال ثم أعد المحاولة.' : undefined}
                actionLabel={failed ? 'إعادة المحاولة' : undefined}
                onAction={failed ? fetchDetails : undefined}
            />
        </View>
    );

    const status = purchaseStatus(purchase.status);
    const isPending = purchase.status === 'PENDING';
    const isCancelled = purchase.status === 'CANCELLED';
    const refId = purchase.id.slice(0, 8).toUpperCase();
    const estimatedTotal = purchase.items.reduce((s: number, i: any) => s + i.quantity * (i.cost ?? 0), 0);

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {header}
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
                <Surface style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View>
                        <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right' }}>طلب</Text>
                        <Text style={{ color: C.foreground, fontSize: 26, fontWeight: '900', textAlign: 'right' }}>#{refId}</Text>
                    </View>
                    <StatusBadge label={status.label} tone={status.tone} icon={isPending ? 'time-outline' : undefined} />
                </Surface>

                {isCancelled && <InfoNote tone="danger" text="تم إلغاء هذا الطلب ولا يمكن استلامه." />}

                <Surface padded={false} style={{ overflow: 'hidden' }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
                        <IconTile icon="storefront-outline" size={38} />
                        <Text style={{ color: C.mutedForeground, fontSize: 14 }}>مورد الطلب</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '800', textAlign: 'left' }} numberOfLines={1}>{purchase.supplier?.name ?? '—'}</Text>
                            {purchase.supplier?.phone ? <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'left' }}>{purchase.supplier.phone}</Text> : null}
                        </View>
                        {!isCancelled && purchase.supplier?.phone ? (
                            <TouchableOpacity onPress={handleWhatsApp} accessibilityLabel="إرسال الطلب عبر واتساب" style={{ width: 40, height: 40, borderRadius: Radius.control, backgroundColor: C.successBg, alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="logo-whatsapp" size={22} color={C.success} />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 14 }}>
                        <IconTile icon="calendar-outline" size={38} />
                        <Text style={{ color: C.mutedForeground, fontSize: 14 }}>تاريخ الطلب</Text>
                        <Text style={{ flex: 1, color: C.foreground, fontSize: 15, fontWeight: '700', textAlign: 'left' }}>
                            {formatDate(purchase.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}
                        </Text>
                    </View>
                </Surface>

                <View>
                    <SectionTitle title="الأصناف" trailing={`${formatNumber(purchase.items.length)} صنف`} />
                    <Surface padded={false} style={{ overflow: 'hidden' }}>
                        {purchase.items.map((item: any, index: number) => (
                            <View key={item.id ?? index} style={{
                                flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 14,
                                borderTopWidth: index === 0 ? 0 : 1, borderTopColor: C.border,
                            }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: C.foreground, fontSize: 15.5, fontWeight: '800', textAlign: 'right' }} numberOfLines={2}>{item.drugName}</Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }}>
                                        الكمية {formatNumber(item.quantity)}{item.cost ? ` · ${formatNumber(item.cost)} ${CURRENCY} للوحدة` : ''}
                                    </Text>
                                </View>
                                <Text style={{ color: C.primary, fontSize: 17, fontWeight: '900' }}>
                                    {item.cost ? `${formatNumber(item.quantity * item.cost)} ${CURRENCY}` : '—'}
                                </Text>
                            </View>
                        ))}
                    </Surface>
                </View>

                <Surface style={{ backgroundColor: C.primaryMuted, borderColor: C.primaryMuted, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
                    <IconTile icon="calculator-outline" size={40} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 13.5, textAlign: 'right' }}>الإجمالي التقديري</Text>
                        <Text style={{ color: C.primary, fontSize: 30, fontWeight: '900', textAlign: 'right' }}>
                            {formatNumber(estimatedTotal)} <Text style={{ fontSize: 15, color: C.mutedForeground }}>{CURRENCY}</Text>
                        </Text>
                    </View>
                </Surface>

                {isPending && (
                    <View style={{ gap: 10 }}>
                        <AppButton label="استلام المواد" icon="cube-outline" onPress={() => router.push(`/purchases/${id}/receive` as Href)} />
                        <AppButton label="إلغاء الطلب" icon="close-circle-outline" variant="dangerOutline" loading={cancelling} onPress={handleCancel} />
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
