import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { request } from './api';

// Expo Go does not support remote push notifications (removed in SDK 53).
// We guard every call with this flag AND use lazy require() so the
// expo-notifications module (and its DevicePushTokenAutoRegistration side-effect)
// is never loaded at all when running in Expo Go.
const IS_EXPO_GO = Constants.appOwnership === 'expo';

// Lazily returns the expo-notifications module. Only called when IS_EXPO_GO is false.
// Using require() inside a function prevents Metro from executing the module's
// side-effects at import time in Expo Go.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const getN = () => require('expo-notifications') as typeof import('expo-notifications');

// Subscription shape returned by listener methods
interface Subscription { remove(): void }

export const notificationsService = {
    /**
     * Request push notification permission from the OS.
     * Also sets up the Android notification channel.
     * Returns true if permission is granted. Always false in Expo Go.
     */
    async requestPermission(): Promise<boolean> {
        if (IS_EXPO_GO) return false;
        const N = getN();

        if (Platform.OS === 'android') {
            await N.setNotificationChannelAsync('faramace-alerts', {
                name: 'Faramace Alerts',
                importance: N.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#0F7575',
                sound: 'default',
            });
        }
        const { status: existing } = await N.getPermissionsAsync();
        if (existing === 'granted') return true;
        const { status } = await N.requestPermissionsAsync();
        return status === 'granted';
    },

    /**
     * Get the Expo push token and register it with the backend.
     * No-op in Expo Go — returns null silently.
     */
    async registerPushToken(): Promise<string | null> {
        if (IS_EXPO_GO) {
            console.log('[Notifications] Expo Go detected — skipping push token registration');
            return null;
        }

        try {
            const granted = await notificationsService.requestPermission();
            if (!granted) {
                console.warn('[Notifications] Permission not granted — push token not registered');
                return null;
            }

            const projectId = Constants.expoConfig?.extra?.eas?.projectId;
            if (!projectId) {
                console.warn('[Notifications] EAS projectId missing from app.json extra.eas');
                return null;
            }

            const { data: token } = await getN().getExpoPushTokenAsync({ projectId });

            await request('/notifications/push', {
                method: 'PUT',
                body: JSON.stringify({ expoPushToken: token, pushEnabled: true }),
            });

            console.log('[Notifications] Push token registered:', token);
            return token;
        } catch (error) {
            console.error('[Notifications] registerPushToken failed:', error);
            return null;
        }
    },

    /**
     * Schedule an immediate local notification. No-op in Expo Go.
     */
    async scheduleLocalNotification(
        title: string,
        body: string,
        data?: Record<string, unknown>,
    ): Promise<void> {
        if (IS_EXPO_GO) return;
        await getN().scheduleNotificationAsync({
            content: { title, body, data: data ?? {} },
            trigger: null, // null = immediate
        });
    },

    /**
     * Listen for incoming notifications while app is in foreground.
     * Returns a no-op subscription in Expo Go.
     */
    addNotificationReceivedListener(
        handler: (notification: import('expo-notifications').Notification) => void,
    ): Subscription {
        if (IS_EXPO_GO) return { remove: () => {} };
        return getN().addNotificationReceivedListener(handler);
    },

    /**
     * Listen for user tapping a notification (foreground or background).
     * Returns a no-op subscription in Expo Go.
     */
    addNotificationResponseReceivedListener(
        handler: (response: import('expo-notifications').NotificationResponse) => void,
    ): Subscription {
        if (IS_EXPO_GO) return { remove: () => {} };
        return getN().addNotificationResponseReceivedListener(handler);
    },

    /** OS permission state, without prompting. 'unavailable' in Expo Go. */
    async getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined' | 'unavailable'> {
        if (IS_EXPO_GO) return 'unavailable';
        try {
            const { status } = await getN().getPermissionsAsync();
            return status as 'granted' | 'denied' | 'undetermined';
        } catch {
            return 'unavailable';
        }
    },

    /**
     * Applies the per-category preferences (settings › notifications) to
     * notifications that arrive while the app is open. Notifications delivered
     * while the app is closed are governed by the OS permission.
     */
    installPreferenceFilter(): void {
        if (IS_EXPO_GO) return;
        const N = getN();
        N.setNotificationHandler({
            handleNotification: async (notification) => {
                const type = String((notification.request.content.data as Record<string, unknown>)?.type ?? '');
                const prefs = await readNotificationPrefs();
                const category = type === 'LOW_STOCK' || type === 'OUT_OF_STOCK' ? 'lowStock'
                    : type === 'EXPIRY' || type === 'EXPIRED' ? 'expiry'
                    : type === 'NEW_PURCHASE' ? 'purchases'
                    : null;
                const show = category ? prefs[category] : true;
                return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: show };
            },
        });
    },
};

export interface NotificationPrefs { lowStock: boolean; expiry: boolean; purchases: boolean }
export const NOTIFICATION_PREFS_KEY = 'notification_prefs';
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { lowStock: true, expiry: true, purchases: true };

export async function readNotificationPrefs(): Promise<NotificationPrefs> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
        const raw = await SecureStore.getItemAsync(NOTIFICATION_PREFS_KEY);
        return raw ? { ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(raw) } : DEFAULT_NOTIFICATION_PREFS;
    } catch {
        return DEFAULT_NOTIFICATION_PREFS;
    }
}
