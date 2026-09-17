import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Switch, ScrollView, Linking, AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import {
    notificationsService, readNotificationPrefs, NotificationPrefs,
    NOTIFICATION_PREFS_KEY, DEFAULT_NOTIFICATION_PREFS,
} from '../../services/notifications';
import { usePalette, Surface, IconTile, SectionTitle, AppButton, InfoNote, Tone } from '../../components/ui/Kit';

const CATEGORIES: Array<{ key: keyof NotificationPrefs; title: string; description: string; icon: React.ComponentProps<typeof IconTile>['icon']; tone: Tone }> = [
    { key: 'lowStock', title: 'نقص المخزون', description: 'عند انخفاض المخزون تحت حد الطلب', icon: 'cube-outline', tone: 'warning' },
    { key: 'expiry', title: 'قرب انتهاء الصلاحية', description: 'عند اقتراب انتهاء دفعة', icon: 'time-outline', tone: 'warning' },
    { key: 'purchases', title: 'طلبات الشراء', description: 'عند إنشاء طلب أو استلامه', icon: 'document-text-outline', tone: 'primary' },
];

type PermissionStatus = Awaited<ReturnType<typeof notificationsService.getPermissionStatus>>;

/**
 * Notification settings (design notifications.png). Separates the app's
 * category preferences from the device permission.
 */
export default function NotificationsSettingsScreen() {
    const C = usePalette();
    const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
    const [permission, setPermission] = useState<PermissionStatus>('undetermined');
    const [testing, setTesting] = useState(false);

    const refreshPermission = useCallback(() => {
        notificationsService.getPermissionStatus().then(setPermission);
    }, []);

    useEffect(() => {
        readNotificationPrefs().then(setPrefs);
        refreshPermission();
        const sub = AppState.addEventListener('change', s => { if (s === 'active') refreshPermission(); });
        return () => sub.remove();
    }, [refreshPermission]);

    const toggle = async (key: keyof NotificationPrefs) => {
        const next = { ...prefs, [key]: !prefs[key] };
        setPrefs(next);
        void Haptics.selectionAsync();
        try { await SecureStore.setItemAsync(NOTIFICATION_PREFS_KEY, JSON.stringify(next)); } catch { /* keep UI state */ }
    };

    const requestPermission = async () => {
        if (permission === 'denied') { void Linking.openSettings(); return; }
        await notificationsService.requestPermission();
        refreshPermission();
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            await notificationsService.scheduleLocalNotification('اختبار الإشعارات', 'وصلك هذا الإشعار من فاراماس على هذا الجهاز.');
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } finally {
            setTesting(false);
        }
    };

    const permissionView = {
        granted: { tone: 'success' as Tone, title: 'إذن الإشعارات مفعّل', text: 'يمكن لهذا الجهاز عرض إشعارات فاراماس.' },
        denied: { tone: 'danger' as Tone, title: 'إذن الإشعارات مرفوض', text: 'لن تظهر أي إشعارات حتى تسمح بها من إعدادات الجهاز.' },
        undetermined: { tone: 'warning' as Tone, title: 'لم يُطلب الإذن بعد', text: 'اسمح بالإشعارات ليتمكن الجهاز من عرضها.' },
        unavailable: { tone: 'warning' as Tone, title: 'الإشعارات غير متاحة', text: 'هذه النسخة من التطبيق لا تدعم إشعارات الجهاز.' },
    }[permission];

    return (
        <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 16 }}>
            <View style={{ gap: 10 }}>
                <InfoNote tone={permissionView.tone} title={permissionView.title} text={permissionView.text} />
                {(permission === 'denied' || permission === 'undetermined') && (
                    <AppButton label={permission === 'denied' ? 'فتح إعدادات الجهاز' : 'السماح بالإشعارات'} variant="outline" onPress={requestPermission} />
                )}
            </View>

            <View>
                <SectionTitle title="فئات التنبيهات" />
                <Surface padded={false} style={{ overflow: 'hidden' }}>
                    {CATEGORIES.map((cat, i) => (
                        <View key={cat.key} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }}>
                            <IconTile icon={cat.icon} tone={cat.tone} size={40} />
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '800', textAlign: 'right' }}>{cat.title}</Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right', marginTop: 2 }}>{cat.description}</Text>
                            </View>
                            <Switch
                                value={prefs[cat.key]}
                                onValueChange={() => toggle(cat.key)}
                                trackColor={{ false: C.border, true: C.primary }}
                                thumbColor="#FFFFFF"
                                ios_backgroundColor={C.border}
                                accessibilityLabel={cat.title}
                            />
                        </View>
                    ))}
                </Surface>
                <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right', marginTop: 8, lineHeight: 19 }}>
                    تُطبَّق هذه الفئات على الإشعارات التي تصل أثناء فتح التطبيق. الإشعارات والتنبيهات تبقى ظاهرة في مركز التنبيهات.
                </Text>
            </View>

            <View>
                <SectionTitle title="اختبار الإشعارات" />
                <Surface style={{ gap: 10 }}>
                    <Text style={{ color: C.mutedForeground, fontSize: 13.5, textAlign: 'right' }}>إرسال إشعار محلي على هذا الجهاز فقط للتأكد من ظهوره.</Text>
                    <AppButton label="اختبار إشعار محلي" icon="notifications-outline" loading={testing} disabled={permission !== 'granted'} onPress={handleTest} />
                </Surface>
            </View>
        </ScrollView>
    );
}
