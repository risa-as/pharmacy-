import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { authService } from '../../services/auth';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

export default function PasswordScreen() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            Alert.alert('خطأ', 'يرجى ملء جميع الحقول');
            return;
        }
        if (newPassword !== confirmPassword) {
            Alert.alert('خطأ', 'كلمة المرور الجديدة غير متطابقة');
            return;
        }
        if (newPassword.length < 6) {
            Alert.alert('خطأ', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
            return;
        }

        setLoading(true);
        try {
            await authService.changePassword(currentPassword, newPassword);
            Alert.alert('نجاح', 'تم تغيير كلمة المرور بنجاح', [
                { text: 'حسناً', onPress: () => router.back() },
            ]);
        } catch (error: any) {
            Alert.alert('خطأ', error.message);
        } finally {
            setLoading(false);
        }
    };

    const inputStyle = {
        backgroundColor: C.input,
        borderRadius: 12,
        padding: 14,
        fontSize: 16,
        color: C.foreground,
        borderWidth: 1,
        borderColor: C.border,
        textAlign: 'right' as const,
    };

    return (
        <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, color: C.mutedForeground, marginBottom: 8, textAlign: 'right', fontWeight: '600' }}>
                    كلمة المرور الحالية
                </Text>
                <TextInput
                    style={inputStyle}
                    secureTextEntry
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholderTextColor={C.mutedForeground}
                />
            </View>

            <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, color: C.mutedForeground, marginBottom: 8, textAlign: 'right', fontWeight: '600' }}>
                    كلمة المرور الجديدة
                </Text>
                <TextInput
                    style={inputStyle}
                    secureTextEntry
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholderTextColor={C.mutedForeground}
                />
            </View>

            <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, color: C.mutedForeground, marginBottom: 8, textAlign: 'right', fontWeight: '600' }}>
                    تأكيد كلمة المرور الجديدة
                </Text>
                <TextInput
                    style={inputStyle}
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholderTextColor={C.mutedForeground}
                />
            </View>

            <TouchableOpacity
                style={{
                    backgroundColor: loading ? C.primarySoft : C.primary,
                    padding: 16,
                    borderRadius: 12,
                    alignItems: 'center',
                    marginTop: 8,
                    opacity: loading ? 0.7 : 1,
                }}
                onPress={handleChangePassword}
                disabled={loading}
                activeOpacity={0.8}
            >
                {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>حفظ التغييرات</Text>
                }
            </TouchableOpacity>
        </ScrollView>
    );
}
