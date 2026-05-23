import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

const APP_VERSION = '1.0.0';
const BUILD      = '2026.05';

const INFO_ROWS = [
    { label: 'الإصدار',      value: APP_VERSION, icon: 'code-slash-outline'    as const, iconColor: (C: any) => C.primary,         iconBg: (C: any) => C.primaryMuted },
    { label: 'رقم البناء',   value: BUILD,        icon: 'git-branch-outline'   as const, iconColor: (C: any) => C.info,            iconBg: (C: any) => C.infoBg       },
    { label: 'المطوّر',      value: 'Faramace Inc.', icon: 'business-outline'  as const, iconColor: (C: any) => C.warning,         iconBg: (C: any) => C.warningBg    },
    { label: 'حقوق النشر',  value: '© 2026',     icon: 'shield-outline'       as const, iconColor: (C: any) => C.mutedForeground,  iconBg: (C: any) => C.input        },
];

export default function AboutScreen() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
        >
            {/* App identity card */}
            <View style={{
                backgroundColor: C.card, borderRadius: 5, padding: 24,
                alignItems: 'center', borderWidth: 1, borderColor: C.border,
                marginBottom: 20,
                elevation: 1, shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4,
            }}>
                <View style={{
                    width: 72, height: 72, borderRadius: 5,
                    backgroundColor: C.primaryMuted,
                    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
                }}>
                    <Ionicons name="medkit" size={34} color={C.primary} />
                </View>

                <Text style={{ color: C.foreground, fontSize: 20, fontWeight: '900', marginBottom: 4 }}>
                    Faramace
                </Text>
                <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 14 }}>
                    منصة متكاملة لإدارة الصيدليات والمخزون الدوائي
                </Text>

                {/* Version chip */}
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
                    backgroundColor: C.primaryMuted, borderRadius: 5,
                    paddingHorizontal: 12, paddingVertical: 5,
                }}>
                    <Ionicons name="cube-outline" size={13} color={C.primary} />
                    <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>
                        الإصدار {APP_VERSION}
                    </Text>
                </View>
            </View>

            {/* Info rows */}
            <Text style={{
                color: C.mutedForeground, fontSize: 11, fontWeight: '700',
                textAlign: 'right', marginBottom: 8, paddingHorizontal: 4, letterSpacing: 0.5,
            }}>
                معلومات التطبيق
            </Text>

            <View style={{
                backgroundColor: C.card, borderRadius: 5,
                borderWidth: 1, borderColor: C.border, overflow: 'hidden',
                marginBottom: 20,
                elevation: 1, shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4,
            }}>
                {INFO_ROWS.map((row, i) => (
                    <View key={row.label}>
                        <View style={{
                            flexDirection: 'row-reverse', alignItems: 'center',
                            paddingVertical: 14, paddingHorizontal: 14, gap: 12,
                        }}>
                            <View style={{
                                width: 36, height: 36, borderRadius: 5,
                                backgroundColor: row.iconBg(C),
                                justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                            }}>
                                <Ionicons name={row.icon} size={18} color={row.iconColor(C)} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 11, marginBottom: 2, textAlign: 'right' }}>
                                    {row.label}
                                </Text>
                                <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '600', textAlign: 'right' }}>
                                    {row.value}
                                </Text>
                            </View>
                        </View>
                        {i < INFO_ROWS.length - 1 && (
                            <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 14 }} />
                        )}
                    </View>
                ))}
            </View>

            {/* Links */}
            <Text style={{
                color: C.mutedForeground, fontSize: 11, fontWeight: '700',
                textAlign: 'right', marginBottom: 8, paddingHorizontal: 4, letterSpacing: 0.5,
            }}>
                روابط مفيدة
            </Text>

            <View style={{
                backgroundColor: C.card, borderRadius: 5,
                borderWidth: 1, borderColor: C.border, overflow: 'hidden',
                marginBottom: 20,
                elevation: 1, shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4,
            }}>
                {[
                    { label: 'الموقع الإلكتروني', url: 'https://www.faramace.com', icon: 'globe-outline'          as const, iconColor: (C: any) => C.primary,  iconBg: (C: any) => C.primaryMuted },
                    { label: 'سياسة الخصوصية',   url: 'https://www.faramace.com/privacy', icon: 'document-text-outline' as const, iconColor: (C: any) => C.info,     iconBg: (C: any) => C.infoBg       },
                    { label: 'شروط الاستخدام',   url: 'https://www.faramace.com/terms',   icon: 'reader-outline'         as const, iconColor: (C: any) => C.warning,   iconBg: (C: any) => C.warningBg    },
                ].map((link, i, arr) => (
                    <View key={link.label}>
                        <TouchableOpacity
                            onPress={() => Linking.openURL(link.url)}
                            activeOpacity={0.75}
                            style={{
                                flexDirection: 'row-reverse', alignItems: 'center',
                                paddingVertical: 14, paddingHorizontal: 14, gap: 12,
                            }}
                        >
                            <View style={{
                                width: 36, height: 36, borderRadius: 5,
                                backgroundColor: link.iconBg(C),
                                justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                            }}>
                                <Ionicons name={link.icon} size={18} color={link.iconColor(C)} />
                            </View>
                            <Text style={{ flex: 1, color: C.foreground, fontSize: 14, fontWeight: '600', textAlign: 'right' }}>
                                {link.label}
                            </Text>
                            <Ionicons name="chevron-back" size={16} color={C.mutedForeground} />
                        </TouchableOpacity>
                        {i < arr.length - 1 && (
                            <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 14 }} />
                        )}
                    </View>
                ))}
            </View>

            {/* Footer */}
            <View style={{ alignItems: 'center', gap: 4, marginTop: 8 }}>
                <Text style={{ color: C.mutedForeground, fontSize: 12 }}>
                    © 2026 Faramace Inc. جميع الحقوق محفوظة
                </Text>
                <Text style={{ color: C.mutedForeground, fontSize: 11 }}>
                    صُنع بـ ♥ في العراق
                </Text>
            </View>
        </ScrollView>
    );
}
