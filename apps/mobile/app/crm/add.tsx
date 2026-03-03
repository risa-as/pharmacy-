import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { crmService } from '../../services/crm';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

export default function CRMAddScreen() {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    const handleSave = async () => {
        if (!name || !phone) {
            Alert.alert('خطأ', 'الاسم ورقم الهاتف مطلوبان');
            return;
        }
        setLoading(true);
        try {
            await crmService.createPatient({ name, phone, notes });
            Alert.alert('نجاح', 'تم إضافة المريض بنجاح', [
                { text: 'حسناً', onPress: () => router.back() },
            ]);
        } catch (error: any) {
            Alert.alert('خطأ', error.message);
        } finally {
            setLoading(false);
        }
    };

    const inputStyle = {
        backgroundColor: C.input,
        borderRadius: 12,
        padding: 14,
        fontSize: 16,
        color: C.foreground,
        borderWidth: 1,
        borderColor: C.border,
        textAlign: 'right' as const,
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {/* Header */}
            <View style={{
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                padding: 16, paddingTop: 50,
                backgroundColor: C.card,
                borderBottomWidth: 1, borderBottomColor: C.border,
            }}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
                    <Ionicons name="arrow-back" size={24} color={C.foreground} />
                </TouchableOpacity>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: C.foreground }}>إضافة مريض جديد</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
                <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontSize: 14, color: C.mutedForeground, marginBottom: 8, textAlign: 'right', fontWeight: '600' }}>
                        الاسم الكامل *
                    </Text>
                    <TextInput
                        style={inputStyle}
                        value={name}
                        onChangeText={setName}
                        placeholder="أدخل اسم المريض"
                        placeholderTextColor={C.mutedForeground}
                    />
                </View>

                <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontSize: 14, color: C.mutedForeground, marginBottom: 8, textAlign: 'right', fontWeight: '600' }}>
                        رقم الهاتف *
                    </Text>
                    <TextInput
                        style={inputStyle}
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                        placeholder="07xxxxxxxxx"
                        placeholderTextColor={C.mutedForeground}
                    />
                </View>

                <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontSize: 14, color: C.mutedForeground, marginBottom: 8, textAlign: 'right', fontWeight: '600' }}>
                        ملاحظات
                    </Text>
                    <TextInput
                        style={[inputStyle, { height: 100, textAlignVertical: 'top' }]}
                        value={notes}
                        onChangeText={setNotes}
                        multiline
                        placeholder="أي ملاحظات إضافية..."
                        placeholderTextColor={C.mutedForeground}
                    />
                </View>

                <TouchableOpacity
                    style={{
                        backgroundColor: loading ? C.primarySoft : C.primary,
                        padding: 16, borderRadius: 12, alignItems: 'center',
                        marginTop: 8, opacity: loading ? 0.7 : 1,
                    }}
                    onPress={handleSave}
                    disabled={loading}
                    activeOpacity={0.8}
                >
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                        {loading ? 'جاري الحفظ...' : 'حفظ'}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}
