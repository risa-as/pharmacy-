import { Stack, Href } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';
import { ScreenHeader } from '../../components/ui/ScreenHeader';

/** Settings sub-pages share the standard header (back → Settings when opened directly). */
export default function SettingsLayout() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    return (
        <Stack
            screenOptions={{
                header: ({ options }) => <ScreenHeader title={options.title ?? ''} fallbackHref={'/(tabs)/settings' as Href} />,
                contentStyle: { backgroundColor: C.background },
            }}
        >
            <Stack.Screen name="account" options={{ title: 'حسابي' }} />
            <Stack.Screen name="password" options={{ title: 'تغيير كلمة المرور' }} />
            <Stack.Screen name="notifications" options={{ title: 'إعدادات الإشعارات' }} />
            <Stack.Screen name="theme" options={{ title: 'المظهر' }} />
            <Stack.Screen name="support" options={{ title: 'الدعم والمساعدة' }} />
            <Stack.Screen name="about" options={{ title: 'حول التطبيق' }} />
            <Stack.Screen name="preferences" options={{ headerShown: false }} />
        </Stack>
    );
}
