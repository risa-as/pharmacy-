import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { isServerConfigured } from '../services/api';
import { View, ActivityIndicator } from 'react-native';
import { LightColors } from '../constants/colors';

export default function Index() {
    const [checked, setChecked] = useState(false);
    const [isConfigured, setIsConfigured] = useState(false);
    const router = useRouter();

    useEffect(() => {
        checkConfig();
    }, []);

    const checkConfig = async () => {
        const configured = await isServerConfigured();
        setIsConfigured(configured);
        setChecked(true);
    };

    if (!checked) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: LightColors.primary }}>
                <ActivityIndicator size="large" color="#fff" />
            </View>
        );
    }

    if (!isConfigured) {
        return <Redirect href="/server-config" />;
    }

    return <Redirect href="/login" />;
}
