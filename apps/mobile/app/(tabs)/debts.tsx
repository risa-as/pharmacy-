import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, TextInput,
    ActivityIndicator, Alert, RefreshControl, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { managerPalette, Radius } from '../../constants/colors';
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

type Urgency = 'danger' | 'warning' | 'low';
function urgency(balance: number): Urgency {
    if (balance > 50000) return 'danger';
    if (balance > 20000) return 'warning';
    return 'low';
}

function getInitials(name: string) {
    return name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function DebtsScreen() {
    const { isDarkMode } = useTheme();
    const { branchId } = useAuth();
    const { triggerSync } = useSyncStatus();
    const C = managerPalette(isDarkMode);

    // Outlined card matching the system identity — light surface, soft tinted border.
    const card = (accent: string) => ({
        backgroundColor: C.card,
        borderRadius: Radius.sm,
        borderWidth: 1.5,
        borderColor: `${accent}33`,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 } as const,
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
    });

    const [debtors, setDebtors]     = useState<Debtor[]>([]);
    const [filtered, setFiltered]   = useState<Debtor[]>([]);
    const [loading, setLoading]     = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch]       = useState('');

    const [payingId, setPayingId]   = useState<string | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payNote, setPayNote]     = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [paidAmount, setPaidAmount] = useState<number | null>(null);

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
            setPayingId(null); setPayAmount(''); setPayNote('');
            setPaidAmount(amount);
            fetchDebtors();
        } catch {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('خطأ', 'فشل تسجيل الدفعة');
        } finally {
            setSubmitting(false);
        }
    }, [payAmount, payNote, fetchDebtors]);

    const totalDebt = debtors.reduce((s, d) => s + d.balance, 0);
    const highCount = debtors.filter(d => urgency(d.balance) === 'danger').length;
    const medCount  = debtors.filter(d => urgency(d.balance) === 'warning').length;
    const lowCount  = debtors.filter(d => urgency(d.balance) === 'low').length;

    const urgencyColor = (u: Urgency) => u === 'danger' ? C.danger : u === 'warning' ? C.warning : C.primary;
    const urgencyBg    = (u: Urgency) => u === 'danger' ? C.dangerBg : u === 'warning' ? C.warningBg : C.primaryMuted;
    const urgencyLabel = (u: Urgency) => u === 'danger' ? 'مرتفع' : u === 'warning' ? 'متوسط' : 'منخفض';

    const renderDebtor = ({ item }: { item: Debtor }) => {
        const isPaying = payingId === item.id;
        const u        = urgency(item.balance);
        const color    = urgencyColor(u);
        const bg       = urgencyBg(u);
        const initials = getInitials(item.name);

        return (
            <View style={{ ...card(color), marginBottom: 12, padding: 14 }}>
                {/* Top row: avatar + info + balance */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    {/* Avatar */}
                    <View style={{
                        width: 46, height: 46, borderRadius: Radius.xs,
                        backgroundColor: bg,
                        justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                    }}>
                        <Text style={{ color, fontSize: 16, fontWeight: '900' }}>{initials}</Text>
                    </View>

                    {/* Name + phone */}
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15, textAlign: 'right' }} numberOfLines={1}>
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

                {/* Meta row: date + urgency pill */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="time-outline" size={11} color={C.mutedForeground} />
                        <Text style={{ color: C.mutedForeground, fontSize: 11 }}>
                            {formatDate(item.updatedAt, { day: 'numeric', month: 'short' })}
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: bg, borderRadius: Radius.xs, paddingHorizontal: 9, paddingVertical: 4 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
                        <Text style={{ color, fontSize: 10, fontWeight: '800' }}>{urgencyLabel(u)}</Text>
                    </View>
                </View>

                {/* Pay form / button */}
                {!isPaying ? (
                    <TouchableOpacity
                        onPress={() => { setPayingId(item.id); setPayAmount(''); setPayNote(''); }}
                        activeOpacity={0.85}
                        style={{
                            flexDirection: 'row-reverse', justifyContent: 'center',
                            alignItems: 'center', gap: 6,
                            backgroundColor: C.primary, borderRadius: Radius.xs,
                            paddingVertical: 11,
                        }}
                    >
                        <Ionicons name="checkmark-circle-outline" size={17} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>تسجيل دفعة</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={{
                        backgroundColor: C.primaryMuted, borderRadius: Radius.xs,
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
                                backgroundColor: C.card, borderRadius: Radius.xs,
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
                                backgroundColor: C.card, borderRadius: Radius.xs,
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
                                activeOpacity={0.85}
                                style={{
                                    flex: 1, flexDirection: 'row-reverse',
                                    justifyContent: 'center', alignItems: 'center', gap: 6,
                                    backgroundColor: C.primary, borderRadius: Radius.xs,
                                    paddingVertical: 11, opacity: submitting ? 0.7 : 1,
                                }}
                            >
                                {submitting
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <Ionicons name="checkmark-outline" size={17} color="#fff" />
                                }
                                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                                    {submitting ? 'جاري...' : 'تأكيد'}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => setPayingId(null)}
                                activeOpacity={0.75}
                                style={{
                                    flex: 1, flexDirection: 'row-reverse',
                                    justifyContent: 'center', alignItems: 'center', gap: 6,
                                    backgroundColor: C.card, borderRadius: Radius.xs,
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
            }}>
                {/* Hero summary */}
                {!loading && debtors.length > 0 && (
                    <View style={{
                        borderRadius: Radius.sm, marginBottom: 12,
                        shadowColor: C.primary, shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: isDarkMode ? 0.4 : 0.25, shadowRadius: 14, elevation: 6,
                    }}>
                        <View style={{ borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: C.primary, padding: 16 }}>
                            {/* Top: label + debtor count */}
                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                                    <View style={{ width: 30, height: 30, borderRadius: Radius.xs, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                                        <Ionicons name="book-outline" size={16} color="#fff" />
                                    </View>
                                    <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>إجمالي الديون المستحقة</Text>
                                </View>
                                <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.xs, paddingHorizontal: 10, paddingVertical: 4 }}>
                                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{debtors.length} مدين</Text>
                                </View>
                            </View>

                            {/* Total */}
                            <View style={{ alignItems: 'flex-end', marginTop: 12 }}>
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 5 }}>
                                    <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: 0.3 }}>
                                        {totalDebt.toLocaleString('en-US')}
                                    </Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '700' }}>د.ع</Text>
                                </View>
                            </View>

                            {/* Urgency breakdown */}
                            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 12 }}>
                                {[
                                    { label: 'مرتفع', count: highCount, dot: C.danger },
                                    { label: 'متوسط', count: medCount,  dot: C.warning },
                                    { label: 'منخفض', count: lowCount,  dot: '#fff' },
                                ].map(b => (
                                    <View key={b.label} style={{
                                        flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: Radius.xs, paddingVertical: 7,
                                    }}>
                                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: b.dot }} />
                                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{b.label}</Text>
                                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800' }}>{b.count}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </View>
                )}

                {/* Search */}
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center',
                    backgroundColor: C.input, borderRadius: Radius.xs,
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
                    <Skeleton height={130} radius={Radius.sm} />
                    {[1, 2, 3].map(i => <Skeleton key={i} height={160} radius={Radius.sm} />)}
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={item => item.id}
                    renderItem={renderDebtor}
                    contentContainerStyle={{ padding: 16, paddingBottom: 110, flexGrow: 1 }}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
                    }
                    ListEmptyComponent={
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingBottom: 40 }}>
                            {/* Layered icon */}
                            <View style={{
                                width: 104, height: 104, borderRadius: 52,
                                backgroundColor: search ? C.primaryMuted : C.successBg,
                                alignItems: 'center', justifyContent: 'center', marginBottom: 18,
                            }}>
                                <View style={{
                                    width: 74, height: 74, borderRadius: 37,
                                    backgroundColor: C.card,
                                    alignItems: 'center', justifyContent: 'center',
                                    borderWidth: 1.5, borderColor: search ? `${C.primary}33` : `${C.success}33`,
                                }}>
                                    <Ionicons
                                        name={search ? 'search-outline' : 'checkmark-done'}
                                        size={36}
                                        color={search ? C.primary : C.success}
                                    />
                                </View>
                            </View>

                            <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900', textAlign: 'center' }}>
                                {search ? 'لا توجد نتائج' : 'جميع الحسابات مُسوَّاة'}
                            </Text>
                            <Text style={{ color: C.mutedForeground, fontSize: 14, textAlign: 'center', lineHeight: 21, marginTop: 6 }}>
                                {search
                                    ? `لا يوجد مدين يطابق "${search}"`
                                    : 'لا توجد ديون مستحقة حالياً — كل المبالغ محصّلة 🎉'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* ── Payment success modal ───────────────────────────────────── */}
            <Modal
                visible={paidAmount !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setPaidAmount(null)}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 28 }}>
                    <View style={{ backgroundColor: C.card, borderRadius: Radius.sm, padding: 24, alignItems: 'center' }}>
                        {/* Success icon */}
                        <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: C.successBg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                            <Ionicons name="checkmark-circle" size={42} color={C.success} />
                        </View>

                        <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900', marginBottom: 4 }}>
                            تمت الدفعة بنجاح
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 13, marginBottom: 12 }}>
                            تم تسجيل الدفعة في حساب العميل
                        </Text>

                        {/* Amount */}
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 4, marginBottom: 20 }}>
                            <Text style={{ color: C.success, fontSize: 24, fontWeight: '900' }}>
                                {(paidAmount ?? 0).toLocaleString('en-US')}
                            </Text>
                            <Text style={{ color: C.mutedForeground, fontSize: 13, fontWeight: '700' }}>د.ع</Text>
                        </View>

                        {/* OK button */}
                        <TouchableOpacity
                            onPress={() => setPaidAmount(null)}
                            activeOpacity={0.85}
                            style={{
                                width: '100%', flexDirection: 'row-reverse',
                                justifyContent: 'center', alignItems: 'center', gap: 7,
                                backgroundColor: C.primary, borderRadius: Radius.sm, paddingVertical: 14,
                            }}
                        >
                            <Ionicons name="checkmark-outline" size={18} color="#fff" />
                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>موافق</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}
