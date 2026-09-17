import React from 'react';
import { View, Text, ScrollView, Linking, Image } from 'react-native';
import Constants from 'expo-constants';
import { Radius } from '../../constants/colors';
import { usePalette, Surface, IconTile, SectionTitle, ListRow } from '../../components/ui/Kit';

/** Version comes from the build configuration, not a hard-coded constant. */
const APP_VERSION = Constants.expoConfig?.version ?? '—';
// eslint-disable-next-line @typescript-eslint/no-deprecated
const BUILD = Constants.nativeBuildVersion ?? '—';

/** About (design about.png). */
export default function AboutScreen() {
    const C = usePalette();

    const rows = [
        { label: 'الإصدار', value: APP_VERSION, icon: 'code-slash-outline' as const },
        { label: 'رقم البناء', value: String(BUILD), icon: 'cube-outline' as const },
        { label: 'المطوّر', value: 'Faramace', icon: 'business-outline' as const },
    ];

    return (
        <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 16 }}>
            <Surface style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
                <View style={{ width: 84, height: 84, borderRadius: Radius.card * 2, overflow: 'hidden', backgroundColor: C.primary }}>
                    <Image source={require('../../assets/images/icon.png')} style={{ width: 84, height: 84 }} resizeMode="cover" />
                </View>
                <Text style={{ color: C.foreground, fontSize: 24, fontWeight: '900' }}>فاراماس</Text>
                <Text style={{ color: C.mutedForeground, fontSize: 14 }}>إدارة الصيدليات والمخزون الدوائي</Text>
            </Surface>

            <Surface padded={false} style={{ overflow: 'hidden' }}>
                {rows.map((r, i) => (
                    <View key={r.label} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }}>
                        <IconTile icon={r.icon} size={38} />
                        <Text style={{ flex: 1, color: C.mutedForeground, fontSize: 14.5, textAlign: 'right' }}>{r.label}</Text>
                        <Text selectable style={{ color: C.foreground, fontSize: 15, fontWeight: '800' }}>{r.value}</Text>
                    </View>
                ))}
            </Surface>

            <View>
                <SectionTitle title="روابط" />
                <Surface padded={false} style={{ overflow: 'hidden' }}>
                    <ListRow icon="globe-outline" title="الموقع الإلكتروني" divider onPress={() => Linking.openURL('https://www.faramace.com')} />
                    <ListRow icon="document-text-outline" title="سياسة الخصوصية" divider onPress={() => Linking.openURL('https://www.faramace.com/privacy')} />
                    <ListRow icon="reader-outline" title="شروط الاستخدام" onPress={() => Linking.openURL('https://www.faramace.com/terms')} />
                </Surface>
            </View>

            <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'center' }}>© {new Date().getFullYear()} Faramace · جميع الحقوق محفوظة</Text>
        </ScrollView>
    );
}
