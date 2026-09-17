import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

const LEGACY_KEY = 'settings_notifications';
const PREFS_KEY = 'notification_prefs';

/**
 * Legacy route (navigation-map §10). Its global notifications switch is
 * migrated into the per-category preferences once, then the old link lands on
 * Settings. The theme switch already shares ThemeContext's key.
 */
export default function PreferencesRedirect() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const [done, setDone] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const legacy = await AsyncStorage.getItem(LEGACY_KEY);
                if (legacy !== null) {
                    const existing = await SecureStore.getItemAsync(PREFS_KEY);
                    if (!existing && JSON.parse(legacy) === false) {
                        await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify({ lowStock: false, expiry: false, purchases: false }));
                    }
                    await AsyncStorage.removeItem(LEGACY_KEY);
                }
            } catch { /* keep going — never block navigation on a migration */ }
            setDone(true);
        })();
    }, []);

    if (!done) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background }}>
                <ActivityIndicator color={C.primary} />
            </View>
        );
    }
    return <Redirect href="/(tabs)/settings" />;
}
