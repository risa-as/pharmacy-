import React from 'react';
import { View, Text, ViewProps } from 'react-native';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'default';

interface BadgeProps extends ViewProps {
    label: string;
    variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, { container: string; text: string }> = {
    success:  { container: 'bg-green-100 dark:bg-green-950',  text: 'text-green-700 dark:text-green-400' },
    warning:  { container: 'bg-yellow-100 dark:bg-yellow-950', text: 'text-yellow-700 dark:text-yellow-400' },
    danger:   { container: 'bg-red-100 dark:bg-red-950',      text: 'text-red-700 dark:text-red-400' },
    info:     { container: 'bg-blue-100 dark:bg-blue-950',    text: 'text-blue-700 dark:text-blue-400' },
    default:  { container: 'bg-stone-200 dark:bg-stone-700',    text: 'text-stone-600 dark:text-stone-300' },
};

/**
 * Status badge — success / warning / danger / info / default variants.
 * Fully driven by NativeWind classes, no hardcoded hex.
 */
export function Badge({ label, variant = 'default', className, ...props }: BadgeProps) {
    const { container, text } = variantClasses[variant];

    return (
        <View
            className={`${container} rounded-full px-2.5 py-0.5 self-start ${className ?? ''}`}
            {...props}
        >
            <Text className={`${text} text-xs font-medium`}>{label}</Text>
        </View>
    );
}

export default Badge;
