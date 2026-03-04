import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '../services/auth';
import { biometricService } from '../services/biometric';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
    const { refreshUser } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isBiometricSupported, setIsBiometricSupported] = useState(false);
    const [hasSavedCredentials, setHasSavedCredentials] = useState(false);

    useEffect(() => {
        checkBiometric();
    }, []);

    const checkBiometric = async () => {
        const supported = await biometricService.checkHardware();
        setIsBiometricSupported(supported);
        if (supported) {
            const creds = await biometricService.getCredentials();
            setHasSavedCredentials(!!creds);
        }
    };

    const handleBiometricLogin = async () => {
        const authenticated = await biometricService.authenticate();
        if (authenticated) {
            setLoading(true);
            try {
                const creds = await biometricService.getCredentials();
                if (creds) {
                    await authService.login(creds.email, creds.pass);
                    await refreshUser(); // sync AuthContext React state with SecureStore
                    router.replace('/(tabs)');
                } else {
                    Alert.alert('خطأ', 'لا توجد بيانات محفوظة');
                }
            } catch (error: any) {
                Alert.alert('خطأ', error.message || 'فشل تسجيل الدخول بالبصمة');
            } finally {
                setLoading(false);
            }
        }
    };

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('خطأ', 'يرجى ملء جميع الحقول');
            return;
        }

        setLoading(true);
        try {
            await authService.login(email, password);
            // Sync AuthContext React state with the newly stored user so the
            // role-based dashboard renders correctly even on the very first navigation.
            await refreshUser();

            // Prompt to save for biometrics if supported and not already saved
            if (isBiometricSupported) {
                Alert.alert(
                    'تفعيل الدخول السريع',
                    'هل تريد تفعيل الدخول بالبصمة/الوجه للمرات القادمة؟',
                    [
                        {
                            text: 'لا',
                            style: 'cancel',
                            onPress: () => router.replace('/(tabs)')
                        },
                        {
                            text: 'نعم',
                            onPress: async () => {
                                await biometricService.saveCredentials(email, password);
                                router.replace('/(tabs)');
                            }
                        }
                    ]
                );
            } else {
                router.replace('/(tabs)');
            }
        } catch (error: any) {
            Alert.alert('خطأ', error.message || 'فشل تسجيل الدخول');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <View style={styles.header}>
                <View style={styles.iconContainer}>
                    <Ionicons name="medical" size={48} color="#fff" />
                </View>
                <Text style={styles.title}>فاراماس</Text>
                <Text style={styles.subtitle}>نظام إدارة الصيدليات</Text>
            </View>

            <View style={styles.form}>
                <View style={styles.inputContainer}>
                    <Ionicons name="mail-outline" size={20} color="#6b7280" style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="البريد الإلكتروني"
                        placeholderTextColor="#9ca3af"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        textAlign="right"
                    />
                </View>

                <View style={styles.inputContainer}>
                    <Ionicons name="lock-closed-outline" size={20} color="#6b7280" style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="كلمة المرور"
                        placeholderTextColor="#9ca3af"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        textAlign="right"
                    />
                    <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeIcon}
                    >
                        <Ionicons
                            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                            size={20}
                            color="#6b7280"
                        />
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleLogin}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Ionicons name="log-in-outline" size={20} color="#fff" />
                            <Text style={styles.buttonText}>تسجيل الدخول</Text>
                        </>
                    )}
                </TouchableOpacity>

                {isBiometricSupported && hasSavedCredentials && (
                    <TouchableOpacity
                        style={[styles.biometricButton, loading && styles.buttonDisabled]}
                        onPress={handleBiometricLogin}
                        disabled={loading}
                    >
                        <Ionicons name="finger-print" size={28} color="#0F7575" />
                        <Text style={styles.biometricText}>الدخول بالبصمة</Text>
                    </TouchableOpacity>
                )}
            </View>

            <Text style={styles.footer}>© 2024 فاراماس - جميع الحقوق محفوظة</Text>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F7575',
    },
    header: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 60,
    },
    iconContainer: {
        width: 100,
        height: 100,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
    },
    form: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        padding: 30,
        paddingTop: 40,
    },
    inputContainer: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        borderRadius: 6,
        marginBottom: 16,
        paddingHorizontal: 16,
    },
    inputIcon: {
        marginLeft: 10,
    },
    input: {
        flex: 1,
        height: 50,
        fontSize: 16,
        color: '#1f2937',
    },
    eyeIcon: {
        padding: 4,
    },
    button: {
        backgroundColor: '#0F7575',
        borderRadius: 6,
        height: 54,
        flexDirection: 'row-reverse',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    footer: {
        textAlign: 'center',
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        paddingVertical: 20,
        backgroundColor: '#fff',
    },
    biometricButton: {
        flexDirection: 'row-reverse',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginTop: 20,
        padding: 10,
        borderWidth: 1,
        borderColor: '#0F7575',
        borderRadius: 6,
        backgroundColor: '#f0fafa',
    },
    biometricText: {
        color: '#0F7575',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
