import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Switch, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';
import { Card } from '../../components/ui/Card';
import { notificationsService } from '../../services/notifications';

const PREFS_KEY = 'notification_prefs';

interface NotifPrefs {
    lowStock: boolean;
    expiry: boolean;
    purchases: boolean;
}

const DEFAULT_PREFS: NotifPrefs = { lowStock: true, expiry: true, purchases: true };

const CATEGORIES = [
    {
        key: 'lowStock' as const,
        title: 'نقص المخزون',
        description: 'عند انخفاض المخزون تحت الحد الأدنى',
        icon: 'alert-circle' as const,
        variant: 'danger' as const,
    },
    {
        key: 'expiry' as const,
        title: 'قرب انتهاء الصلاحية',
        description: 'عند اقتراب تاريخ انتهاء صلاحية دفعة',
        icon: 'time' as const,
        variant: 'warning' as const,
    },
    {
        key: 'purchases' as const,
        title: 'طلبات الشراء',
        description: 'عند إنشاء أو استلام طلب شراء جديد',
        icon: 'receipt' as const,
        variant: 'info' as const,
    },
];

export default function NotificationsSettingsScreen() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
    const [pushToken, setPushToken] = useState<string | null>(null);
    const [testLoading, setTestLoading] = useState(false);

    useEffect(() => {
        void (async () => {
            try {
                const saved = await SecureStore.getItemAsync(PREFS_KEY);
                if (saved) setPrefs(JSON.parse(saved));
            } catch {
                // fallback to defaults
            }
            try {
                const token = await SecureStore.getItemAsync('expoPushToken');
                setPushToken(token);
            } catch {
                // token may not be stored yet
            }
        })();
    }, []);

    const savePrefs = useCallback(async (next: NotifPrefs) => {
        setPrefs(next);
        void Haptics.selectionAsync();
        try {
            await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(next));
        } catch {
            // silent
        }
    }, []);

    const toggle = (key: keyof NotifPrefs) => {
        savePrefs({ ...prefs, [key]: !prefs[key] });
    };

    const handleTestNotification = async () => {
        setTestLoading(true);
        try {
            await notificationsService.scheduleLocalNotification(
                'اختبار الإشعارات',
                'يعمل نظام الإشعارات بشكل صحيح ✓',
            );
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setTestLoading(false);
        }
    };

    const variantColor: Record<string, string> = {
        danger:  C.danger,
        warning: C.warning,
        info:    C.info,
        success: C.success,
    };
    const variantBg: Record<string, string> = {
        danger:  C.dangerBg,
        warning: C.warningBg,
        info:    C.infoBg,
        success: C.successBg,
    };

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        >
            {/* Section: Category Toggles */}
            <Text style={{ color: C.mutedForeground, fontSize: 13, fontWeight: '600', textAlign: 'right', marginBottom: 10 }}>
                فئات الإشعارات
            </Text>
            <Card className="mb-6">
                {CATEGORIES.map((cat, idx) => (
                    <View key={cat.key}>
                        <View style={{
                            flexDirection: 'row-reverse',
                            alignItems: 'center',
                            paddingVertical: 14,
                            gap: 12,
                        }}>
                            {/* Icon */}
                            <View style={{
                                backgroundColor: variantBg[cat.variant],
                                borderRadius: 10, padding: 8, flexShrink: 0,
                            }}>
                                <Ionicons name={cat.icon} size={20} color={variantColor[cat.variant]} />
                            </View>
                            {/* Label */}
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontWeight: '600', fontSize: 14, textAlign: 'right' }}>
                                    {cat.title}
                                </Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }}>
                                    {cat.description}
                                </Text>
                            </View>
                            {/* Toggle */}
                            <Switch
                                value={prefs[cat.key]}
                                onValueChange={() => toggle(cat.key)}
                                trackColor={{ false: C.border, true: `${C.primary}80` }}
                                thumbColor={prefs[cat.key] ? C.primary : C.mutedForeground}
                                ios_backgroundColor={C.border}
                            />
                        </View>
                        {idx < CATEGORIES.length - 1 && (
                            <View style={{ height: 1, backgroundColor: C.border }} />
                        )}
                    </View>
                ))}
            </Card>

            {/* Section: Test Notification */}
            <Text style={{ color: C.mutedForeground, fontSize: 13, fontWeight: '600', textAlign: 'right', marginBottom: 10 }}>
                اختبار
            </Text>
            <Card className="mb-6">
                <TouchableOpacity
                    onPress={handleTestNotification}
                    disabled={testLoading}
                    style={{
                        flexDirection: 'row-reverse',
                        alignItems: 'center',
                        paddingVertical: 14,
                        gap: 12,
                        opacity: testLoading ? 0.6 : 1,
                    }}
                    activeOpacity={0.75}
                >
                    <View style={{ backgroundColor: C.primaryMuted, borderRadius: 10, padding: 8, flexShrink: 0 }}>
                        {testLoading
                            ? <ActivityIndicator size="small" color={C.primary} />
                            : <Ionicons name="notifications-outline" size={20} color={C.primary} />
                        }
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.foreground, fontWeight: '600', fontSize: 14, textAlign: 'right' }}>
                            إرسال إشعار تجريبي
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }}>
                            تحقق أن الإشعارات تصلك بشكل صحيح
                        </Text>
                    </View>
                    <Ionicons name="chevron-back" size={18} color={C.mutedForeground} />
                </TouchableOpacity>
            </Card>

            {/* Section: Debug — push token */}
            {pushToken && (
                <>
                    <Text style={{ color: C.mutedForeground, fontSize: 13, fontWeight: '600', textAlign: 'right', marginBottom: 10 }}>
                        معلومات الجهاز
                    </Text>
                    <Card>
                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginBottom: 4 }}>
                            رمز الإشعارات (Push Token)
                        </Text>
                        <Text
                            style={{ color: C.foreground, fontSize: 11, textAlign: 'right', fontFamily: 'monospace' }}
                            selectable
                            numberOfLines={2}
                        >
                            {pushToken}
                        </Text>
                    </Card>
                </>
            )}
        </ScrollView>
    );
}
