import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authService, User } from '../../services/auth';
import { useTheme } from '../../context/ThemeContext';
import { managerPalette } from '../../constants/colors';

const ROLE_LABELS: Record<string, { label: string; color: (C: any) => string; bg: (C: any) => string }> = {
    ADMIN:      { label: 'مدير',     color: C => C.primary, bg: C => C.primaryMuted },
    PHARMACIST: { label: 'صيدلاني', color: C => C.success, bg: C => C.successBg   },
    MANAGER:    { label: 'مشرف',    color: C => C.warning, bg: C => C.warningBg   },
    CASHIER:    { label: 'كاشير',   color: C => C.info,    bg: C => C.infoBg      },
};

export default function AccountScreen() {
    const [user, setUser] = useState<User | null>(null);
    const { isDarkMode } = useTheme();
    const C = managerPalette(isDarkMode);

    useEffect(() => {
        authService.getCurrentUser().then(setUser);
    }, []);

    const initials = user?.name
        ? user.name.trim().split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
        : 'U';

    const roleInfo = user?.role ? ROLE_LABELS[user.role] : null;

    const rows = [
        { label: 'الاسم الكامل',     icon: 'person-outline' as const,       value: user?.name  || '—', iconBg: C.primaryMuted, iconColor: C.primary },
        { label: 'البريد الإلكتروني', icon: 'mail-outline' as const,          value: user?.email || '—', iconBg: C.primaryMuted, iconColor: C.primary },
        { label: 'الدور الوظيفي',    icon: 'shield-checkmark-outline' as const, value: roleInfo?.label ?? (user?.role || '—'), iconBg: C.warningBg, iconColor: C.warning },
        { label: 'معرف الحساب',      icon: 'finger-print-outline' as const,  value: user?.id ? user.id.slice(0, 16) + '...' : '—', iconBg: C.input, iconColor: C.mutedForeground },
    ];

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
        >
            {/* Avatar section */}
            <View style={{
                backgroundColor: C.card,
                borderBottomWidth: 1, borderBottomColor: C.border,
                paddingVertical: 32, alignItems: 'center', gap: 12,
            }}>
                <View style={{
                    width: 80, height: 80, borderRadius: 5,
                    backgroundColor: C.primary,
                    justifyContent: 'center', alignItems: 'center',
                }}>
                    <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>{initials}</Text>
                </View>

                <View style={{ alignItems: 'center', gap: 4 }}>
                    <Text style={{ color: C.foreground, fontSize: 20, fontWeight: '900' }}>
                        {user?.name || 'المستخدم'}
                    </Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 13 }}>
                        {user?.email || '—'}
                    </Text>
                </View>

                {roleInfo && (
                    <View style={{
                        backgroundColor: roleInfo.bg(C), borderRadius: 5,
                        paddingHorizontal: 14, paddingVertical: 5,
                    }}>
                        <Text style={{ color: roleInfo.color(C), fontSize: 13, fontWeight: '700' }}>
                            {roleInfo.label}
                        </Text>
                    </View>
                )}
            </View>

            {/* Info rows */}
            <View style={{ padding: 16 }}>
                <Text style={{
                    color: C.mutedForeground, fontSize: 11, fontWeight: '700',
                    textAlign: 'right', marginBottom: 8, paddingHorizontal: 4,
                    letterSpacing: 0.5,
                }}>
                    معلومات الحساب
                </Text>

                <View style={{
                    backgroundColor: C.card, borderRadius: 5,
                    borderWidth: 1.5, borderColor: `${C.primary}33`, overflow: 'hidden',
                    elevation: 1, shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4,
                }}>
                    {rows.map((row, i) => (
                        <View key={row.label}>
                            <View style={{
                                flexDirection: 'row-reverse', alignItems: 'center',
                                paddingVertical: 14, paddingHorizontal: 14, gap: 12,
                            }}>
                                <View style={{
                                    width: 36, height: 36, borderRadius: 5,
                                    backgroundColor: row.iconBg,
                                    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                                }}>
                                    <Ionicons name={row.icon} size={18} color={row.iconColor} />
                                </View>
                                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                    <Text style={{ color: C.mutedForeground, fontSize: 11, marginBottom: 3 }}>
                                        {row.label}
                                    </Text>
                                    <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '600', textAlign: 'right' }}>
                                        {row.value}
                                    </Text>
                                </View>
                            </View>
                            {i < rows.length - 1 && (
                                <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 14 }} />
                            )}
                        </View>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
