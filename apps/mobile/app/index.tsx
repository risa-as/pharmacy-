import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { authService } from '../services/auth';
import { LightColors } from '../constants/colors';

/**
 * Startup gate. Decides the first screen:
 *  - already signed in (token in secure storage) → main tabs
 *  - otherwise → login
 *
 * The server address is fixed by the build (services/api.ts), so there is no
 * server setup step. AuthContext still validates/revokes a stored token once inside.
 */
export default function Index() {
    const [target, setTarget] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
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
