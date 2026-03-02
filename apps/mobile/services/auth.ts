import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getBaseUrl, API_BASE_URL, resetSessionExpired } from './api';

export interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    branchId?: string | null;
}

// مفاتيح التخزين الآمن
const TOKEN_KEY = 'authToken';
const USER_KEY = 'user';

// دوال التخزين الآمن - تستخدم SecureStore للأمان
async function secureSet(key: string, value: string) {
    try {
        await SecureStore.setItemAsync(key, value);
    } catch {
        // Fallback to AsyncStorage if SecureStore fails (e.g. web/simulator)
        await AsyncStorage.setItem(key, value);
    }
}

async function secureGet(key: string): Promise<string | null> {
    try {
        return await SecureStore.getItemAsync(key);
    } catch {
        return await AsyncStorage.getItem(key);
    }
}

async function secureDelete(key: string) {
    try {
        await SecureStore.deleteItemAsync(key);
    } catch {
        await AsyncStorage.removeItem(key);
    }
}

export const authService = {
    // Login
    async login(email: string, password: string): Promise<User> {
        const baseUrl = await getBaseUrl();
        const response = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'فشل تسجيل الدخول');
        }

        const { token, user } = data;

        // Store token securely and user data
        await secureSet(TOKEN_KEY, token);
        await secureSet(USER_KEY, JSON.stringify(user));

        // Reset the session-expired flag so background polling can resume
        resetSessionExpired();

        return user;
    },

    // Logout
    async logout(): Promise<void> {
        await secureDelete(TOKEN_KEY);
        await secureDelete(USER_KEY);
    },

    // Check if authenticated
    async isAuthenticated(): Promise<boolean> {
        const token = await secureGet(TOKEN_KEY);
        return !!token;
    },

    // Get current user
    async getCurrentUser(): Promise<User | null> {
        const userStr = await secureGet(USER_KEY);
        if (userStr) {
            try {
                return JSON.parse(userStr);
            } catch {
                return null;
            }
        }
        return null;
    },

    // Get auth token
    async getToken(): Promise<string | null> {
        return await secureGet(TOKEN_KEY);
    },

    // Change Password — now uses request() with auth token
    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
        const user = await this.getCurrentUser();
        if (!user || !user.email) throw new Error('User not found');

        const token = await this.getToken();
        const baseUrl = await getBaseUrl();
        const response = await fetch(`${baseUrl}/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
                email: user.email,
                currentPassword,
                newPassword,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'فشل تحديث كلمة المرور');
        }
    },
};
