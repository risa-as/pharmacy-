import React from 'react';
import { View, ViewProps } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

interface CardProps extends ViewProps {
    children: React.ReactNode;
}

/**
 * Themed card container.
 * Background and border are applied via inline styles using the ThemeContext so they
 * reliably switch in dark mode. NativeWind className is still accepted for structural
 * utilities (rounding, padding, flex layout) but MUST NOT include color classes
 * (bg-*, border-*) since NativeWind v2 dark-mode color tokens are unreliable.
 */
export function Card({ children, className, style, ...props }: CardProps) {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    return (
        <View
            className={`rounded-xl p-4 ${className ?? ''}`}
            style={[
                { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
                style,
            ]}
            {...props}
        >
            {children}
        </View>
    );
}

export default Card;
