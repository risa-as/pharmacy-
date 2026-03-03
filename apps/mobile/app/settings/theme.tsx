import React from 'react';
import { View, Text, Switch } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

export default function ThemeScreen() {
    const { isDarkMode, toggleTheme } = useTheme();
    const C = Colors(isDarkMode);

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <View style={{ padding: 20 }}>
                <View style={{
                    backgroundColor: C.card,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: C.border,
                    padding: 16,
                }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.mutedForeground, textAlign: 'right', marginBottom: 16 }}>
                        المظهر
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Switch
                            value={isDarkMode}
                            onValueChange={toggleTheme}
                            trackColor={{ false: C.border, true: `${C.primary}80` }}
                            thumbColor={isDarkMode ? C.primary : C.mutedForeground}
                            ios_backgroundColor={C.border}
                        />
                        <Text style={{ fontSize: 16, color: C.foreground, fontWeight: '500' }}>الوضع الليلي</Text>
                    </View>
                </View>
            </View>
        </View>
    );
}
