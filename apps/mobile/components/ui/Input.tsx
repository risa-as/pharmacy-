import React, { useState } from 'react';
import { View, Text, TextInput, TextInputProps } from 'react-native';
import { Colors } from '../../constants/colors';
import { useTheme } from '../../context/ThemeContext';

interface InputProps extends TextInputProps {
    label?: string;
    error?: string;
}

/**
 * Themed text input — label, error state, and focus ring via colors.ts tokens.
 * No hardcoded hex values.
 */
export function Input({ label, error, style, ...props }: InputProps) {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const [focused, setFocused] = useState(false);

    const borderColor = error
        ? C.danger
        : focused
        ? C.primary
        : C.border;

    return (
        <View className="gap-1">
            {label ? (
                <Text className="text-foreground text-sm font-medium mb-1">{label}</Text>
            ) : null}

            <TextInput
                style={[
                    {
                        backgroundColor: C.input,
                        borderColor,
                        borderWidth: focused ? 2 : 1,
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        color: C.foreground,
                        fontSize: 15,
                    },
                    style,
                ]}
                placeholderTextColor={C.mutedForeground}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                {...props}
            />

            {error ? (
                <Text style={{ color: C.danger }} className="text-xs mt-0.5">{error}</Text>
            ) : null}
        </View>
    );
}

export default Input;
