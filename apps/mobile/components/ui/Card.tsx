import React from 'react';
import { View, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
    children: React.ReactNode;
}

/**
 * Themed card container — uses NativeWind design tokens.
 * Background, border and rounding are all token-driven (no hardcoded hex).
 */
export function Card({ children, className, style, ...props }: CardProps) {
    return (
        <View
            className={`bg-card border border-border rounded-2xl p-4 ${className ?? ''}`}
            style={style}
            {...props}
        >
            {children}
        </View>
    );
}

export default Card;
