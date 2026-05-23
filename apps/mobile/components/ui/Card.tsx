import React from 'react';
import { View, ViewProps } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

interface CardProps extends ViewProps {
    children: React.ReactNode;
}

export function Card({ children, className, style, ...props }: CardProps) {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    return (
        <View
            className={`p-4 ${className ?? ''}`}
            style={[
                { borderRadius: 5, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
                style,
            ]}
            {...props}
        >
            {children}
        </View>
    );
}

export default Card;
