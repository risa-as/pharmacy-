import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, TextInput,
    ActivityIndicator, Alert, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
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

function urgency(balance: number) {
    if (balance > 50000) return 'danger';
    if (balance > 20000) return 'warning';
    return 'info';
}

function getInitials(name: string) {
    return name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function DebtsScreen() {
    const { isDarkMode } = useTheme();
    const { branchId } = useAuth();
    const { triggerSync } = useSyncStatus();
    const C = Colors(isDarkMode);

    const [debtors, setDebtors]     = useState<Debtor[]>([]);
    const [filtered, setFiltered]   = useState<Debtor[]>([]);
    const [loading, setLoading]     = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch]       = useState('');

    const [payingId, setPayingId]   = useState<string | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payNote, setPayNote]     = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchDebtors = useCallback(async () => {
        try {
            const data = await apiService.getDebts(branchId ?? undefined);
            setDebtors(Array.isArray(data) ? data : []);
        } catch {
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
        setFiltered(debtors.filter(d =>
            d.name.toLowerCase().includes(q) || d.phone.includes(q)
        ));
    }, [search, debtors]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        triggerSync('debts');
        fetchDebtors();
    }, [fetchDebtors, triggerSync]);

    const handlePay = useCallback(async (id: string) => {
        const amount = parseFloat(payAmount.replace(/[^0-9.]/g, ''));
        if (isNaN(amount) || amount <= 0) {
            Alert.alert('تنبيه', 'يرجى إدخال مبلغ صحيح');
            return;
        }
        setSubmitting(true);
        try {
            await apiService.payDebt(id, amount, payNote);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('تم بنجاح', 'تم تسجيل الدفعة بنجاح');
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

    const accentColor = (balance: number) => {
        const u = urgency(balance);
        return u === 'danger' ? C.danger : u === 'warning' ? C.warning : C.info;
    };
    const accentBg = (balance: number) => {
        const u = urgency(balance);
        return u === 'danger' ? C.dangerBg : u === 'warning' ? C.warningBg : C.infoBg;
    };
    const avatarColor = (balance: number) => accentColor(balance);
    const avatarBg    = (balance: number) => accentBg(balance);

    const renderDebtor = ({ item }: { item: Debtor }) => {
        const isPaying = payingId === item.id;
        const color    = accentColor(item.balance);
        const bg       = accentBg(item.balance);
        const initials = getInitials(item.name);

        return (
            <View style={{
                backgroundColor: C.card, borderRadius: 5,
                borderWidth: 1, borderColor: C.border,
                marginBottom: 12, overflow: 'hidden',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: isDarkMode ? 0.2 : 0.05,
                shadowRadius: 4, elevation: 2,
            }}>
                {/* Accent bar */}
                <View style={{ height: 3, backgroundColor: color }} />

                <View style={{ padding: 14 }}>
                    {/* Top row: avatar + info + balance */}
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        {/* Avatar */}
                        <View style={{
                            width: 44, height: 44, borderRadius: 5,
                            backgroundColor: bg,
                            justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                        }}>
                            <Text style={{ color, fontSize: 16, fontWeight: '900' }}>{initials}</Text>
                        </View>

                        {/* Name + phone */}
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 15, textAlign: 'right' }}>
                                {item.name}
                            </Text>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 3 }}>
                                <Ionicons name="call-outline" size={12} color={C.mutedForeground} />
                                <Text style={{ color: C.mutedForeground, fontSize: 12 }}>{item.phone}</Text>
                            </View>
                        </View>

                        {/* Balance */}
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ color, fontSize: 18, fontWeight: '900' }}>
                                {item.balance.toLocaleString('en-US')}
                            </Text>
                            <Text style={{ color: C.mutedForeground, fontSize: 10 }}>د.ع</Text>
                        </View>
                    </View>

                    {/* Meta row: date + urgency badge */}
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="time-outline" size={11} color={C.mutedForeground} />
                            <Text style={{ color: C.mutedForeground, fontSize: 11 }}>
                                {formatDate(item.updatedAt, { day: 'numeric', month: 'short' })}
                            </Text>
                        </View>
                        <View style={{ backgroundColor: bg, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ color, fontSize: 10, fontWeight: '700' }}>
                                {urgency(item.balance) === 'danger' ? 'مرتفع' : urgency(item.balance) === 'warning' ? 'متوسط' : 'منخفض'}
                            </Text>
                        </View>
                    </View>

                    {/* Pay form / button */}
                    {!isPaying ? (
                        <TouchableOpacity
                            onPress={() => { setPayingId(item.id); setPayAmount(''); setPayNote(''); }}
                            activeOpacity={0.8}
                            style={{
                                flexDirection: 'row-reverse', justifyContent: 'center',
                                alignItems: 'center', gap: 6,
                                backgroundColor: C.primary, borderRadius: 5,
                                paddingVertical: 11,
                            }}
                        >
                            <Ionicons name="checkmark-circle-outline" size={17} color="#fff" />
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>تسجيل دفعة</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={{
                            backgroundColor: C.primaryMuted, borderRadius: 5,
                            padding: 12, gap: 10,
                        }}>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <Ionicons name="wallet-outline" size={15} color={C.primary} />
                                <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>
                                    تسجيل دفعة · الرصيد {item.balance.toLocaleString('en-US')} د.ع
                                </Text>
                            </View>

                            <TextInput
                                style={{
                                    backgroundColor: C.card, borderRadius: 5,
                                    borderWidth: 1.5, borderColor: C.primary,
                                    paddingHorizontal: 12, paddingVertical: 10,
                                    color: C.foreground, textAlign: 'right', fontSize: 16,
                                    fontWeight: '700',
                                }}
                                placeholder="المبلغ (د.ع)"
                                placeholderTextColor={C.mutedForeground}
                                keyboardType="numeric"
                                value={payAmount}
                                onChangeText={setPayAmount}
                                autoFocus
                            />
                            <TextInput
                                style={{
                                    backgroundColor: C.card, borderRadius: 5,
                                    borderWidth: 1, borderColor: C.border,
                                    paddingHorizontal: 12, paddingVertical: 10,
                                    color: C.foreground, textAlign: 'right', fontSize: 14,
                                }}
                                placeholder="ملاحظة (اختياري)"
                                placeholderTextColor={C.mutedForeground}
                                value={payNote}
                                onChangeText={setPayNote}
                            />

                            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                                <TouchableOpacity
                                    onPress={() => handlePay(item.id)}
                                    disabled={submitting}
                                    activeOpacity={0.8}
                                    style={{
                                        flex: 1, flexDirection: 'row-reverse',
                                        justifyContent: 'center', alignItems: 'center', gap: 6,
                                        backgroundColor: C.primary, borderRadius: 5,
                                        paddingVertical: 11, opacity: submitting ? 0.7 : 1,
                                    }}
                                >
                                    {submitting
                                        ? <ActivityIndicator size="small" color="#fff" />
                                        : <Ionicons name="checkmark-outline" size={17} color="#fff" />
                                    }
                                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                                        {submitting ? 'جاري...' : 'تأكيد'}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => setPayingId(null)}
                                    activeOpacity={0.75}
                                    style={{
                                        flex: 1, flexDirection: 'row-reverse',
                                        justifyContent: 'center', alignItems: 'center', gap: 6,
                                        backgroundColor: C.card, borderRadius: 5,
                                        paddingVertical: 11,
                                        borderWidth: 1, borderColor: C.border,
                                    }}
                                >
                                    <Ionicons name="close-outline" size={17} color={C.mutedForeground} />
                                    <Text style={{ color: C.foreground, fontWeight: '600', fontSize: 14 }}>إلغاء</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: C.background }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* ── Pinned header ─────────────────────────────────────────────── */}
            <View style={{
                backgroundColor: C.background,
                paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
                borderBottomWidth: 1, borderBottomColor: C.border,
            }}>
                {/* Summary card */}
                {!loading && debtors.length > 0 && (
                    <View style={{
                        flexDirection: 'row-reverse', alignItems: 'center',
                        backgroundColor: C.card, borderRadius: 5,
                        borderWidth: 1, borderColor: C.border,
                        padding: 14, marginBottom: 12, gap: 12,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
                    }}>
                        <View style={{
                            width: 44, height: 44, borderRadius: 5,
                            backgroundColor: C.dangerBg,
                            justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                        }}>
                            <Ionicons name="book-outline" size={21} color={C.danger} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginBottom: 2 }}>
                                إجمالي الديون المستحقة
                            </Text>
                            <Text style={{ color: C.danger, fontWeight: '900', fontSize: 20, textAlign: 'right' }}>
                                {totalDebt.toLocaleString('en-US')} <Text style={{ fontSize: 13, fontWeight: '600' }}>د.ع</Text>
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900' }}>
                                {debtors.length}
                            </Text>
                            <Text style={{ color: C.mutedForeground, fontSize: 10 }}>مدين</Text>
                        </View>
                    </View>
                )}

                {/* Search */}
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center',
                    backgroundColor: C.input, borderRadius: 5,
                    borderWidth: 1, borderColor: C.border,
                    paddingHorizontal: 12, gap: 8,
                }}>
                    <Ionicons name="search-outline" size={17} color={C.mutedForeground} />
                    <TextInput
                        style={{ flex: 1, color: C.foreground, paddingVertical: 11, textAlign: 'right', fontSize: 14 }}
                        placeholder="بحث بالاسم أو الهاتف..."
                        placeholderTextColor={C.mutedForeground}
                        value={search}
                        onChangeText={setSearch}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="close-circle" size={17} color={C.mutedForeground} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* ── List ─────────────────────────────────────────────────────── */}
            {loading && !refreshing ? (
                <View style={{ padding: 16, gap: 12 }}>
                    <Skeleton height={70} radius={5} />
                    {[1, 2, 3].map(i => <Skeleton key={i} height={160} radius={5} />)}
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={item => item.id}
                    renderItem={renderDebtor}
                    contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
                    }
                    ListEmptyComponent={
                        <EmptyState
                            icon="book-outline"
                            title="لا توجد ديون"
                            subtitle={search ? 'لا توجد نتائج للبحث' : 'جميع الحسابات مُسوَّاة'}
                        />
                    }
                />
            )}
        </KeyboardAvoidingView>
    );
}
