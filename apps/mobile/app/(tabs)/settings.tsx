import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authService, User } from '../../services/auth';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

export default function SettingsScreen() {
    const [user, setUser] = useState<User | null>(null);
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

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

    const menuItems = [
        {
            title: 'الحساب',
            icon: 'person-outline' as const,
            items: [
                { label: 'معلومات الحساب',    icon: 'person-circle-outline' as const, onPress: () => router.push('/settings/account' as any) },
                { label: 'تغيير كلمة المرور', icon: 'key-outline' as const,           onPress: () => router.push('/settings/password' as any) },
            ],
        },
        {
            title: 'التطبيق',
            icon: 'settings-outline' as const,
            items: [
                { label: 'الإشعارات', icon: 'notifications-outline' as const, onPress: () => router.push('/settings/notifications' as any) },
                { label: 'المظهر',    icon: 'moon-outline' as const,           onPress: () => router.push('/settings/theme' as any) },
            ],
        },
        {
            title: 'المساعدة',
            icon: 'help-circle-outline' as const,
            items: [
                { label: 'الدعم الفني',  icon: 'headset-outline' as const,             onPress: () => router.push('/settings/support' as any) },
                { label: 'حول التطبيق', icon: 'information-circle-outline' as const, onPress: () => router.push('/settings/about' as any) },
            ],
        },
    ];

    return (
        <ScrollView style={{ flex: 1, backgroundColor: C.background }}>
            {/* User Card */}
            <View style={{
                flexDirection: 'row-reverse',
                alignItems: 'center',
                backgroundColor: C.card,
                margin: 16,
                padding: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: C.border,
            }}>
                <View style={{
                    width: 64, height: 64, borderRadius: 32,
                    backgroundColor: C.primaryMuted,
                    justifyContent: 'center', alignItems: 'center',
                }}>
                    <Ionicons name="person" size={32} color={C.primary} />
                </View>
                <View style={{ flex: 1, marginRight: 16, alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: C.foreground }}>
                        {user?.name || 'المستخدم'}
                    </Text>
                    <Text style={{ fontSize: 14, color: C.mutedForeground, marginTop: 4 }}>
                        {user?.email || 'user@faramace.com'}
                    </Text>
                </View>
            </View>

            {/* Menu Sections */}
            {menuItems.map((section, sectionIndex) => (
                <View key={sectionIndex} style={{ marginHorizontal: 16, marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8, paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: C.mutedForeground }}>
                            {section.title}
                        </Text>
                        <Ionicons name={section.icon} size={18} color={C.mutedForeground} />
                    </View>
                    <View style={{ backgroundColor: C.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
                        {section.items.map((item, itemIndex) => (
                            <TouchableOpacity
                                key={itemIndex}
                                style={[
                                    { flexDirection: 'row-reverse', alignItems: 'center', padding: 16 },
                                    itemIndex < section.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border },
                                ]}
                                onPress={item.onPress}
                                activeOpacity={0.7}
                            >
                                <View style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    backgroundColor: C.input,
                                    justifyContent: 'center', alignItems: 'center',
                                }}>
                                    <Ionicons name={item.icon} size={20} color={C.mutedForeground} />
                                </View>
                                <Text style={{ fontSize: 16, color: C.foreground, flex: 1, textAlign: 'right', marginRight: 12 }}>
                                    {item.label}
                                </Text>
                                <Ionicons name="chevron-back" size={18} color={C.mutedForeground} />
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            ))}

            {/* Logout Button */}
            <TouchableOpacity
                style={{
                    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
                    backgroundColor: C.dangerBg,
                    marginHorizontal: 16, padding: 16, borderRadius: 16, marginTop: 8,
                }}
                onPress={handleLogout}
                activeOpacity={0.8}
            >
                <Ionicons name="log-out-outline" size={20} color={C.danger} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: C.danger }}>تسجيل الخروج</Text>
            </TouchableOpacity>

            <Text style={{ textAlign: 'center', color: C.mutedForeground, fontSize: 12, marginVertical: 24 }}>
                الإصدار 1.0.0
            </Text>
        </ScrollView>
    );
}
