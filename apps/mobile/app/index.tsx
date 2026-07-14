import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { isServerConfigured } from '../services/api';
import { authService } from '../services/auth';
import { LightColors } from '../constants/colors';

/**
 * Startup gate. Decides the first screen:
 *  - server not configured → server-config
 *  - already signed in (token in secure storage) → main tabs
 *  - otherwise → login
 *
 * Previously this always redirected to /login, so a saved session was ignored
 * and the user had to log in again on every app restart. We now check for a
 * stored token first; AuthContext still validates/revokes it once inside.
 */
export default function Index() {
    const [target, setTarget] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            const configured = await isServerConfigured();
            if (!configured) {
                setTarget('/server-config');
                return;
            }
            const authed = await authService.isAuthenticated().catch(() => false);
            setTarget(authed ? '/(tabs)' : '/login');
        })();
    }, []);

    if (!target) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: LightColors.primary }}>
                <ActivityIndicator size="large" color="#fff" />
            </View>
        );
    }

    return <Redirect href={target as any} />;
}
