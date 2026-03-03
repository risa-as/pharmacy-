import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useTheme } from '../../context/ThemeContext';
import { Button } from './Button';

interface EmptyStateProps {
    icon?: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: string;
    actionLabel?: string;
    onAction?: () => void;
}

/**
 * Empty state placeholder — icon + title + subtitle + optional action button.
 * Uses design tokens for all colors; no hardcoded hex.
 */
export function EmptyState({ icon = 'document-outline', title, subtitle, actionLabel, onAction }: EmptyStateProps) {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    return (
        <View className="flex-1 items-center justify-center px-8 py-16">
            <Ionicons name={icon} size={56} color={C.mutedForeground} />
            <Text className="text-foreground text-lg font-semibold mt-4 text-center">{title}</Text>
            {subtitle ? (
                <Text className="text-muted-foreground text-sm mt-2 text-center">{subtitle}</Text>
            ) : null}
            {actionLabel && onAction ? (
                <View className="mt-6">
                    <Button label={actionLabel} onPress={onAction} />
                </View>
            ) : null}
        </View>
    );
}

export default EmptyState;
