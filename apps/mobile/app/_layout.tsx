import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { dbService } from '../services/db';
import { syncService } from '../services/sync';
import { notificationsService } from '../services/notifications';

import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { SyncProvider, useSyncStatus } from '../context/SyncContext';
import { Colors, LightColors } from '../constants/colors';

// T049 — RTL-correct animation: slide from left for forward navigation in Arabic
const SLIDE_ANIMATION = I18nManager.isRTL ? 'slide_from_left' : 'slide_from_right';

function RootStack() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const { setSyncing, markSynced } = useSyncStatus();

    useEffect(() => {
        // Wire SyncContext callbacks into syncService so the header dot updates
        syncService.setCallbacks({
            onStart: (key) => setSyncing(key, true),
            onDone:  (key) => markSynced(key),
        });

        // Init local DB
        dbService.init();

        // Register Expo push token with the backend (non-blocking)
        notificationsService.registerPushToken();

        // Listen for connection changes → trigger sync when online
        const unsubNetInfo = NetInfo.addEventListener(state => {
            if (state.isConnected && state.isInternetReachable) {
                console.log('Online: Triggering Sync');
                void syncService.syncData();
            }
        });

        // T051 — Deep linking: notification tap → navigate to relevant screen
        // Uses the guarded notificationsService wrapper (no-op in Expo Go) instead of
        // importing expo-notifications directly, which would trigger the SDK 53 side-effect crash.
        const unsubNotif = notificationsService.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data as Record<string, unknown>;
            const type = data?.type as string | undefined;

            switch (type) {
                case 'LOW_STOCK':
                case 'EXPIRY':
                    router.push('/(tabs)/inventory' as any);
                    break;
                case 'NEW_PURCHASE': {
                    const purchaseId = data?.purchaseId as string | undefined;
                    if (purchaseId) router.push(`/purchases/${purchaseId}` as any);
                    else router.push('/(tabs)/purchases' as any);
                    break;
                }
                default:
                    router.push('/(tabs)/alerts' as any);
            }
        });

        return () => {
            unsubNetInfo();
            unsubNotif.remove();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <>
            <StatusBar style="light" />
            <Stack
                screenOptions={{
                    animation: SLIDE_ANIMATION,
                    headerStyle: {
                        backgroundColor: C.primary,
                    },
                    headerTintColor: LightColors.card, // always white on brand-primary header
                    headerTitleStyle: {
                        fontWeight: 'bold',
                    },
                    headerTitleAlign: 'center',
                }}
            >
                <Stack.Screen name="login"           options={{ headerShown: false, animation: 'fade' }} />
                <Stack.Screen name="server-config"   options={{ headerShown: false }} />
                <Stack.Screen name="printer-settings" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)"          options={{ headerShown: false }} />
                <Stack.Screen name="settings"        options={{ headerShown: false }} />
            </Stack>
        </>
    );
}

export default function RootLayout() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <SyncProvider>
                    <RootStack />
                </SyncProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}
