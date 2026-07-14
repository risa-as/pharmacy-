import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Switch, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { managerPalette } from '../../constants/colors';
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
        key:         'lowStock' as const,
        title:       'نقص المخزون',
        description: 'عند انخفاض المخزون تحت الحد الأدنى',
        icon:        'alert-circle' as const,
        iconColor:   (C: any) => C.danger,
        iconBg:      (C: any) => C.dangerBg,
    },
    {
        key:         'expiry' as const,
        title:       'قرب انتهاء الصلاحية',
        description: 'عند اقتراب تاريخ انتهاء صلاحية دفعة',
        icon:        'time' as const,
        iconColor:   (C: any) => C.warning,
        iconBg:      (C: any) => C.warningBg,
    },
    {
        key:         'purchases' as const,
        title:       'طلبات الشراء',
        description: 'عند إنشاء أو استلام طلب شراء جديد',
        icon:        'receipt' as const,
        iconColor:   (C: any) => C.primary,
        iconBg:      (C: any) => C.primaryMuted,
    },
];

export default function NotificationsSettingsScreen() {
    const { isDarkMode } = useTheme();
    const C = managerPalette(isDarkMode);

    const [prefs, setPrefs]           = useState<NotifPrefs>(DEFAULT_PREFS);
    const [pushToken, setPushToken]   = useState<string | null>(null);
    const [testLoading, setTestLoading] = useState(false);

    useEffect(() => {
        void (async () => {
            try {
                const saved = await SecureStore.getItemAsync(PREFS_KEY);
                if (saved) setPrefs(JSON.parse(saved));
            } catch { /* fallback */ }
            try {
                const token = await SecureStore.getItemAsync('expoPushToken');
                setPushToken(token);
            } catch { /* no token */ }
        })();
    }, []);

    const savePrefs = useCallback(async (next: NotifPrefs) => {
        setPrefs(next);
        void Haptics.selectionAsync();
        try { await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(next)); } catch { /* silent */ }
    }, []);

    const toggle = (key: keyof NotifPrefs) => savePrefs({ ...prefs, [key]: !prefs[key] });

    const handleTest = async () => {
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

    const enabledCount = Object.values(prefs).filter(Boolean).length;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
        >
            {/* Summary chip */}
            <View style={{
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: C.card, borderRadius: 5, padding: 14,
                borderWidth: 1.5, borderColor: `${C.primary}33`, marginBottom: 20,
            }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                    <View style={{ backgroundColor: C.primaryMuted, borderRadius: 5, padding: 8 }}>
                        <Ionicons name="notifications" size={20} color={C.primary} />
                    </View>
                    <View>
                        <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '700', textAlign: 'right' }}>
                            الإشعارات
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 1 }}>
                            {enabledCount} من {CATEGORIES.length} فئات مفعّلة
                        </Text>
                    </View>
                </View>
                <View style={{
                    backgroundColor: enabledCount > 0 ? C.successBg : C.input,
                    borderRadius: 5, paddingHorizontal: 10, paddingVertical: 4,
                }}>
                    <Text style={{ color: enabledCount > 0 ? C.success : C.mutedForeground, fontSize: 12, fontWeight: '700' }}>
                        {enabledCount > 0 ? 'مفعّل' : 'معطّل'}
                    </Text>
                </View>
            </View>

            {/* Categories */}
            <Text style={{
                color: C.mutedForeground, fontSize: 11, fontWeight: '700',
                textAlign: 'right', marginBottom: 8, paddingHorizontal: 4, letterSpacing: 0.5,
            }}>
                فئات الإشعارات
            </Text>

            <View style={{
                backgroundColor: C.card, borderRadius: 5,
                borderWidth: 1.5, borderColor: `${C.primary}33`, overflow: 'hidden',
                marginBottom: 20,
                elevation: 1, shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4,
            }}>
                {CATEGORIES.map((cat, idx) => (
                    <View key={cat.key}>
                        <View style={{
                            flexDirection: 'row-reverse', alignItems: 'center',
                            paddingVertical: 14, paddingHorizontal: 14, gap: 12,
                        }}>
                            <View style={{
                                width: 38, height: 38, borderRadius: 5,
                                backgroundColor: cat.iconBg(C),
                                justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                            }}>
                                <Ionicons name={cat.icon} size={19} color={cat.iconColor(C)} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontWeight: '600', fontSize: 14, textAlign: 'right' }}>
                                    {cat.title}
                                </Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }}>
                                    {cat.description}
                                </Text>
                            </View>
                            <Switch
                                value={prefs[cat.key]}
                                onValueChange={() => toggle(cat.key)}
                                trackColor={{ false: C.border, true: `${C.primary}80` }}
                                thumbColor={prefs[cat.key] ? C.primary : C.mutedForeground}
                                ios_backgroundColor={C.border}
                            />
                        </View>
                        {idx < CATEGORIES.length - 1 && (
                            <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 14 }} />
                        )}
                    </View>
                ))}
            </View>

            {/* Test notification */}
            <Text style={{
                color: C.mutedForeground, fontSize: 11, fontWeight: '700',
                textAlign: 'right', marginBottom: 8, paddingHorizontal: 4, letterSpacing: 0.5,
            }}>
                اختبار
            </Text>

            <View style={{
                backgroundColor: C.card, borderRadius: 5,
                borderWidth: 1.5, borderColor: `${C.primary}33`, overflow: 'hidden',
                marginBottom: 20,
            }}>
                <TouchableOpacity
                    onPress={handleTest}
                    disabled={testLoading}
                    activeOpacity={0.75}
                    style={{
                        flexDirection: 'row-reverse', alignItems: 'center',
                        paddingVertical: 14, paddingHorizontal: 14, gap: 12,
                        opacity: testLoading ? 0.6 : 1,
                    }}
                >
                    <View style={{
                        width: 38, height: 38, borderRadius: 5,
                        backgroundColor: C.primaryMuted,
                        justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                    }}>
                        {testLoading
                            ? <ActivityIndicator size="small" color={C.primary} />
                            : <Ionicons name="notifications-outline" size={19} color={C.primary} />
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
                    <Ionicons name="chevron-back" size={16} color={C.mutedForeground} />
                </TouchableOpacity>
            </View>

            {/* Push token (debug) */}
            {pushToken && (
                <>
                    <Text style={{
                        color: C.mutedForeground, fontSize: 11, fontWeight: '700',
                        textAlign: 'right', marginBottom: 8, paddingHorizontal: 4, letterSpacing: 0.5,
                    }}>
                        معلومات الجهاز
                    </Text>
                    <View style={{
                        backgroundColor: C.card, borderRadius: 5,
                        borderWidth: 1.5, borderColor: `${C.primary}33`, padding: 14,
                    }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginBottom: 6 }}>
                            Push Token
                        </Text>
                        <Text
                            style={{ color: C.foreground, fontSize: 11, textAlign: 'right', fontFamily: 'monospace' }}
                            selectable
                            numberOfLines={3}
                        >
                            {pushToken}
                        </Text>
                    </View>
                </>
            )}
        </ScrollView>
    );
}
