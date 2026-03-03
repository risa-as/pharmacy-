import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

export default function SupportScreen() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    const handleWhatsApp = () => Linking.openURL('https://wa.me/9647724277164');
    const handleCall = () => Linking.openURL('tel:+9647724277164');

    return (
        <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            {/* Header Card */}
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
                    <Ionicons name="headset" size={40} color={C.primary} />
                </View>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: C.foreground, marginBottom: 8 }}>
                    هل تحتاج مساعدة؟
                </Text>
                <Text style={{ fontSize: 14, color: C.mutedForeground, textAlign: 'center', marginBottom: 24 }}>
                    فريق الدعم لدينا متاح لمساعدتك في أي وقت.
                </Text>

                {/* Call Button */}
                <TouchableOpacity
                    style={{
                        flexDirection: 'row-reverse',
                        backgroundColor: C.primary,
                        paddingVertical: 12,
                        paddingHorizontal: 24,
                        borderRadius: 12,
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        justifyContent: 'center',
                        marginBottom: 12,
                    }}
                    onPress={handleCall}
                    activeOpacity={0.8}
                >
                    <Ionicons name="call-outline" size={20} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>اتصل بنا</Text>
                </TouchableOpacity>

                {/* WhatsApp Button */}
                <TouchableOpacity
                    style={{
                        flexDirection: 'row-reverse',
                        backgroundColor: C.successBg,
                        paddingVertical: 12,
                        paddingHorizontal: 24,
                        borderRadius: 12,
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: C.border,
                    }}
                    onPress={handleWhatsApp}
                    activeOpacity={0.8}
                >
                    <Ionicons name="logo-whatsapp" size={20} color={C.success} />
                    <Text style={{ color: C.success, fontWeight: '600', fontSize: 15 }}>راسلنا عبر واتساب</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}
