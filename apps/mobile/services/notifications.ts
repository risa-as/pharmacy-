import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { request } from './api';

// Expo Go does not support remote push notifications.
// Guard all notification setup to prevent crashes during development.
const IS_EXPO_GO = Constants.appOwnership === 'expo';

// Show alerts in foreground (skip in Expo Go — API was removed)
if (!IS_EXPO_GO) {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
        }),
    });
}

export const notificationsService = {
    /**
     * Request push notification permission from the OS.
     * Also sets up the Android notification channel.
     * Returns true if permission is granted.
     */
    async requestPermission(): Promise<boolean> {
        if (IS_EXPO_GO) return false;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('faramace-alerts', {
                name: 'Faramace Alerts',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#0F7575',
                sound: 'default',
            });
        }
        const { status: existing } = await Notifications.getPermissionsAsync();
        if (existing === 'granted') return true;
        const { status } = await Notifications.requestPermissionsAsync();
        return status === 'granted';
    },

    /**
     * Get the Expo push token and register it with the backend.
     * Requires EAS projectId in app.json extra.eas.projectId.
     * Returns the token string, or null if unavailable (including Expo Go).
     */
    async registerPushToken(): Promise<string | null> {
        // Push token registration is not supported in Expo Go.
        // Silently skip to prevent crashes during development.
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

            const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

            // Persist token to the server
            await request('/notifications/push', {
                method: 'PUT',
                body: JSON.stringify({ expoPushToken: token, pushEnabled: true }),
            });

            console.log('[Notifications] Push token registered:', token);
            return token;
        } catch (error) {
            // Non-fatal: app still works without push notifications
            console.error('[Notifications] registerPushToken failed:', error);
            return null;
        }
    },

    /**
     * Schedule an immediate local notification (shown right away).
     */
    async scheduleLocalNotification(
        title: string,
        body: string,
        data?: Record<string, unknown>,
    ): Promise<void> {
        await Notifications.scheduleNotificationAsync({
            content: { title, body, data: data ?? {} },
            trigger: null, // null = immediate
        });
    },

    /**
     * Listen for incoming notifications while app is in foreground.
     * Returns the subscription — call .remove() to clean up.
     */
    addNotificationReceivedListener(
        handler: (notification: Notifications.Notification) => void,
    ): Notifications.Subscription {
        return Notifications.addNotificationReceivedListener(handler);
    },

    /**
     * Listen for user tapping a notification (foreground or background).
     * Returns the subscription — call .remove() to clean up.
     */
    addNotificationResponseReceivedListener(
        handler: (response: Notifications.NotificationResponse) => void,
    ): Notifications.Subscription {
        return Notifications.addNotificationResponseReceivedListener(handler);
    },
};
