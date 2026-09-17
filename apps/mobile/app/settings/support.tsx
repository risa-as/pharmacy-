import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Href } from 'expo-router';
import { Radius } from '../../constants/colors';
import { usePalette, Surface, IconTile, SectionTitle, AppButton, InfoNote, Tone } from '../../components/ui/Kit';

const PHONE = '+9647857581997';
const WHATSAPP_URL = 'https://wa.me/9647857581997';
const WHATSAPP_GREEN = '#25D366';

/** Each question opens the screen where the task is actually done. */
const FAQS: {
    q: string;
    where: string;
    icon: React.ComponentProps<typeof IconTile>['icon'];
    tone: Tone;
    href: string;
}[] = [
    { q: 'كيف أضيف صنفاً؟', where: 'من المخزون ثم إضافة', icon: 'cube-outline', tone: 'primary', href: '/(tabs)/inventory' },
    { q: 'كيف أسجل بيعاً؟', where: 'من نقطة البيع', icon: 'cart-outline', tone: 'success', href: '/(tabs)/sales' },
    { q: 'كيف أطلب من المورد؟', where: 'من الطلبات الذكية', icon: 'document-text-outline', tone: 'warning', href: '/(tabs)/smart-orders' },
];

/** Support (design support.png): call, WhatsApp, and questions that open the right screen. */
export default function SupportScreen() {
    const C = usePalette();

    return (
        <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 16 }}>
            <Surface style={{ alignItems: 'center', gap: 8 }}>
                <Text style={{ color: C.foreground, fontSize: 20, fontWeight: '900' }}>كيف نساعدك؟</Text>
                <Text style={{ color: C.mutedForeground, fontSize: 14 }}>اختر وسيلة التواصل المناسبة</Text>
                <View style={{ flexDirection: 'row-reverse', gap: 10, alignSelf: 'stretch', marginTop: 6 }}>
                    <AppButton label="اتصال" icon="call-outline" style={{ flex: 1, paddingVertical: 11 }} onPress={() => Linking.openURL(`tel:${PHONE}`)} />
                    {/* WhatsApp keeps its own green, as in the design */}
                    <TouchableOpacity
                        onPress={() => Linking.openURL(WHATSAPP_URL)}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="واتساب"
                        style={{
                            flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
                            backgroundColor: C.card, borderWidth: 1, borderColor: WHATSAPP_GREEN,
                            borderRadius: Radius.control, paddingVertical: 11, paddingHorizontal: 14,
                        }}
                    >
                        <Text style={{ color: WHATSAPP_GREEN, fontSize: 15, fontWeight: '800' }}>واتساب</Text>
                        <Ionicons name="logo-whatsapp" size={18} color={WHATSAPP_GREEN} />
                    </TouchableOpacity>
                </View>
            </Surface>

            <View>
                <SectionTitle title="أسئلة شائعة" />
                <View style={{ gap: 10 }}>
                    {FAQS.map(f => (
                        <TouchableOpacity
                            key={f.q}
                            onPress={() => router.push(f.href as Href)}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={`${f.q} — ${f.where}`}
                        >
                            <Surface padded={false} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12 }}>
                                <IconTile icon={f.icon} tone={f.tone} size={44} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: C.foreground, fontSize: 15.5, fontWeight: '900', textAlign: 'right' }} numberOfLines={1}>{f.q}</Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>{f.where}</Text>
                                </View>
                                <View style={{ width: 1, height: 34, backgroundColor: C.border }} />
                                <View style={{
                                    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
                                    backgroundColor: C.primaryMuted, borderRadius: Radius.control,
                                    paddingHorizontal: 12, paddingVertical: 8,
                                }}>
                                    <Text style={{ color: C.primary, fontSize: 13.5, fontWeight: '800' }}>فتح</Text>
                                    <Ionicons name="chevron-back" size={15} color={C.primary} />
                                </View>
                            </Surface>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <InfoNote text="عند انقطاع الإنترنت يُحفظ البيع النقدي والبطاقة على الجهاز ويُرسل عند عودة الاتصال. البيع الآجل يحتاج اتصالاً." />
            <View style={{ height: Radius.card }} />
        </ScrollView>
    );
}
