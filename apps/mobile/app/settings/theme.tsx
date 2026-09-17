import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { LightColors, DarkColors, Radius } from '../../constants/colors';
import { usePalette, Surface, SectionTitle } from '../../components/ui/Kit';

/** Theme (design theme.png): light / dark with a visual preview. No extra "auto" option. */
export default function ThemeScreen() {
    const C = usePalette();
    const { isDarkMode, toggleTheme } = useTheme();

    const options = [
        { key: 'light' as const, label: 'الوضع النهاري', subtitle: 'مظهر فاتح للإضاءة العادية', icon: 'sunny-outline' as const, palette: LightColors, active: !isDarkMode },
        { key: 'dark' as const, label: 'الوضع الليلي', subtitle: 'مظهر داكن للإضاءة المنخفضة', icon: 'moon-outline' as const, palette: DarkColors, active: isDarkMode },
    ];

    return (
        <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 14 }}>
            <SectionTitle title="اختر المظهر" />
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {options.map(opt => (
                    <TouchableOpacity
                        key={opt.key}
                        onPress={() => { if (!opt.active) toggleTheme(opt.key === 'dark'); }}
                        activeOpacity={0.85}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: opt.active }}
                        style={{ flex: 1 }}
                    >
                        <Surface style={{ gap: 12, borderWidth: opt.active ? 1.5 : 1, borderColor: opt.active ? C.primary : C.border, backgroundColor: opt.active ? C.primaryMuted : C.card }}>
                            {/* Mini preview in the option's own palette */}
                            <View style={{ height: 96, borderRadius: Radius.control, backgroundColor: opt.palette.background, borderWidth: 1, borderColor: opt.palette.border, padding: 8, gap: 6 }}>
                                <View style={{ height: 10, width: '55%', alignSelf: 'flex-end', borderRadius: 3, backgroundColor: opt.palette.foreground }} />
                                <View style={{ flex: 1, borderRadius: 4, backgroundColor: opt.palette.card, borderWidth: 1, borderColor: opt.palette.border, padding: 6, gap: 5 }}>
                                    <View style={{ height: 8, width: '70%', alignSelf: 'flex-end', borderRadius: 3, backgroundColor: opt.palette.mutedForeground }} />
                                    <View style={{ height: 12, width: '45%', alignSelf: 'flex-end', borderRadius: 3, backgroundColor: opt.palette.primary }} />
                                </View>
                            </View>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                                <Ionicons name={opt.icon} size={20} color={opt.active ? C.primary : C.mutedForeground} />
                                <Text style={{ flex: 1, color: opt.active ? C.primary : C.foreground, fontSize: 15, fontWeight: '800', textAlign: 'right' }}>{opt.label}</Text>
                                <Ionicons name={opt.active ? 'radio-button-on' : 'radio-button-off'} size={20} color={opt.active ? C.primary : C.mutedForeground} />
                            </View>
                            <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right' }}>{opt.subtitle}</Text>
                        </Surface>
                    </TouchableOpacity>
                ))}
            </View>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
                <Ionicons name="checkmark-circle-outline" size={18} color={C.success} />
                <Text style={{ color: C.mutedForeground, fontSize: 13 }}>يُحفظ الاختيار على هذا الجهاز.</Text>
            </View>
        </ScrollView>
    );
}
