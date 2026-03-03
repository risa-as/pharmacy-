import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps } from 'react-native';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends TouchableOpacityProps {
    label: string;
    variant?: Variant;
    loading?: boolean;
}

const variantClasses: Record<Variant, { container: string; text: string }> = {
    primary: {
        container: 'bg-primary items-center justify-center rounded-xl px-5 py-3',
        text: 'text-white font-semibold text-base',
    },
    secondary: {
        container: 'bg-card border border-border items-center justify-center rounded-xl px-5 py-3',
        text: 'text-foreground font-semibold text-base',
    },
    ghost: {
        container: 'items-center justify-center rounded-xl px-5 py-3',
        text: 'text-primary font-semibold text-base',
    },
};

/**
 * Themed button — primary / secondary / ghost variants.
 * Supports loading spinner and disabled state.
 * Zero hardcoded hex — all via NativeWind design tokens.
 */
export function Button({
    label,
    variant = 'primary',
    loading = false,
    disabled,
    className,
    ...props
}: ButtonProps) {
    const { container, text } = variantClasses[variant];
    const opacity = disabled || loading ? 'opacity-50' : '';

    return (
        <TouchableOpacity
            className={`${container} ${opacity} ${className ?? ''}`}
            disabled={disabled || loading}
            activeOpacity={0.75}
            {...props}
        >
            {loading ? (
                <ActivityIndicator color={variant === 'primary' ? '#FFFFFF' : undefined} size="small" />
            ) : (
                <Text className={text}>{label}</Text>
            )}
        </TouchableOpacity>
    );
}

export default Button;
