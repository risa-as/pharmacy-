import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Href } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { Radius } from '../../constants/colors';
import { usePalette, Surface, IconTile, SectionTitle, ListRow, InfoNote, StatusBadge } from '../../components/ui/Kit';
import { initials } from '../../utils/format';
import { roleLabel } from '../../utils/roles';

/**
 * My account (design account-v3.png): read-only identity. Copying uses the
 * system share sheet (which offers «نسخ») so no native clipboard module is
 * needed; the full account id is shared, not the truncated one.
 */
export default function AccountScreen() {
    const C = usePalette();
    const { user } = useAuth();

    const shareValue = (value?: string | null) => {
        if (!value) return;
        void Share.share({ message: value });
    };

    const InfoRow = ({ icon, label, value, copy, mono, divider }: {
        icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; copy?: boolean; mono?: boolean; divider?: boolean;
    }) => (
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: divider ? 1 : 0, borderBottomColor: C.border }}>
            <IconTile icon={icon} tone="neutral" size={40} />
            <View style={{ flex: 1 }}>
                <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right' }}>{label}</Text>
                <Text selectable style={{ color: C.foreground, fontSize: mono ? 14 : 16, fontWeight: '700', textAlign: 'right', marginTop: 2, fontFamily: mono ? 'monospace' : undefined, writingDirection: mono ? 'ltr' : undefined }}>
                    {value}
                </Text>
            </View>
            {copy && (
                <TouchableOpacity
                    onPress={() => shareValue(value)}
                    accessibilityLabel={`نسخ ${label}`}
                    style={{ width: 42, height: 42, borderRadius: Radius.control, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Ionicons name="copy-outline" size={20} color={C.mutedForeground} />
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 16 }}>
            <Surface style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 64, height: 64, borderRadius: Radius.card, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>{initials(user?.name) || '؟'}</Text>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                    <Text style={{ color: C.foreground, fontSize: 20, fontWeight: '900', textAlign: 'right' }}>{user?.name ?? 'المستخدم'}</Text>
                    {user?.role ? <View style={{ flexDirection: 'row-reverse' }}><StatusBadge label={roleLabel(user.role)} tone="primary" /></View> : null}
                </View>
            </Surface>

            <View>
                <SectionTitle title="البيانات الشخصية" />
                <Surface padded={false} style={{ overflow: 'hidden' }}>
                    <InfoRow icon="person-outline" label="الاسم الكامل" value={user?.name || '—'} divider />
                    <InfoRow icon="mail-outline" label="البريد الإلكتروني" value={user?.email || '—'} copy={!!user?.email} mono divider />
                    <InfoRow icon="finger-print-outline" label="معرّف الحساب" value={user?.id || '—'} copy={!!user?.id} mono />
                </Surface>
            </View>

            <View>
                <SectionTitle title="أمان الحساب" />
                <Surface padded={false} style={{ overflow: 'hidden' }}>
                    <ListRow icon="shield-checkmark-outline" title="تغيير كلمة المرور" subtitle="حدّث كلمة المرور لحماية حسابك" onPress={() => router.push('/settings/password' as Href)} />
                </Surface>
            </View>

            <InfoNote text="الاسم والبريد والدور يعدّلها مسؤول الصيدلية. تواصل معه لتحديث بياناتك." />
        </ScrollView>
    );
}
