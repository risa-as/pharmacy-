import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, TextInput,
    ActivityIndicator, Alert, Modal, RefreshControl, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useSyncStatus } from '../../context/SyncContext';
import { formatDate } from '../../utils/date';

interface Debtor {
    id: string;
    name: string;
    phone: string;
    balance: number;
    updatedAt: string;
}

export default function DebtsScreen() {
    const { isDarkMode } = useTheme();
    const { branchId, isAdmin } = useAuth();
    const { triggerSync } = useSyncStatus();
    const C = Colors(isDarkMode);

    const [debtors, setDebtors] = useState<Debtor[]>([]);
    const [filtered, setFiltered] = useState<Debtor[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');

    // Inline payment form state
    const [payingId, setPayingId] = useState<string | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payNote, setPayNote] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchDebtors = useCallback(async () => {
        try {
            const data = await apiService.getDebts(branchId ?? undefined);
            setDebtors(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('DebtsScreen: fetch error', error);
            Alert.alert('خطأ', 'فشل تحميل قائمة الديون');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [branchId]);

    useEffect(() => { fetchDebtors(); }, [fetchDebtors]);

    useEffect(() => {
        if (!search.trim()) { setFiltered(debtors); return; }
        const q = search.toLowerCase();
        setFiltered(debtors.filter(d => d.name.toLowerCase().includes(q) || d.phone.includes(q)));
    }, [search, debtors]);

    const onRefresh = useCallback(() => { setRefreshing(true); triggerSync('debts'); fetchDebtors(); }, [fetchDebtors, triggerSync]);

    const handlePay = useCallback(async (id: string) => {
        const amount = parseFloat(payAmount.replace(/[^0-9.]/g, ''));
        if (isNaN(amount) || amount <= 0) { Alert.alert('تنبيه', 'يرجى إدخال مبلغ صحيح'); return; }
        setSubmitting(true);
        try {
            await apiService.payDebt(id, amount, payNote);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('نجاح', 'تم تسجيل الدفعة بنجاح');
            setPayingId(null); setPayAmount(''); setPayNote('');
            fetchDebtors();
        } catch {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('خطأ', 'فشل تسجيل الدفعة');
        } finally {
            setSubmitting(false);
        }
    }, [payAmount, payNote, fetchDebtors]);

    const totalDebt = debtors.reduce((s, d) => s + d.balance, 0);

    const renderDebtor = ({ item }: { item: Debtor }) => {
        const isPaying = payingId === item.id;
        const balanceVariant = item.balance > 50000 ? 'danger' : item.balance > 20000 ? 'warning' : 'info';

        return (
            <Card className="mb-3">
                {/* Patient header */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 15, textAlign: 'right' }}>{item.name}</Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }}>{item.phone}</Text>
                    </View>
                    <Badge label={`${item.balance.toLocaleString()} د.ع`} variant={balanceVariant} />
                </View>

                <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginBottom: 10 }}>
                    آخر تحديث: {formatDate(item.updatedAt, { day: 'numeric', month: 'short' })}
                </Text>

                {/* Pay Now button or inline form */}
                {!isPaying ? (
                    <Button
                        label="دفع الآن"
                        variant="primary"
                        onPress={() => { setPayingId(item.id); setPayAmount(''); setPayNote(''); }}
                    />
                ) : (
                    <View style={{ backgroundColor: C.primaryMuted, borderRadius: 6, padding: 12, gap: 10 }}>
                        <Text style={{ color: C.primary, fontWeight: '700', textAlign: 'right', marginBottom: 2 }}>
                            تسجيل دفعة
                        </Text>
                        <TextInput
                            style={{ backgroundColor: C.card, borderRadius: 6, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 9, color: C.foreground, textAlign: 'right', fontSize: 15 }}
                            placeholder={`الرصيد: ${item.balance.toLocaleString()} د.ع`}
                            placeholderTextColor={C.mutedForeground}
                            keyboardType="numeric"
                            value={payAmount}
                            onChangeText={setPayAmount}
                            autoFocus
                        />
                        <TextInput
                            style={{ backgroundColor: C.card, borderRadius: 6, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 9, color: C.foreground, textAlign: 'right', fontSize: 14 }}
                            placeholder="ملاحظة (اختياري)"
                            placeholderTextColor={C.mutedForeground}
                            value={payNote}
                            onChangeText={setPayNote}
                        />
                        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                            <Button label="تأكيد" loading={submitting} onPress={() => handlePay(item.id)} className="flex-1" />
                            <Button label="إلغاء" variant="ghost" onPress={() => setPayingId(null)} className="flex-1" />
                        </View>
                    </View>
                )}
            </Card>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {/* Pinned search bar */}
            <View style={{ backgroundColor: C.background, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
                {/* Total summary */}
                {!loading && debtors.length > 0 && (
                    <Card className="mb-3 flex-row-reverse items-center justify-between">
                        <View>
                            <Text style={{ color: C.mutedForeground, fontSize: 12 }}>إجمالي الديون المستحقة</Text>
                            <Text style={{ color: C.danger, fontWeight: '900', fontSize: 20, marginTop: 2 }}>
                                {totalDebt.toLocaleString()} د.ع
                            </Text>
                        </View>
                        <View style={{ backgroundColor: C.dangerBg, borderRadius: 6, padding: 10 }}>
                            <Ionicons name="book" size={22} color={C.danger} />
                        </View>
                    </Card>
                )}

                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.input, borderRadius: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, gap: 8 }}>
                    <Ionicons name="search" size={18} color={C.mutedForeground} />
                    <TextInput
                        style={{ flex: 1, color: C.foreground, paddingVertical: 10, textAlign: 'right', fontSize: 14 }}
                        placeholder="بحث بالاسم أو الهاتف..."
                        placeholderTextColor={C.mutedForeground}
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>
            </View>

            {loading && !refreshing ? (
                <View style={{ padding: 16, gap: 12 }}>
                    <Skeleton height={70} radius={8} />
                    {[1, 2, 3].map(i => (
                        <Skeleton key={i} height={110} radius={8} />
                    ))}
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={item => item.id}
                    renderItem={renderDebtor}
                    contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 110 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                    ListEmptyComponent={
                        <EmptyState
                            icon="book-outline"
                            title="لا توجد ديون"
                            subtitle={search ? 'لا توجد نتائج للبحث' : 'جميع الحسابات مُسوَّاة'}
                        />
                    }
                />
            )}
        </View>
    );
}
