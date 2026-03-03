import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

export default function AboutScreen() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    return (
        <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            {/* App Card */}
            <View style={{
                backgroundColor: C.card,
                borderRadius: 20,
                padding: 24,
                alignItems: 'center',
                marginBottom: 20,
                borderWidth: 1,
                borderColor: C.border,
            }}>
                <View style={{
                    width: 80, height: 80, borderRadius: 40,
                    backgroundColor: C.primaryMuted,
                    justifyContent: 'center', alignItems: 'center',
                    marginBottom: 16,
                }}>
                    <Ionicons name="information-circle" size={40} color={C.primary} />
                </View>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: C.foreground, marginBottom: 8 }}>
                    Faramace Mobile
                </Text>
                <Text style={{ fontSize: 14, color: C.mutedForeground, textAlign: 'center' }}>
                    تطبيق لإدارة الصيدليات والمخزون بكفاءة عالية.
                </Text>
            </View>

            {/* Info Section */}
            <View style={{
                backgroundColor: C.card,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: C.border,
                marginBottom: 16,
                overflow: 'hidden',
            }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.mutedForeground, textAlign: 'right', padding: 16, paddingBottom: 8 }}>
                    معلومات التطبيق
                </Text>
                {[
                    { label: 'الإصدار', value: '1.0.0' },
                    { label: 'المطور', value: 'Faramace Inc.' },
                    { label: 'حقوق النشر', value: '2026' },
                ].map((row, i, arr) => (
                    <View key={row.label}>
                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' }}>
                            <Text style={{ color: C.mutedForeground, fontWeight: '500' }}>{row.label}</Text>
                            <Text style={{ color: C.foreground, fontWeight: '600' }}>{row.value}</Text>
                        </View>
                        {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 16 }} />}
                    </View>
                ))}
            </View>

            {/* Contact Section */}
            <View style={{
                backgroundColor: C.card,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: C.border,
                overflow: 'hidden',
            }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.mutedForeground, textAlign: 'right', padding: 16, paddingBottom: 8 }}>
                    وسائل التواصل
                </Text>
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' }}>
                    <Text style={{ color: C.mutedForeground, fontWeight: '500' }}>الموقع الإلكتروني</Text>
                    <TouchableOpacity onPress={() => Linking.openURL('https://www.faramace.com')}>
                        <Text style={{ color: C.primary, fontWeight: '600' }}>www.faramace.com</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
}
