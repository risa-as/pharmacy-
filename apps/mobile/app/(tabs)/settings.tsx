import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authService, User } from '../../services/auth';
import { useTheme } from '../../context/ThemeContext';
import { managerPalette, Radius } from '../../constants/colors';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface MenuItem {
    label: string;
    subtitle?: string;
    icon: IoniconsName;
    iconBg: string;
    iconColor: string;
    onPress: () => void;
}

interface MenuSection {
    title: string;
    items: MenuItem[];
}

const ROLE_LABELS: Record<string, string> = {
    ADMIN:      'مدير',
    PHARMACIST: 'صيدلاني',
    MANAGER:    'مشرف',
    CASHIER:    'كاشير',
};

export default function SettingsScreen() {
    const [user, setUser] = useState<User | null>(null);
    const { isDarkMode } = useTheme();
    const C = managerPalette(isDarkMode);

    useEffect(() => {
        authService.getCurrentUser().then(setUser);
    }, []);

    const handleLogout = () => {
        Alert.alert(
            'تسجيل الخروج',
            'هل أنت متأكد من تسجيل الخروج؟',
            [
                { text: 'إلغاء', style: 'cancel' },
                {
                    text: 'خروج',
                    style: 'destructive',
                    onPress: async () => {
                        await authService.logout();
                        router.replace('/login');
                    },
                },
            ]
        );
    };

    const initials = user?.name
        ? user.name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
        : 'U';

    const menuSections: MenuSection[] = [
        {
            title: 'الحساب',
            items: [
                {
                    label:    'معلومات الحساب',
                    subtitle: 'الاسم والبريد الإلكتروني',
                    icon:     'person-outline',
                    iconBg:   C.primaryMuted,
                    iconColor: C.primary,
                    onPress: () => router.push('/settings/account' as any),
                },
                {
                    label:    'تغيير كلمة المرور',
                    subtitle: 'تحديث كلمة المرور الخاصة بك',
                    icon:     'key-outline',
                    iconBg:   C.warningBg,
                    iconColor: C.warning,
                    onPress: () => router.push('/settings/password' as any),
                },
            ],
        },
        // ── Management (non-pharmacist roles only) ────────────────────────
        ...(user && user.role !== 'PHARMACIST' ? [{
            title: 'الإدارة',
            items: [
                {
                    label:    'المصروفات',
                    subtitle: 'عرض وإضافة مصروفات الصيدلية',
                    icon:     'wallet-outline' as IoniconsName,
                    iconBg:   C.dangerBg,
                    iconColor: C.danger,
                    onPress: () => router.push('/accounting/expenses' as any),
                },
            ],
        }] : []),
        {
            title: 'التطبيق',
            items: [
                {
                    label:    'الإشعارات',
                    subtitle: 'إدارة التنبيهات والإشعارات',
                    icon:     'notifications-outline',
                    iconBg:   C.primaryMuted,
                    iconColor: C.primary,
                    onPress: () => router.push('/settings/notifications' as any),
                },
                {
                    label:    'المظهر',
                    subtitle: isDarkMode ? 'الوضع الليلي مفعّل' : 'الوضع النهاري مفعّل',
                    icon:     isDarkMode ? 'moon' : 'sunny-outline',
                    iconBg:   isDarkMode ? '#2D2A4A' : '#FFF8E7',
                    iconColor: isDarkMode ? '#A78BFA' : '#F59E0B',
                    onPress: () => router.push('/settings/theme' as any),
                },
                {
                    label:    'إعدادات الطابعة',
                    subtitle: 'طابعة الفواتير الحرارية',
                    icon:     'print-outline',
                    iconBg:   C.infoBg,
                    iconColor: C.info,
                    onPress: () => router.push('/printer-settings' as any),
                },
            ],
        },
        {
            title: 'المساعدة',
            items: [
                {
                    label:    'الدعم الفني',
                    subtitle: 'تواصل مع فريق الدعم',
                    icon:     'headset-outline',
                    iconBg:   C.successBg,
                    iconColor: C.success,
                    onPress: () => router.push('/settings/support' as any),
                },
                {
                    label:    'حول التطبيق',
                    subtitle: 'الإصدار والمعلومات',
                    icon:     'information-circle-outline',
                    iconBg:   C.input,
                    iconColor: C.mutedForeground,
                    onPress: () => router.push('/settings/about' as any),
                },
            ],
        },
    ];

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
        >
            {/* ── Profile hero ────────────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 16, paddingTop: 16, marginBottom: 6 }}>
                <View style={{
                    borderRadius: Radius.sm,
                    shadowColor: C.primary, shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: isDarkMode ? 0.45 : 0.28, shadowRadius: 18, elevation: 8,
                }}>
                    <View style={{ borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: C.primary, padding: 18 }}>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 14 }}>
                            {/* Avatar */}
                            <View style={{
                                width: 60, height: 60, borderRadius: Radius.xs,
                                backgroundColor: '#fff',
                                justifyContent: 'center', alignItems: 'center',
                            }}>
                                <Text style={{ color: C.primary, fontSize: 22, fontWeight: '900' }}>
                                    {initials}
                                </Text>
                            </View>

                            {/* Info */}
                            <View style={{ flex: 1, alignItems: 'flex-end', gap: 4 }}>
                                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'right' }} numberOfLines={1}>
                                    {user?.name || 'المستخدم'}
                                </Text>
                                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, textAlign: 'right' }} numberOfLines={1}>
                                    {user?.email || '—'}
                                </Text>
                                {user?.role && (
                                    <View style={{
                                        backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: Radius.xs,
                                        paddingHorizontal: 10, paddingVertical: 3, marginTop: 2,
                                    }}>
                                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                                            {ROLE_LABELS[user.role] ?? user.role}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>
                </View>
            </View>

            <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 22 }}>

                {/* ── Menu sections ────────────────────────────────────────── */}
                {menuSections.map((section, si) => (
                    <View key={si}>
                        {/* Section label */}
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 4 }}>
                            <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: C.primary }} />
                            <Text style={{ color: C.mutedForeground, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>
                                {section.title}
                            </Text>
                        </View>

                        {/* Section card */}
                        <View style={{
                            backgroundColor: C.card, borderRadius: Radius.sm,
                            borderWidth: 1, borderColor: C.border, overflow: 'hidden',
                            shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
                            shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
                        }}>
                            {section.items.map((item, ii) => (
                                <TouchableOpacity
                                    key={ii}
                                    onPress={item.onPress}
                                    activeOpacity={0.7}
                                    style={[
                                        {
                                            flexDirection: 'row-reverse',
                                            alignItems: 'center',
                                            paddingVertical: 13, paddingHorizontal: 14,
                                            gap: 12,
                                        },
                                        ii < section.items.length - 1 && {
                                            borderBottomWidth: 1, borderBottomColor: C.border,
                                        },
                                    ]}
                                >
                                    {/* Icon tile */}
                                    <View style={{
                                        width: 38, height: 38, borderRadius: Radius.xs,
                                        backgroundColor: item.iconBg,
                                        justifyContent: 'center', alignItems: 'center',
                                        flexShrink: 0,
                                    }}>
                                        <Ionicons name={item.icon} size={19} color={item.iconColor} />
                                    </View>

                                    {/* Label + subtitle */}
                                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                        <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '700', textAlign: 'right' }}>
                                            {item.label}
                                        </Text>
                                        {item.subtitle && (
                                            <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 1 }}>
                                                {item.subtitle}
                                            </Text>
                                        )}
                                    </View>

                                    {/* Chevron */}
                                    <Ionicons name="chevron-back" size={16} color={C.mutedForeground} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                ))}

                {/* ── Logout ───────────────────────────────────────────────── */}
                <TouchableOpacity
                    onPress={handleLogout}
                    activeOpacity={0.8}
                    style={{
                        flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
                        gap: 8, borderRadius: Radius.sm, paddingVertical: 14,
                        borderWidth: 1.5, borderColor: `${C.danger}50`,
                        backgroundColor: C.dangerBg,
                    }}
                >
                    <Ionicons name="log-out-outline" size={19} color={C.danger} />
                    <Text style={{ color: C.danger, fontSize: 15, fontWeight: '800' }}>
                        تسجيل الخروج
                    </Text>
                </TouchableOpacity>

                {/* ── Footer ───────────────────────────────────────────────── */}
                <View style={{ alignItems: 'center', gap: 4, paddingBottom: 8 }}>
                    <Text style={{ color: C.mutedForeground, fontSize: 13, fontWeight: '700' }}>
                        Faramace
                    </Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 11 }}>
                        الإصدار 1.0.0
                    </Text>
                </View>

            </View>
        </ScrollView>
    );
}
