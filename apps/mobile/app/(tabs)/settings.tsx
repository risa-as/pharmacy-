import React from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { router, Href } from 'expo-router';
import { authService } from '../../services/auth';
import { dbService } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Radius } from '../../constants/colors';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { usePalette, Surface, SectionTitle, ListRow, AppButton } from '../../components/ui/Kit';

/** Settings (design settings.png, navigation-map §5) — lives inside «المزيد». */
export default function SettingsScreen() {
    const C = usePalette();
    const { isDarkMode } = useTheme();
    const { user } = useAuth();
    const go = (href: string) => router.push(href as Href);

    const handleLogout = async () => {
        const pending = await dbService.getPendingSales().catch(() => []);
        Alert.alert(
            'تسجيل الخروج',
            pending.length > 0
                ? `توجد ${pending.length} عملية بيع محفوظة على الجهاز لم تُزامن بعد. ستبقى على الجهاز وتُرسل بعد تسجيل الدخول مجدداً. هل تريد الخروج؟`
                : 'هل أنت متأكد من تسجيل الخروج؟',
            [
                { text: 'إلغاء', style: 'cancel' },
                { text: 'خروج', style: 'destructive', onPress: async () => { await authService.logout(); router.replace('/login'); } },
            ],
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <ScreenHeader title="الإعدادات" fallbackHref="/(tabs)/more" />
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 18 }} showsVerticalScrollIndicator={false}>
                <View>
                    <SectionTitle title="الحساب" />
                    <Surface padded={false} style={{ overflow: 'hidden' }}>
                        <ListRow icon="person-outline" title="حسابي" subtitle="الاسم والبريد والدور" divider onPress={() => go('/settings/account')} />
                        <ListRow icon="lock-closed-outline" title="تغيير كلمة المرور" subtitle="أمان الحساب" onPress={() => go('/settings/password')} />
                    </Surface>
                </View>

                <View>
                    <SectionTitle title="التفضيلات والأجهزة" />
                    <Surface padded={false} style={{ overflow: 'hidden' }}>
                        <ListRow icon="notifications-outline" title="الإشعارات" subtitle="فئات التنبيهات وإذن الجهاز" divider onPress={() => go('/settings/notifications')} />
                        <ListRow icon={isDarkMode ? 'moon-outline' : 'sunny-outline'} title="المظهر" subtitle={isDarkMode ? 'الوضع الليلي' : 'الوضع النهاري'} divider onPress={() => go('/settings/theme')} />
                        <ListRow icon="print-outline" title="الطابعة" subtitle="البحث والاتصال والطباعة التجريبية" onPress={() => go('/printer-settings')} />
                    </Surface>
                </View>

                <View>
                    <SectionTitle title="المساعدة" />
                    <Surface padded={false} style={{ overflow: 'hidden' }}>
                        <ListRow icon="help-circle-outline" title="الدعم والمساعدة" subtitle="الاتصال وواتساب والأسئلة الشائعة" divider onPress={() => go('/settings/support')} />
                        <ListRow icon="information-circle-outline" title="حول التطبيق" subtitle="الإصدار والمعلومات" onPress={() => go('/settings/about')} />
                    </Surface>
                </View>

                <AppButton label="تسجيل الخروج" icon="log-out-outline" variant="dangerOutline" onPress={handleLogout} style={{ borderRadius: Radius.control }} />
            </ScrollView>
        </View>
    );
}
