import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { getBaseUrl, resetSessionExpired, setCachedToken } from './api';

export interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    branchId?: string | null;
}

// ── Storage keys ────────────────────────────────────────────────────────────
const TOKEN_KEY       = 'authToken';
const USER_KEY        = 'user';
const DEVICE_TOKEN_KEY = 'deviceToken'; // stored in plain AsyncStorage (not sensitive)

// ── Secure storage helpers ───────────────────────────────────────────────────
async function secureSet(key: string, value: string) {
    try {
        await SecureStore.setItemAsync(key, value);
    } catch {
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

// ── Device token (UUID, one per installation, persists forever) ───────────────
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function getOrCreateDeviceToken(): Promise<string> {
    const stored = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
    if (stored) return stored;
    const token = generateUUID();
    await AsyncStorage.setItem(DEVICE_TOKEN_KEY, token);
    return token;
}

// ── Sentinel error so callers distinguish plan-limit from network errors ─────
export class MobileSessionLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MobileSessionLimitError';
    }
}

// ── Internal session helpers ──────────────────────────────────────────────────

async function startMobileSession(userId: string, jwtToken?: string): Promise<void> {
    const deviceToken = await getOrCreateDeviceToken();
    const baseUrl = await getBaseUrl();
    const token = jwtToken ?? await secureGet(TOKEN_KEY);
    const res = await fetch(`${baseUrl}/mobile/session`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId, deviceToken }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر فتح جلسة الموبايل. يرجى المحاولة مرة أخرى.');
    }
}

/**
 * Called on every app startup to refresh/register the device session.
 * - 403  → throws MobileSessionLimitError (caller forces logout)
 * - network error → resolves silently (offline mode allowed)
 */
async function refreshMobileSession(userId: string): Promise<void> {
    try {
        const deviceToken = await getOrCreateDeviceToken();
        const baseUrl = await getBaseUrl();
        const token = await secureGet(TOKEN_KEY);
        const res = await fetch(`${baseUrl}/mobile/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ userId, deviceToken }),
        });
        if (res.status === 403) {
            const data = await res.json().catch(() => ({}));
            throw new MobileSessionLimitError(
                data.error || 'تم تجاوز الحد الأقصى لجلسات الموبايل في باقتك.'
            );
        }
    } catch (err: any) {
        if (err instanceof MobileSessionLimitError) throw err;
        // Network/server error → allow offline access silently
    }
}

async function endMobileSession(): Promise<void> {
    try {
        const deviceToken = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
        if (!deviceToken) return;
        const baseUrl = await getBaseUrl();
        const token = await secureGet(TOKEN_KEY);
        await fetch(`${baseUrl}/mobile/session`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ deviceToken }),
        });
    } catch {
        // Silent — cleanup cron handles orphaned sessions
    }
}

// ── Public auth service ───────────────────────────────────────────────────────
export const authService = {

    async login(email: string, password: string): Promise<User> {
        const baseUrl = await getBaseUrl();
        const response = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const rawText = await response.text();
        let data: any;
        try {
            data = JSON.parse(rawText);
        } catch {
            console.error('[Auth] Non-JSON response from /auth/login:', response.status, rawText.slice(0, 300));
            throw new Error(`خطأ في الاتصال بالخادم (${response.status}). يرجى المحاولة مرة أخرى.`);
        }
        if (!response.ok) throw new Error(data.message || 'فشل تسجيل الدخول');

        const { token, user } = data;

        await secureSet(TOKEN_KEY, token);
        await secureSet(USER_KEY, JSON.stringify(user));
        setCachedToken(token);
        resetSessionExpired();

        // Enforce session limit for all non-SUPER_ADMIN roles
        if (user.role !== 'SUPER_ADMIN') {
            try {
                await startMobileSession(user.id, token);
            } catch (sessionError: any) {
                await secureDelete(TOKEN_KEY);
                await secureDelete(USER_KEY);
                throw sessionError;
            }
        }

        return user;
    },

    async logout(): Promise<void> {
        const userStr = await secureGet(USER_KEY);
        if (userStr) {
            try {
                const user: User = JSON.parse(userStr);
                if (user.role !== 'SUPER_ADMIN') {
                    await endMobileSession();
                }
            } catch {
                // proceed with logout anyway
            }
        }
        await secureDelete(TOKEN_KEY);
        await secureDelete(USER_KEY);
    },

    async isAuthenticated(): Promise<boolean> {
        return !!(await secureGet(TOKEN_KEY));
    },

    // Called on app startup — throws MobileSessionLimitError if seat is taken
    async verifySessionOnStartup(userId: string): Promise<void> {
        return refreshMobileSession(userId);
    },

    async getCurrentUser(): Promise<User | null> {
        const userStr = await secureGet(USER_KEY);
        if (!userStr) return null;
        try { return JSON.parse(userStr); } catch { return null; }
    },

    async getToken(): Promise<string | null> {
        return secureGet(TOKEN_KEY);
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
        const user = await this.getCurrentUser();
        if (!user?.email) throw new Error('User not found');

        const token = await this.getToken();
        const baseUrl = await getBaseUrl();
        const response = await fetch(`${baseUrl}/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ email: user.email, currentPassword, newPassword }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'فشل تحديث كلمة المرور');
    },
};
