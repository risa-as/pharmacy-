import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { apiService } from '../services/api';
import { Radius } from '../constants/colors';
import { usePalette, AppButton } from './ui/Kit';
import { formatIQD, initials } from '../utils/format';
import type { CheckoutPatient } from '../context/CheckoutContext';

/**
 * Customer picker for the sale flow. Uses the same patient records as the
 * patients screen (navigation-map §8) and hands the selection back to the cart.
 */
export function PatientPickerModal({ visible, onClose, onSelect }: {
    visible: boolean;
    onClose: () => void;
    onSelect: (p: CheckoutPatient) => void;
}) {
    const C = usePalette();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<CheckoutPatient[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!visible) { setQuery(''); setResults([]); }
    }, [visible]);

    useEffect(() => {
        if (query.trim().length < 2) { setResults([]); return; }
        let active = true;
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await apiService.searchPatients(query.trim());
                if (active) setResults(res ?? []);
            } finally {
                if (active) setSearching(false);
            }
        }, 300);
        return () => { active = false; clearTimeout(timer); };
    }, [query]);

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
                    <View style={{
                        backgroundColor: C.card, borderTopLeftRadius: Radius.card, borderTopRightRadius: Radius.card,
                        padding: 18, maxHeight: '78%', gap: 12,
                    }}>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '800' }}>اختيار عميل</Text>
                            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="إغلاق">
                                <Ionicons name="close" size={24} color={C.mutedForeground} />
                            </TouchableOpacity>
                        </View>

                        <View style={{
                            flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
                            borderWidth: 1, borderColor: C.border, borderRadius: Radius.control, paddingHorizontal: 12,
                        }}>
                            <Ionicons name="search-outline" size={18} color={C.mutedForeground} />
                            <TextInput
                                value={query}
                                onChangeText={setQuery}
                                placeholder="ابحث بالاسم أو رقم الهاتف"
                                placeholderTextColor={C.mutedForeground}
                                autoFocus
                                style={{ flex: 1, color: C.foreground, paddingVertical: 12, textAlign: 'right', fontSize: 15 }}
                            />
                            {searching && <ActivityIndicator size="small" color={C.primary} />}
                        </View>

                        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
                            {query.trim().length >= 2 && !searching && results.length === 0 && (
                                <Text style={{ color: C.mutedForeground, textAlign: 'center', paddingVertical: 20 }}>لا توجد نتائج مطابقة</Text>
                            )}
                            {results.map((p, i) => (
                                <TouchableOpacity
                                    key={p.id}
                                    onPress={() => { onSelect(p); onClose(); }}
                                    activeOpacity={0.75}
                                    style={{
                                        flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 12,
                                        borderBottomWidth: i < results.length - 1 ? 1 : 0, borderBottomColor: C.border,
                                    }}
                                >
                                    <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: C.primary, fontWeight: '800' }}>{initials(p.name)}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '700', textAlign: 'right' }}>{p.name}</Text>
                                        {p.phone ? <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }}>{p.phone}</Text> : null}
                                    </View>
                                    {p.balance != null && p.balance > 0 && (
                                        <View style={{ backgroundColor: C.warningBg, borderRadius: Radius.badge, paddingHorizontal: 8, paddingVertical: 3 }}>
                                            <Text style={{ color: C.warning, fontSize: 12, fontWeight: '700' }}>{formatIQD(p.balance)}</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <AppButton
                            label="إضافة مريض جديد"
                            icon="person-add-outline"
                            variant="outline"
                            onPress={() => { onClose(); router.push({ pathname: '/crm/add', params: { forSale: '1' } }); }}
                        />
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

export default PatientPickerModal;
