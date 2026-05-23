import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

export default function ThemeScreen() {
    const { isDarkMode, toggleTheme } = useTheme();
    const C = Colors(isDarkMode);

    const options = [
        {
            key:      'light',
            label:    'الوضع النهاري',
            subtitle: 'خلفية بيضاء ومشرقة',
            icon:     'sunny' as const,
            iconColor: '#F59E0B',
            iconBg:   '#FFF8E7',
            active:   !isDarkMode,
        },
        {
            key:      'dark',
            label:    'الوضع الليلي',
            subtitle: 'خلفية داكنة مريحة للعين',
            icon:     'moon' as const,
            iconColor: '#A78BFA',
            iconBg:   '#2D2A4A',
            active:   isDarkMode,
        },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: C.background, padding: 16 }}>

            <Text style={{
                color: C.mutedForeground, fontSize: 11, fontWeight: '700',
                textAlign: 'right', marginBottom: 12, paddingHorizontal: 4, letterSpacing: 0.5,
            }}>
                اختر المظهر
            </Text>

            <View style={{ gap: 12 }}>
                {options.map(opt => (
                    <TouchableOpacity
                        key={opt.key}
                        onPress={() => { if (opt.active) return; toggleTheme(opt.key === 'dark'); }}
                        activeOpacity={0.85}
                        style={{
                            flexDirection: 'row-reverse',
                            backgroundColor: C.card, borderRadius: 5,
                            borderWidth: 2,
                            borderColor: opt.active ? C.primary : C.border,
                            padding: 16, alignItems: 'center', gap: 14,
                            elevation: opt.active ? 2 : 1,
                            shadowColor: opt.active ? C.primary : '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: opt.active ? 0.15 : 0.04,
                            shadowRadius: 6,
                        }}
                    >
                        {/* Icon */}
                        <View style={{
                            width: 48, height: 48, borderRadius: 5,
                            backgroundColor: opt.iconBg,
                            justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                        }}>
                            <Ionicons name={opt.icon} size={24} color={opt.iconColor} />
                        </View>

                        {/* Text */}
                        <View style={{ flex: 1 }}>
                            <Text style={{
                                color: opt.active ? C.primary : C.foreground,
                                fontSize: 16, fontWeight: '800', textAlign: 'right',
                            }}>
                                {opt.label}
                            </Text>
                            <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 3 }}>
                                {opt.subtitle}
                            </Text>
                        </View>

                        {/* Selection indicator */}
                        <View style={{
                            width: 22, height: 22, borderRadius: 11,
                            borderWidth: 2,
                            borderColor: opt.active ? C.primary : C.border,
                            backgroundColor: opt.active ? C.primary : 'transparent',
                            justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                        }}>
                            {opt.active && <Ionicons name="checkmark" size={13} color="#fff" />}
                        </View>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Current mode indicator */}
            <View style={{
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
                gap: 6, marginTop: 24,
            }}>
                <Ionicons
                    name={isDarkMode ? 'moon' : 'sunny'}
                    size={14}
                    color={C.mutedForeground}
                />
                <Text style={{ color: C.mutedForeground, fontSize: 12 }}>
                    {isDarkMode ? 'الوضع الليلي مفعّل' : 'الوضع النهاري مفعّل'}
                </Text>
            </View>
        </View>
    );
}
