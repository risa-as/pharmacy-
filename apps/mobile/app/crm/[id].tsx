import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { crmService, Patient } from '../../services/crm';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';
import { formatDate } from '../../utils/date';

export default function CRMDetailScreen() {
    const { id } = useLocalSearchParams();
    const [patient, setPatient] = useState<Patient | null>(null);
    const [loading, setLoading] = useState(true);
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    useEffect(() => { if (id) fetchPatient(); }, [id]);

    const fetchPatient = async () => {
        try {
            const data = await crmService.getPatient(id as string);
            setPatient(data);
        } catch (error) {
            console.error(error);
            Alert.alert('خطأ', 'تعذّر تحميل بيانات المريض. تحقق من الاتصال وحاول مجدداً.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background }}>
            <ActivityIndicator size="large" color={C.primary} />
        </View>
    );

    if (!patient) return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background }}>
            <Text style={{ color: C.mutedForeground }}>لم يتم العثور على المريض</Text>
        </View>
    );

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
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: C.foreground }}>ملف المريض</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
                {/* Profile Card */}
                <View style={{
                    alignItems: 'center',
                    backgroundColor: C.card,
                    padding: 24, borderRadius: 16,
                    marginBottom: 20,
                    borderWidth: 1, borderColor: C.border,
                }}>
                    <View style={{
                        width: 80, height: 80, borderRadius: 40,
                        backgroundColor: C.primaryMuted,
                        justifyContent: 'center', alignItems: 'center',
                        marginBottom: 12,
                    }}>
                        <Text style={{ fontSize: 32, fontWeight: 'bold', color: C.primary }}>
                            {patient.name.charAt(0)}
                        </Text>
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', color: C.foreground, marginBottom: 4 }}>
                        {patient.name}
                    </Text>
                    <Text style={{ fontSize: 16, color: C.mutedForeground }}>{patient.phone}</Text>
                </View>

                {/* Notes Section */}
                <View style={{
                    backgroundColor: C.card,
                    borderRadius: 16, padding: 16,
                    marginBottom: 20,
                    borderWidth: 1, borderColor: C.border,
                }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.foreground, marginBottom: 12, textAlign: 'right' }}>
                        معلومات عامة
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: C.foreground, maxWidth: '70%', textAlign: 'left' }}>
                            {patient.notes || 'لا توجد ملاحظات'}
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontWeight: '500' }}>ملاحظات</Text>
                    </View>
                </View>

                {/* Sales Section */}
                <View style={{
                    backgroundColor: C.card,
                    borderRadius: 16, padding: 16,
                    marginBottom: 20,
                    borderWidth: 1, borderColor: C.border,
                }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.foreground, marginBottom: 12, textAlign: 'right' }}>
                        آخر المشتريات
                    </Text>
                    {patient.sales && patient.sales.length > 0 ? (
                        patient.sales.map((sale: any) => (
                            <View key={sale.id} style={{
                                flexDirection: 'row-reverse',
                                justifyContent: 'space-between',
                                paddingVertical: 12,
                                borderBottomWidth: 1,
                                borderBottomColor: C.border,
                            }}>
                                <Text style={{ fontWeight: 'bold', color: C.success }}>
                                    {sale.total.toFixed(2)} د.ع
                                </Text>
                                <Text style={{ color: C.mutedForeground }}>
                                    {formatDate(sale.createdAt)}
                                </Text>
                            </View>
                        ))
                    ) : (
                        <Text style={{ textAlign: 'center', color: C.mutedForeground, padding: 10 }}>
                            لا توجد مشتريات سابقة
                        </Text>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}
