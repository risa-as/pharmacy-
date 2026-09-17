import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { Colors, Radius } from '../../constants/colors';

interface ScreenHeaderProps {
    title: string;
    subtitle?: string;
    /** Hide the back button (tab roots, login). */
    hideBack?: boolean;
    /** Custom back handler; defaults to router.back() or `fallbackHref`. */
    onBack?: () => void;
    /** Where to go when there is no history (deep link / notification). */
    fallbackHref?: Href;
    /** Action rendered on the opposite (left) side. */
    action?: React.ReactNode;
    /** Adds the safe-area top inset (screens without a native header). */
    withSafeArea?: boolean;
}

/**
 * Standard page header (navigation-map §11): back button at the top-right
 * with a right-pointing arrow, title beside it, optional action on the left.
 */
export function ScreenHeader({
    title,
    subtitle,
    hideBack,
    onBack,
    fallbackHref = '/(tabs)/more' as Href,
    action,
    withSafeArea = true,
}: ScreenHeaderProps) {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const insets = useSafeAreaInsets();

    const handleBack = () => {
        if (onBack) return onBack();
        if (router.canGoBack()) router.back();
        else router.replace(fallbackHref);
    };

    return (
        <View
            style={{
                paddingTop: (withSafeArea ? insets.top : 0) + 10,
                paddingHorizontal: 16,
                paddingBottom: 12,
                flexDirection: 'row-reverse',
                alignItems: 'center',
                gap: 12,
                backgroundColor: C.background,
            }}
        >
            {!hideBack && (
                <TouchableOpacity
                    onPress={handleBack}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="رجوع"
                    style={{
                        width: 42, height: 42, borderRadius: Radius.control,
                        backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
                        alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    <Ionicons name="arrow-forward" size={20} color={C.primary} />
                </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
                <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '900', textAlign: 'right' }} numberOfLines={1}>
                    {title}
                </Text>
                {subtitle ? (
                    <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>
                        {subtitle}
                    </Text>
                ) : null}
            </View>
            {action ? <View>{action}</View> : null}
        </View>
    );
}

/** Square icon button used as a header action. */
export function HeaderIconButton({
    icon,
    onPress,
    badge,
    accessibilityLabel,
}: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    onPress: () => void;
    badge?: number;
    accessibilityLabel: string;
}) {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={{
                width: 42, height: 42, borderRadius: Radius.control,
                backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center',
            }}
        >
            <Ionicons name={icon} size={20} color={C.primary} />
            {badge != null && badge > 0 && (
                <View style={{
                    position: 'absolute', top: -5, left: -5, minWidth: 18, height: 18, borderRadius: 9,
                    backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
                }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 99 ? '99+' : badge}</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

export default ScreenHeader;
