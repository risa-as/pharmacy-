import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Alert, Platform } from 'react-native';

const KEY_BIOMETRIC_EMAIL = 'biometric_email';
const KEY_BIOMETRIC_PASSWORD = 'biometric_password';

export const biometricService = {
    // Check if hardware supports biometrics
    async checkHardware(): Promise<boolean> {
        const hwd = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        return hwd && isEnrolled;
    },

    // Authenticate user
    async authenticate(): Promise<boolean> {
        try {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'تسجيل الدخول باستخدام البصمة',
                cancelLabel: 'إلغاء',
                disableDeviceFallback: false,
            });
            return result.success;
        } catch (error) {
            console.error('Biometric auth error:', error);
            return false;
        }
    },

    // Save credentials secure
    async saveCredentials(email: string, pass: string): Promise<void> {
        if (Platform.OS === 'web') return;
        await SecureStore.setItemAsync(KEY_BIOMETRIC_EMAIL, email);
        await SecureStore.setItemAsync(KEY_BIOMETRIC_PASSWORD, pass);
    },

    // Get credentials
    async getCredentials(): Promise<{ email: string; pass: string } | null> {
        if (Platform.OS === 'web') return null;
        try {
            const email = await SecureStore.getItemAsync(KEY_BIOMETRIC_EMAIL);
            const pass = await SecureStore.getItemAsync(KEY_BIOMETRIC_PASSWORD);
            if (email && pass) {
                return { email, pass };
            }
        } catch (error) {
            console.error('SecureStore error:', error);
        }
        return null;
    },

    // Clear credentials
    async clearCredentials(): Promise<void> {
        if (Platform.OS === 'web') return;
        await SecureStore.deleteItemAsync(KEY_BIOMETRIC_EMAIL);
        await SecureStore.deleteItemAsync(KEY_BIOMETRIC_PASSWORD);
    },
};
