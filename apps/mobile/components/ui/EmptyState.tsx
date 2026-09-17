import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
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
    /** Override the box — e.g. `minHeight: 0` inside a short list. */
    style?: StyleProp<ViewStyle>;
}

/**
 * Empty state placeholder — icon + title + subtitle + optional action button.
 * Uses design tokens for all colors; no hardcoded hex.
 */
export function EmptyState({ icon = 'document-outline', title, subtitle, actionLabel, onAction, style }: EmptyStateProps) {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    return (
        <View style={[{ flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 42 }, style]}>
            <View style={{
                width: 82, height: 82, borderRadius: 41,
                backgroundColor: C.primaryMuted, borderWidth: 1, borderColor: C.border,
                alignItems: 'center', justifyContent: 'center',
            }}>
                <Ionicons name={icon} size={38} color={C.primary} />
            </View>
            <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900', textAlign: 'center', marginTop: 18 }}>{title}</Text>
            {subtitle ? (
                <Text style={{ color: C.mutedForeground, fontSize: 13.5, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 310 }}>{subtitle}</Text>
            ) : null}
            {actionLabel && onAction ? (
                <View style={{ marginTop: 18 }}>
                    <Button label={actionLabel} onPress={onAction} />
                </View>
            ) : null}
        </View>
    );
}

export default EmptyState;
