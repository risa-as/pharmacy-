import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { crmService, Patient } from '../../services/crm';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

export default function CRMListScreen() {
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { fetchPatients(); }, []);

    const fetchPatients = async (query = '') => {
        setLoading(true);
        try {
            const data = await crmService.getPatients(query);
            setPatients(data);
        } catch (error) {
            console.error(error);
            Alert.alert('خطأ', 'تعذّر تحميل قائمة المرضى. تحقق من الاتصال وحاول مجدداً.');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (text: string) => {
        setSearch(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchPatients(text), 400);
    };

    const renderItem = ({ item }: { item: Patient }) => (
        <TouchableOpacity
            style={{
                flexDirection: 'row-reverse',
                alignItems: 'center',
                backgroundColor: C.card,
                padding: 16,
                borderRadius: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: C.border,
            }}
            onPress={() => router.push(`/crm/${item.id}` as any)}
            activeOpacity={0.7}
        >
            <View style={{
                width: 48, height: 48, borderRadius: 24,
                backgroundColor: C.primaryMuted,
                justifyContent: 'center', alignItems: 'center',
                marginLeft: 12,
            }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: C.primary }}>
                    {item.name.charAt(0)}
                </Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: C.foreground, textAlign: 'right' }}>
                    {item.name}
                </Text>
                <Text style={{ fontSize: 14, color: C.mutedForeground, textAlign: 'right', marginTop: 2 }}>
                    {item.phone}
                </Text>
            </View>
            <Ionicons name="chevron-back" size={20} color={C.mutedForeground} />
        </TouchableOpacity>
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
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: C.foreground }}>المرضى والعملاء</Text>
                <TouchableOpacity onPress={() => router.push('/crm/add' as any)} style={{ padding: 8 }}>
                    <Ionicons name="add" size={24} color={C.primary} />
                </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={{
                flexDirection: 'row-reverse', alignItems: 'center',
                backgroundColor: C.card, margin: 16,
                paddingHorizontal: 12, borderRadius: 12,
                borderWidth: 1, borderColor: C.border,
            }}>
                <Ionicons name="search" size={20} color={C.mutedForeground} style={{ marginLeft: 8 }} />
                <TextInput
                    style={{ flex: 1, paddingVertical: 12, fontSize: 16, textAlign: 'right', color: C.foreground }}
                    placeholder="بحث بالاسم أو الهاتف..."
                    placeholderTextColor={C.mutedForeground}
                    value={search}
                    onChangeText={handleSearch}
                />
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 20 }} />
            ) : (
                <FlatList
                    data={patients}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ padding: 16, paddingTop: 0 }}
                    ListEmptyComponent={
                        <View style={{ alignItems: 'center', marginTop: 40 }}>
                            <Text style={{ color: C.mutedForeground }}>لا يوجد مرضى</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}
