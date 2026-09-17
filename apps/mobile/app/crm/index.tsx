import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, Href } from 'expo-router';
import { crmService, Patient } from '../../services/crm';
import { Radius } from '../../constants/colors';
import { Skeleton } from '../../components/ui/Skeleton';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { usePalette, Surface, SectionTitle, AppButton, InfoNote, StateBlock } from '../../components/ui/Kit';
import { formatNumber, initials } from '../../utils/format';

/** Arabic count for the list header, as in the design: «مريضين (2)». */
function patientsLabel(count: number): string {
    const word = count === 1 ? 'مريض' : count === 2 ? 'مريضين' : count <= 10 ? 'مرضى' : 'مريضاً';
    return `${word} (${formatNumber(count)})`;
}

/** Patients list (design patients.png): name, phone, initials — no photos. */
export default function PatientsListScreen() {
    const C = usePalette();
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchRef = useRef('');

    const fetchPatients = useCallback(async (query = '') => {
        try {
            const data = await crmService.getPatients(query);
            setPatients(Array.isArray(data) ? data : []);
            setFailed(false);
        } catch (error) {
            console.error(error);
            setFailed(true);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Refresh when returning from «إضافة مريض».
    useFocusEffect(useCallback(() => { fetchPatients(searchRef.current); }, [fetchPatients]));
    useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

    const handleSearch = (text: string) => {
        setSearch(text);
        searchRef.current = text;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchPatients(text.trim()), 400);
    };

    const renderItem = ({ item }: { item: Patient }) => (
        <Surface style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 10, paddingVertical: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.primary, fontSize: 15, fontWeight: '800' }}>{initials(item.name)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right' }} numberOfLines={1}>{item.name}</Text>
                <Text style={{ color: C.mutedForeground, fontSize: 13.5, textAlign: 'right', marginTop: 2, writingDirection: 'ltr' }} numberOfLines={1}>{item.phone}</Text>
            </View>
            {/* Divider before the action, as in the design. */}
            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border }} />
            <AppButton label="فتح الملف" icon="document-text-outline" variant="outline" compact onPress={() => router.push(`/crm/${item.id}` as Href)} />
        </Surface>
    );

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <ScreenHeader title="المرضى" subtitle="ملفات العملاء ومشترياتهم" fallbackHref="/(tabs)/more" />

            <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 6 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: Radius.control, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 }}>
                    <Ionicons name="search-outline" size={20} color={C.mutedForeground} />
                    <TextInput
                        style={{ flex: 1, paddingVertical: 12, fontSize: 15, textAlign: 'right', color: C.foreground }}
                        placeholder="ابحث باسم المريض أو الهاتف"
                        placeholderTextColor={C.mutedForeground}
                        value={search}
                        onChangeText={handleSearch}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => handleSearch('')} hitSlop={8} accessibilityLabel="مسح البحث">
                            <Ionicons name="close-circle" size={18} color={C.mutedForeground} />
                        </TouchableOpacity>
                    )}
                </View>
                <AppButton label="إضافة مريض" icon="add" onPress={() => router.push('/crm/add' as Href)} style={{ paddingVertical: 11 }} />
            </View>

            {loading ? (
                <View style={{ padding: 16, gap: 10 }}>
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} height={76} radius={Radius.card} />)}
                </View>
            ) : failed ? (
                <StateBlock icon="cloud-offline-outline" title="تعذّر تحميل المرضى" message="تحقق من الاتصال ثم أعد المحاولة." actionLabel="إعادة المحاولة" onAction={() => { setLoading(true); fetchPatients(searchRef.current); }} />
            ) : (
                <FlatList
                    data={patients}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ flexGrow: patients.length === 0 ? 1 : 0, padding: 16, paddingTop: 10, paddingBottom: 32 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPatients(searchRef.current); }} tintColor={C.primary} />}
                    ListHeaderComponent={patients.length > 0 ? <SectionTitle title="المرضى والعملاء" trailing={patientsLabel(patients.length)} /> : null}
                    ListFooterComponent={patients.length > 0 ? <InfoNote style={{ marginTop: 6 }} text="المعلومات الصحية المسجلة وسجل المشتريات داخل ملف المريض." /> : null}
                    ListEmptyComponent={
                        <StateBlock
                            icon={search ? 'search-outline' : 'people-outline'}
                            title={search ? 'لا توجد نتائج' : 'لا يوجد مرضى بعد'}
                            message={search ? `لا يوجد مريض يطابق "${search}"` : 'أضف أول مريض لربط المبيعات والمعلومات الصحية المسجلة.'}
                        />
                    }
                />
            )}
        </View>
    );
}
