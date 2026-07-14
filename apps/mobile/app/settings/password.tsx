import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '../../services/auth';
import { useTheme } from '../../context/ThemeContext';
import { managerPalette } from '../../constants/colors';

interface FieldConfig {
    key: 'current' | 'new' | 'confirm';
    label: string;
    subtitle?: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    iconColor: (C: any) => string;
    iconBg: (C: any) => string;
}

const FIELDS: FieldConfig[] = [
    {
        key:      'current',
        label:    'كلمة المرور الحالية',
        icon:     'lock-closed-outline',
        iconColor: C => C.mutedForeground,
        iconBg:   C => C.input,
    },
    {
        key:      'new',
        label:    'كلمة المرور الجديدة',
        subtitle: '٦ أحرف على الأقل',
        icon:     'key-outline',
        iconColor: C => C.warning,
        iconBg:   C => C.warningBg,
    },
    {
        key:      'confirm',
        label:    'تأكيد كلمة المرور',
        icon:     'shield-checkmark-outline',
        iconColor: C => C.success,
        iconBg:   C => C.successBg,
    },
];

export default function PasswordScreen() {
    const { isDarkMode } = useTheme();
    const C = managerPalette(isDarkMode);

    const [values, setValues] = useState({ current: '', new: '', confirm: '' });
    const [visible, setVisible] = useState({ current: false, new: false, confirm: false });
    const [loading, setLoading] = useState(false);

    const set = (key: keyof typeof values) => (v: string) =>
        setValues(prev => ({ ...prev, [key]: v }));

    const toggleVisible = (key: keyof typeof visible) =>
        setVisible(prev => ({ ...prev, [key]: !prev[key] }));

    const isMatch   = values.new === values.confirm;
    const isLongEnough = values.new.length >= 6;
    const allFilled = values.current && values.new && values.confirm;

    const handleChange = async () => {
        if (!allFilled) { Alert.alert('تنبيه', 'يرجى ملء جميع الحقول'); return; }
        if (!isLongEnough) { Alert.alert('تنبيه', 'كلمة المرور الجديدة يجب أن تكون ٦ أحرف على الأقل'); return; }
        if (!isMatch) { Alert.alert('تنبيه', 'كلمة المرور الجديدة غير متطابقة'); return; }

        setLoading(true);
        try {
            await authService.changePassword(values.current, values.new);
            Alert.alert('تم بنجاح ✓', 'تم تغيير كلمة المرور بنجاح', [
                { text: 'حسناً', onPress: () => router.back() },
            ]);
        } catch (error: any) {
            Alert.alert('خطأ', error.message || 'فشل في تغيير كلمة المرور');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: C.background }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Banner */}
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                    backgroundColor: C.warningBg, borderRadius: 5, padding: 13,
                    marginBottom: 20, borderWidth: 1.5, borderColor: `${C.warning}30`,
                }}>
                    <View style={{ backgroundColor: C.warning, borderRadius: 5, padding: 6 }}>
                        <Ionicons name="shield-outline" size={14} color="#fff" />
                    </View>
                    <Text style={{ flex: 1, color: C.warning, fontSize: 13, textAlign: 'right', lineHeight: 19 }}>
                        اختر كلمة مرور قوية تحتوي على أحرف وأرقام
                    </Text>
                </View>

                {/* Fields */}
                <View style={{ gap: 14 }}>
                    {FIELDS.map(field => {
                        const val     = values[field.key];
                        const isVis   = visible[field.key];
                        const showErr = field.key === 'confirm' && values.confirm.length > 0 && !isMatch;
                        const showOk  = field.key === 'confirm' && isMatch && values.confirm.length > 0;

                        return (
                            <View key={field.key}>
                                {/* Label row */}
                                <View style={{
                                    flexDirection: 'row-reverse', alignItems: 'center', gap: 7, marginBottom: 8,
                                }}>
                                    <View style={{
                                        width: 28, height: 28, borderRadius: 5,
                                        backgroundColor: field.iconBg(C),
                                        justifyContent: 'center', alignItems: 'center',
                                    }}>
                                        <Ionicons name={field.icon} size={15} color={field.iconColor(C)} />
                                    </View>
                                    <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '700' }}>
                                        {field.label}
                                    </Text>
                                    {field.subtitle && (
                                        <Text style={{ color: C.mutedForeground, fontSize: 11, marginRight: 'auto' }}>
                                            {field.subtitle}
                                        </Text>
                                    )}
                                </View>

                                {/* Input */}
                                <View style={{
                                    flexDirection: 'row-reverse', alignItems: 'center',
                                    backgroundColor: C.input, borderRadius: 5,
                                    borderWidth: 1.5,
                                    borderColor: showErr ? C.danger : showOk ? C.success : C.border,
                                    paddingHorizontal: 12, gap: 8,
                                }}>
                                    <TextInput
                                        style={{
                                            flex: 1, color: C.foreground,
                                            paddingVertical: 13, textAlign: 'right', fontSize: 15,
                                        }}
                                        secureTextEntry={!isVis}
                                        value={val}
                                        onChangeText={set(field.key)}
                                        placeholder="••••••••"
                                        placeholderTextColor={C.mutedForeground}
                                    />
                                    <TouchableOpacity
                                        onPress={() => toggleVisible(field.key)}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                        <Ionicons
                                            name={isVis ? 'eye-off-outline' : 'eye-outline'}
                                            size={18}
                                            color={C.mutedForeground}
                                        />
                                    </TouchableOpacity>
                                </View>

                                {/* Match indicator */}
                                {showErr && (
                                    <Text style={{ color: C.danger, fontSize: 11, textAlign: 'right', marginTop: 5 }}>
                                        كلمتا المرور غير متطابقتين
                                    </Text>
                                )}
                                {showOk && (
                                    <Text style={{ color: C.success, fontSize: 11, textAlign: 'right', marginTop: 5 }}>
                                        ✓ كلمتا المرور متطابقتان
                                    </Text>
                                )}
                            </View>
                        );
                    })}
                </View>

                {/* Submit */}
                <TouchableOpacity
                    onPress={handleChange}
                    disabled={loading || !allFilled}
                    activeOpacity={0.85}
                    style={{
                        flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 8,
                        backgroundColor: allFilled && !loading ? C.primary : C.border,
                        borderRadius: 5, paddingVertical: 15, marginTop: 24,
                    }}
                >
                    {loading
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                    }
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                        {loading ? 'جاري الحفظ...' : 'حفظ كلمة المرور'}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
