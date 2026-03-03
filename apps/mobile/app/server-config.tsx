import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { setServerUrl, getBaseUrl } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/colors';

export default function ServerConfigScreen() {
    const router = useRouter();
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    const [ip, setIp] = useState('');
    const [port, setPort] = useState('3000');
    const [protocol, setProtocol] = useState<'http' | 'https'>('http');
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => { loadCurrentConfig(); }, []);

    const loadCurrentConfig = async () => {
        try {
            const currentUrl = await getBaseUrl();
            if (currentUrl) {
                const urlObj = new URL(currentUrl);
                setProtocol(urlObj.protocol.replace(':', '') as 'http' | 'https');
                setIp(urlObj.hostname);
                setPort(urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80'));
            }
        } catch {
            // new config
        } finally {
            setChecking(false);
        }
    };

    const handleTestConnection = async (): Promise<boolean> => {
        if (!ip) {
            Alert.alert('خطأ', 'يرجى إدخال عنوان السيرفر');
            return false;
        }
        setLoading(true);
        const fullUrl = `${protocol}://${ip}:${port}/api/stats`;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(fullUrl, { method: 'GET', signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.ok) {
                Alert.alert('نجاح', 'تم الاتصال بالسيرفر بنجاح');
                return true;
            }
            throw new Error(`HTTP ${response.status}`);
        } catch (error: any) {
            Alert.alert('فشل الاتصال', `تأكد من تشغيل السيرفر ومن العنوان الصحيح.\n${error.message}`);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!ip) {
            Alert.alert('خطأ', 'يرجى إدخال عنوان السيرفر');
            return;
        }
        const success = await handleTestConnection();
        if (success) {
            await setServerUrl(`${protocol}://${ip}:${port}`);
            router.replace('/login');
        }
    };

    if (checking) {
        return (
            <View style={{ flex: 1, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={C.primary} />
            </View>
        );
    }

    const inputStyle = {
        flexDirection: 'row-reverse' as const,
        alignItems: 'center' as const,
        backgroundColor: C.input,
        borderRadius: 12,
        marginBottom: 20,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: C.border,
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, backgroundColor: C.background }}
        >
            {/* Header */}
            <View style={{
                flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60,
                backgroundColor: C.primary,
            }}>
                <Ionicons name="server-outline" size={60} color="#fff" />
                <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#fff', marginTop: 16, marginBottom: 8 }}>
                    إعدادات السيرفر
                </Text>
                <Text style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)' }}>
                    الرجاء إدخال بيانات الاتصال بالسيرفر
                </Text>
            </View>

            {/* Form */}
            <ScrollView style={{
                backgroundColor: C.card,
                borderTopLeftRadius: 30,
                borderTopRightRadius: 30,
            }} contentContainerStyle={{ padding: 30, paddingTop: 40 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.mutedForeground, marginBottom: 8, textAlign: 'right' }}>
                    البروتوكول
                </Text>
                <View style={{ flexDirection: 'row-reverse', marginBottom: 20, gap: 10 }}>
                    {(['http', 'https'] as const).map(p => (
                        <TouchableOpacity
                            key={p}
                            style={{
                                flex: 1, padding: 12, borderRadius: 10, alignItems: 'center',
                                backgroundColor: protocol === p ? C.primaryMuted : C.input,
                                borderWidth: 1,
                                borderColor: protocol === p ? C.primary : C.border,
                            }}
                            onPress={() => setProtocol(p)}
                        >
                            <Text style={{
                                fontWeight: '600',
                                color: protocol === p ? C.primary : C.mutedForeground,
                            }}>
                                {p.toUpperCase()}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={{ fontSize: 13, fontWeight: '700', color: C.mutedForeground, marginBottom: 8, textAlign: 'right' }}>
                    عنوان السيرفر (IP / Hostname)
                </Text>
                <View style={inputStyle}>
                    <Ionicons name="desktop-outline" size={20} color={C.mutedForeground} style={{ marginLeft: 10 }} />
                    <TextInput
                        style={{ flex: 1, height: 50, fontSize: 16, color: C.foreground, textAlign: 'left' }}
                        placeholder="192.168.1.100"
                        placeholderTextColor={C.mutedForeground}
                        value={ip}
                        onChangeText={setIp}
                        keyboardType="url"
                        autoCapitalize="none"
                    />
                </View>

                <Text style={{ fontSize: 13, fontWeight: '700', color: C.mutedForeground, marginBottom: 8, textAlign: 'right' }}>
                    المنفذ (Port)
                </Text>
                <View style={inputStyle}>
                    <Ionicons name="git-network-outline" size={20} color={C.mutedForeground} style={{ marginLeft: 10 }} />
                    <TextInput
                        style={{ flex: 1, height: 50, fontSize: 16, color: C.foreground }}
                        placeholder="3000"
                        placeholderTextColor={C.mutedForeground}
                        value={port}
                        onChangeText={setPort}
                        keyboardType="number-pad"
                    />
                </View>

                <TouchableOpacity
                    style={{
                        backgroundColor: C.primary, borderRadius: 12, height: 54,
                        flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center',
                        gap: 8, marginTop: 10, opacity: loading ? 0.7 : 1,
                    }}
                    onPress={handleSave}
                    disabled={loading}
                    activeOpacity={0.8}
                >
                    {loading
                        ? <ActivityIndicator color="#fff" />
                        : <><Ionicons name="save-outline" size={20} color="#fff" /><Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>حفظ واتصال</Text></>
                    }
                </TouchableOpacity>

                <TouchableOpacity
                    style={{ marginTop: 16, alignItems: 'center', padding: 10 }}
                    onPress={() => handleTestConnection()}
                    disabled={loading}
                >
                    <Text style={{ color: C.mutedForeground, fontSize: 14, textDecorationLine: 'underline' }}>
                        فحص الاتصال فقط
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
