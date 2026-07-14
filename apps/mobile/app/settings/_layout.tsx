import { Stack, router } from 'expo-router';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { managerPalette, Radius } from '../../constants/colors';

// Custom header matching the purchases / reports sub-page header.
function SettingsHeader({ title }: { title: string }) {
    const { isDarkMode } = useTheme();
    const C = managerPalette(isDarkMode);
    const insets = useSafeAreaInsets();
    return (
        <View style={{
            paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 10,
            flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: C.background,
        }}>
            <TouchableOpacity
                onPress={() => router.back()}
                activeOpacity={0.8}
                style={{ width: 40, height: 40, borderRadius: Radius.xs, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
            >
                <Ionicons name="arrow-forward" size={20} color={C.foreground} />
            </TouchableOpacity>
            <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }}>{title}</Text>
            <View style={{ width: 40 }} />
        </View>
    );
}

export default function SettingsLayout() {
    const { isDarkMode } = useTheme();
    const C = managerPalette(isDarkMode);
    return (
        <Stack
            screenOptions={{
                header: ({ options }) => <SettingsHeader title={options.title ?? ''} />,
                contentStyle: { backgroundColor: C.background },
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
