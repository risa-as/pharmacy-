import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Image, ScrollView, Modal } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authService } from '../services/auth';
import { biometricService } from '../services/biometric';
import { useAuth } from '../context/AuthContext';
import { Radius } from '../constants/colors';
import { usePalette, Surface, AppButton, InfoNote } from '../components/ui/Kit';

/** Login (design login.png). No self sign-up or email recovery — neither exists. */
export default function LoginScreen() {
    const C = usePalette();
    const insets = useSafeAreaInsets();
    const { refreshUser } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [touched, setTouched] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isBiometricSupported, setIsBiometricSupported] = useState(false);
    const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
    const [focused, setFocused] = useState<'email' | 'password' | null>(null);
    const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);

    useEffect(() => {
        (async () => {
            const supported = await biometricService.checkHardware();
            setIsBiometricSupported(supported);
            if (supported) setHasSavedCredentials(!!(await biometricService.getCredentials()));
        })();
    }, []);

    const describeError = (error: any): string => {
        const msg = String(error?.message ?? '');
        if (/network|fetch|timeout|abort/i.test(msg)) return 'تعذّر الوصول إلى الخادم. تحقق من اتصالك بالإنترنت ثم حاول مجدداً.';
        return msg || 'فشل تسجيل الدخول';
    };

    const handleBiometricLogin = async () => {
        if (!(await biometricService.authenticate())) return;
        setLoading(true);
        setErrorMsg(null);
        try {
            const creds = await biometricService.getCredentials();
            if (!creds) { setErrorMsg('لا توجد بيانات محفوظة للدخول بالبصمة'); return; }
            await authService.login(creds.email, creds.pass);
            await refreshUser();
            router.replace('/(tabs)');
        } catch (error: any) {
            setErrorMsg(describeError(error));
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async () => {
        setTouched(true);
        setErrorMsg(null);
        if (!email.trim() || !password) return;
        setLoading(true);
        try {
            await authService.login(email.trim(), password);
            await refreshUser();
            if (isBiometricSupported && !hasSavedCredentials) setShowBiometricPrompt(true);
            else router.replace('/(tabs)');
        } catch (error: any) {
            setErrorMsg(describeError(error));
        } finally {
            setLoading(false);
        }
    };

    const finishBiometricPrompt = async (enable: boolean) => {
        setShowBiometricPrompt(false);
        if (enable) {
            try { await biometricService.saveCredentials(email.trim(), password); } catch { /* can enable next time */ }
        }
        router.replace('/(tabs)');
    };

    const field = (key: 'email' | 'password', icon: React.ComponentProps<typeof Ionicons>['name'], props: React.ComponentProps<typeof TextInput>, error: string | null, trailing?: React.ReactNode) => (
        <View style={{ gap: 6 }}>
            <View style={{
                flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 14,
                backgroundColor: C.card, borderRadius: Radius.control, borderWidth: focused === key ? 1.5 : 1,
                borderColor: error ? C.danger : focused === key ? C.primary : C.border,
            }}>
                <Ionicons name={icon} size={20} color={focused === key ? C.primary : C.mutedForeground} />
                <TextInput
                    {...props}
                    onFocus={() => setFocused(key)}
                    onBlur={() => setFocused(null)}
                    placeholderTextColor={C.mutedForeground}
                    style={{ flex: 1, color: C.foreground, paddingVertical: 14, fontSize: 15, textAlign: 'right' }}
                />
                {trailing}
            </View>
            {error ? <Text style={{ color: C.danger, fontSize: 12.5, textAlign: 'right' }}>{error}</Text> : null}
        </View>
    );

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.background }}>
            <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 18 }} keyboardShouldPersistTaps="handled">
                <View style={{ alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 88, height: 88, borderRadius: Radius.card * 2, overflow: 'hidden', backgroundColor: C.primary }}>
                        <Image source={require('../assets/images/icon.png')} style={{ width: 88, height: 88 }} resizeMode="cover" />
                    </View>
                    <Text style={{ color: C.foreground, fontSize: 30, fontWeight: '900' }}>فاراماس</Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 15 }}>نظام إدارة صيدليتك</Text>
                </View>

                <Surface style={{ gap: 14, padding: 18 }}>
                    <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '900', textAlign: 'right' }}>تسجيل الدخول</Text>

                    <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '700', textAlign: 'right' }}>البريد الإلكتروني</Text>
                    {field('email', 'mail-outline', {
                        value: email, onChangeText: (v) => { setEmail(v); setErrorMsg(null); },
                        placeholder: 'أدخل بريدك الإلكتروني', keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email',
                    }, touched && !email.trim() ? 'أدخل البريد الإلكتروني' : null)}

                    <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '700', textAlign: 'right' }}>كلمة المرور</Text>
                    {field('password', 'lock-closed-outline', {
                        value: password, onChangeText: (v) => { setPassword(v); setErrorMsg(null); },
                        placeholder: 'أدخل كلمة المرور', secureTextEntry: !showPassword, autoComplete: 'password',
                        onSubmitEditing: handleLogin, returnKeyType: 'go',
                    }, touched && !password ? 'أدخل كلمة المرور' : null, (
                        <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={8} accessibilityLabel={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
                            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.mutedForeground} />
                        </TouchableOpacity>
                    ))}

                    {errorMsg ? <InfoNote tone="danger" text={errorMsg} /> : null}

                    <AppButton label="تسجيل الدخول" icon="log-in-outline" loading={loading} onPress={handleLogin} />

                    {isBiometricSupported && hasSavedCredentials && (
                        <AppButton label="الدخول بالبصمة" icon="finger-print" variant="outline" disabled={loading} onPress={handleBiometricLogin} />
                    )}
                </Surface>
            </ScrollView>

            <Modal visible={showBiometricPrompt} transparent animationType="fade" onRequestClose={() => finishBiometricPrompt(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
                    <Surface style={{ alignItems: 'center', gap: 12, padding: 22 }}>
                        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="finger-print" size={34} color={C.primary} />
                        </View>
                        <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900' }}>تفعيل الدخول السريع</Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 14, textAlign: 'center', lineHeight: 21 }}>
                            فعّل الدخول بالبصمة على هذا الجهاز لتسجيل الدخول بسرعة في المرات القادمة.
                        </Text>
                        <AppButton label="نعم، تفعيل" icon="finger-print" onPress={() => finishBiometricPrompt(true)} style={{ alignSelf: 'stretch' }} />
                        <AppButton label="لاحقاً" variant="outline" onPress={() => finishBiometricPrompt(false)} style={{ alignSelf: 'stretch' }} />
                    </Surface>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}
