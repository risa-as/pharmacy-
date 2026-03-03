import React, { useEffect, useRef } from 'react';
import { Animated, View, ViewProps } from 'react-native';
import { Colors } from '../../constants/colors';
import { useTheme } from '../../context/ThemeContext';

interface SkeletonProps extends ViewProps {
    width?: number | `${number}%`;
    height?: number;
    radius?: number;
}

/**
 * Animated skeleton placeholder for loading states.
 * Pulses opacity between 0.4 and 1 using Animated.Value.
 * Color is sourced from design tokens — no hardcoded hex.
 */
export function Skeleton({ width, height = 16, radius = 8, style, ...props }: SkeletonProps) {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const opacity = useRef(new Animated.Value(0.4)).current;

    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
            ]),
        );
        pulse.start();
        return () => pulse.stop();
    }, [opacity]);

    return (
        <Animated.View
            style={[
                {
                    width: width ?? '100%',
                    height,
                    borderRadius: radius,
                    backgroundColor: C.border,
                    opacity,
                },
                style,
            ]}
            {...props}
        />
    );
}

/**
 * Convenience multi-line skeleton block.
 */
export function SkeletonBlock({ lines = 3, gap = 8 }: { lines?: number; gap?: number }) {
    return (
        <View style={{ gap }}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} />
            ))}
        </View>
    );
}

export default Skeleton;
