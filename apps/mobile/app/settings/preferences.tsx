import React, { useState, useEffect } from 'react';
import { View, Text, Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

export default function PreferencesScreen() {
    const [notifications, setNotifications] = useState(true);
    const { isDarkMode, toggleTheme } = useTheme();
    const C = Colors(isDarkMode);

    useEffect(() => { loadSettings(); }, []);

    const loadSettings = async () => {
        try {
            const saved = await AsyncStorage.getItem('settings_notifications');
            if (saved !== null) setNotifications(JSON.parse(saved));
        } catch {
            // defaults
        }
    };

    const toggleNotifications = async (value: boolean) => {
        setNotifications(value);
        await AsyncStorage.setItem('settings_notifications', JSON.stringify(value));
    };

    const renderRow = (label: string, value: boolean, onToggle: (v: boolean) => void) => (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Switch
                value={value}
                onValueChange={onToggle}
                trackColor={{ false: C.border, true: `${C.primary}80` }}
                thumbColor={value ? C.primary : C.mutedForeground}
                ios_backgroundColor={C.border}
            />
            <Text style={{ fontSize: 16, color: C.foreground, fontWeight: '500' }}>{label}</Text>
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <View style={{ padding: 20 }}>
                <View style={{
                    marginBottom: 24, backgroundColor: C.card,
                    borderRadius: 12, padding: 16,
                    borderWidth: 1, borderColor: C.border,
                }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.mutedForeground, marginBottom: 16, textAlign: 'right' }}>
                        الإشعارات
                    </Text>
                    {renderRow('تفعيل الإشعارات', notifications, toggleNotifications)}
                </View>

                <View style={{
                    backgroundColor: C.card,
                    borderRadius: 12, padding: 16,
                    borderWidth: 1, borderColor: C.border,
                }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.mutedForeground, marginBottom: 16, textAlign: 'right' }}>
                        المظهر
                    </Text>
                    {renderRow('الوضع الليلي', isDarkMode, toggleTheme)}
                </View>
            </View>
        </View>
    );
}
