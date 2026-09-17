import React, { useState } from 'react';
import { View, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '../../services/auth';
import { usePalette, Surface, InfoNote, FormField, AppButton } from '../../components/ui/Kit';

const MIN_LENGTH = 6; // mirrors POST /auth/change-password

type Key = 'current' | 'new' | 'confirm';

/**
 * Change password (design password.png). Field-level validation shown after
 * interaction; no success ticks before submission — the current password can
 * only be verified by the server. No email recovery (it does not exist).
 */
export default function PasswordScreen() {
    const C = usePalette();
    const [values, setValues] = useState<Record<Key, string>>({ current: '', new: '', confirm: '' });
    const [visible, setVisible] = useState<Record<Key, boolean>>({ current: false, new: false, confirm: false });
    const [touched, setTouched] = useState<Record<Key, boolean>>({ current: false, new: false, confirm: false });
    const [serverError, setServerError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const errors: Record<Key, string | null> = {
        current: !values.current ? 'أدخل كلمة المرور الحالية' : serverError,
        new: !values.new ? 'أدخل كلمة المرور الجديدة' : values.new.length < MIN_LENGTH ? `${MIN_LENGTH} أحرف على الأقل` : values.new === values.current ? 'يجب أن تختلف عن الحالية' : null,
        confirm: !values.confirm ? 'أعد إدخال كلمة المرور الجديدة' : values.confirm !== values.new ? 'كلمتا المرور غير متطابقتين' : null,
    };

    const set = (k: Key) => (v: string) => { setValues(p => ({ ...p, [k]: v })); if (k === 'current') setServerError(null); };

    const eye = (k: Key) => (
        <TouchableOpacity onPress={() => setVisible(p => ({ ...p, [k]: !p[k] }))} hitSlop={8} accessibilityLabel={visible[k] ? 'إخفاء' : 'إظهار'} style={{ paddingHorizontal: 12, alignSelf: 'stretch', justifyContent: 'center' }}>
            <Ionicons name={visible[k] ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.mutedForeground} />
        </TouchableOpacity>
    );

    const handleSubmit = async () => {
        setTouched({ current: true, new: true, confirm: true });
        if (errors.new || errors.confirm || !values.current) return;
        setLoading(true);
        try {
            await authService.changePassword(values.current, values.new);
            Alert.alert('تم', 'تم تغيير كلمة المرور.', [{ text: 'حسناً', onPress: () => router.back() }]);
        } catch (error: any) {
            const msg = String(error?.message ?? '');
            if (/invalid current/i.test(msg)) setServerError('كلمة المرور الحالية غير صحيحة');
            else Alert.alert('تعذّر التغيير', msg || 'فشل في تغيير كلمة المرور');
        } finally {
            setLoading(false);
        }
    };

    const fieldProps = (k: Key, label: string) => ({
        label,
        required: true,
        value: values[k],
        onChangeText: set(k),
        onBlur: () => setTouched(p => ({ ...p, [k]: true })),
        secureTextEntry: !visible[k],
        autoCapitalize: 'none' as const,
        error: touched[k] || (k === 'current' && serverError) ? errors[k] : null,
    });

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 14 }} keyboardShouldPersistTaps="handled">
                <InfoNote text={`اختر كلمة مرور من ${MIN_LENGTH} أحرف على الأقل ومختلفة عن الحالية.`} />
                <Surface style={{ gap: 16 }}>
                    <FormField {...fieldProps('current', 'كلمة المرور الحالية')} trailing={eye('current')} />
                    <FormField {...fieldProps('new', 'كلمة المرور الجديدة')} trailing={eye('new')} hint={`${MIN_LENGTH} أحرف على الأقل`} />
                    <FormField {...fieldProps('confirm', 'تأكيد كلمة المرور')} trailing={eye('confirm')} />
                    <AppButton label="حفظ كلمة المرور" loading={loading} onPress={handleSubmit} />
                </Surface>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
