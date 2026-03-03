import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authService, User } from '../../services/auth';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

export default function AccountScreen() {
    const [user, setUser] = useState<User | null>(null);
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    useEffect(() => {
        authService.getCurrentUser().then(setUser);
    }, []);

    const rows = [
        { label: 'الاسم',           value: user?.name  || '-' },
        { label: 'البريد الإلكتروني', value: user?.email || '-' },
        { label: 'الدور',            value: user?.role  || '-' },
        { label: 'المعرف',           value: user?.id    || '-' },
    ];

    return (
        <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            {/* Avatar */}
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
                <View style={{
                    width: 96, height: 96, borderRadius: 48,
                    backgroundColor: C.primaryMuted,
                    justifyContent: 'center', alignItems: 'center',
                }}>
                    <Ionicons name="person" size={48} color={C.primary} />
                </View>
            </View>

            {/* Info Card */}
            <View style={{
                backgroundColor: C.card,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: C.border,
                overflow: 'hidden',
            }}>
                {rows.map((row, i) => (
                    <View key={row.label}>
                        <View style={{ paddingVertical: 14, paddingHorizontal: 16 }}>
                            <Text style={{ fontSize: 13, color: C.mutedForeground, textAlign: 'right', marginBottom: 4 }}>
                                {row.label}
                            </Text>
                            <Text style={{ fontSize: 16, color: C.foreground, fontWeight: '600', textAlign: 'right' }}>
                                {row.value}
                            </Text>
                        </View>
                        {i < rows.length - 1 && <View style={{ height: 1, backgroundColor: C.border }} />}
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}
