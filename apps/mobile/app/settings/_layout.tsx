import { Stack } from 'expo-router';
import { LightColors } from '../../constants/colors';

export default function SettingsLayout() {
    return (
        <Stack
            screenOptions={{
                headerStyle: {
                    backgroundColor: LightColors.primary,
                },
                headerTintColor: LightColors.card,
                headerTitleAlign: 'center',
            }}
        >
            <Stack.Screen name="account" options={{ title: 'معلومات الحساب' }} />
            <Stack.Screen name="password" options={{ title: 'تغيير كلمة المرور' }} />
            <Stack.Screen name="notifications" options={{ title: 'الإشعارات' }} />
            <Stack.Screen name="theme" options={{ title: 'المظهر' }} />
            <Stack.Screen name="support" options={{ title: 'المساعدة والدعم' }} />
            <Stack.Screen name="about" options={{ title: 'حول التطبيق' }} />
        </Stack>
    );
}
