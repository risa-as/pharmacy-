import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, TextInput, Alert, RefreshControl,
    KeyboardAvoidingView, Platform, Modal, ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Radius } from '../../constants/colors';
import { Skeleton } from '../../components/ui/Skeleton';
import { useSyncStatus } from '../../context/SyncContext';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { usePalette, Surface, IconTile, NavigationArrow, SegmentedTabs, FormField, AppButton, InfoNote, StateBlock, VDivider } from '../../components/ui/Kit';
import { formatDate } from '../../utils/date';
import { formatNumber, formatIQD, CURRENCY, initials } from '../../utils/format';

interface Debtor {
    id: string;
    name: string;
    phone: string;
    balance: number;
    updatedAt: string;
}

type SortKey = 'all' | 'highest';
type Step = 'form' | 'review' | 'done';

/**
 * Debts (navigation-map §8): choose debtor → amount + note → review balance →
 * confirm collection → updated balance. No "overdue" labels — there is no due date.
 */
export default function DebtsScreen() {
    const C = usePalette();
    const { branchId, shell } = useAuth();
    const { triggerSync } = useSyncStatus();

    const [debtors, setDebtors]       = useState<Debtor[]>([]);
    const [loading, setLoading]       = useState(true);
    const [failed, setFailed]         = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch]         = useState('');
    const [sort, setSort]             = useState<SortKey>('all');

    const [target, setTarget]         = useState<Debtor | null>(null);
    const [step, setStep]             = useState<Step>('form');
    const [payAmount, setPayAmount]   = useState('');
    const [payNote, setPayNote]       = useState('');
    const [amountTouched, setAmountTouched] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const inFlight = useRef(false);

    const fetchDebtors = useCallback(async () => {
        try {
            const data = await apiService.getDebts(branchId ?? undefined);
            setDebtors(Array.isArray(data) ? data : []);
            setFailed(false);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [branchId]);

    useEffect(() => { fetchDebtors(); }, [fetchDebtors]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        triggerSync('debts');
        fetchDebtors();
    }, [fetchDebtors, triggerSync]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = q ? debtors.filter(d => d.name.toLowerCase().includes(q) || (d.phone ?? '').includes(q)) : debtors;
        return sort === 'highest' ? [...list].sort((a, b) => b.balance - a.balance) : list;
    }, [debtors, search, sort]);

    const totalDebt = useMemo(() => debtors.reduce((s, d) => s + d.balance, 0), [debtors]);

    const amount = parseFloat(payAmount.replace(/[^0-9.]/g, ''));
    const amountError = !payAmount.trim()
        ? 'أدخل مبلغ التحصيل'
        : isNaN(amount) || amount <= 0
            ? 'المبلغ يجب أن يكون أكبر من صفر'
            : target && amount > target.balance
                ? `المبلغ أكبر من الرصيد المستحق (${formatIQD(target.balance)})`
                : null;

    const openCollect = (d: Debtor) => {
        setTarget(d);
        setStep('form');
        setPayAmount('');
        setPayNote('');
        setAmountTouched(false);
    };

    const closeSheet = () => {
        if (submitting) return;
        setTarget(null);
    };

    const confirmCollection = async () => {
        if (!target || amountError || inFlight.current) return;
        inFlight.current = true;
        setSubmitting(true);
        try {
            await apiService.payDebt(target.id, amount, payNote.trim());
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setStep('done');
            fetchDebtors();
        } catch {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('لم تُسجَّل الدفعة', 'تعذّر تسجيل التحصيل. تحقق من الاتصال وحاول مرة أخرى.');
        } finally {
            inFlight.current = false;
            setSubmitting(false);
        }
    };

    const renderDebtor = ({ item }: { item: Debtor }) => (
        <TouchableOpacity onPress={() => openCollect(item)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`تحصيل دفعة من ${item.name}`}>
            <Surface style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: C.primary, fontSize: 15, fontWeight: '800' }}>{initials(item.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right' }} numberOfLines={1}>{item.name}</Text>
                    {/* Phone on its own line so «آخر تحديث …» never splits across two lines */}
                    {item.phone ? (
                        <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>
                            {item.phone}
                        </Text>
                    ) : null}
                    <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>
                        آخر تحديث {formatDate(item.updatedAt, { day: 'numeric', month: 'short' })}
                    </Text>
                </View>
                <Text style={{ color: C.primary, fontSize: 18, fontWeight: '900' }}>
                    {formatNumber(item.balance)} <Text style={{ fontSize: 12, color: C.mutedForeground }}>{CURRENCY}</Text>
                </Text>
                <NavigationArrow size={30} color={C.mutedForeground} backgroundColor={C.input} />
            </Surface>
        </TouchableOpacity>
    );

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScreenHeader title="الديون" hideBack={shell === 'pharmacist'} fallbackHref="/(tabs)/more" />

            <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 10 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: Radius.control, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 }}>
                    <Ionicons name="search-outline" size={20} color={C.mutedForeground} />
                    <TextInput
                        style={{ flex: 1, color: C.foreground, paddingVertical: 12, textAlign: 'right', fontSize: 15 }}
                        placeholder="ابحث باسم المدين أو الهاتف"
                        placeholderTextColor={C.mutedForeground}
                        value={search}
                        onChangeText={setSearch}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="مسح البحث">
                            <Ionicons name="close-circle" size={18} color={C.mutedForeground} />
                        </TouchableOpacity>
                    )}
                </View>

                {!loading && !failed && (
                    <Surface style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
                        <IconTile icon="hand-coins" tone="danger" />
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 13.5, textAlign: 'right' }}>إجمالي الديون</Text>
                            <Text style={{ color: C.primary, fontSize: 26, fontWeight: '900', textAlign: 'right' }}>
                                {formatNumber(totalDebt)} <Text style={{ fontSize: 14, color: C.mutedForeground }}>{CURRENCY}</Text>
                            </Text>
                        </View>
                        <VDivider />
                        <View style={{ alignItems: 'center', minWidth: 64 }}>
                            <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '900' }}>{formatNumber(debtors.length)}</Text>
                            <Text style={{ color: C.mutedForeground, fontSize: 12.5 }}>مدين</Text>
                        </View>
                    </Surface>
                )}

                <SegmentedTabs<SortKey>
                    items={[
                        { key: 'all', label: 'الكل', icon: 'document-text-outline' },
                        { key: 'highest', label: 'أعلى رصيد', icon: 'bar-chart-outline' },
                    ]}
                    value={sort}
                    onChange={setSort}
                />
            </View>

            {loading && !refreshing ? (
                <View style={{ padding: 16, gap: 10 }}>
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} height={78} radius={Radius.card} />)}
                </View>
            ) : failed ? (
                <StateBlock icon="cloud-offline-outline" title="تعذّر تحميل الديون" message="تحقق من الاتصال ثم أعد المحاولة." actionLabel="إعادة المحاولة" onAction={onRefresh} />
            ) : (
                <FlatList
                    data={visible}
                    keyExtractor={item => item.id}
                    renderItem={renderDebtor}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32, flexGrow: 1 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                    ListEmptyComponent={
                        <StateBlock
                            icon={search ? 'search-outline' : 'checkmark-done-outline'}
                            title={search ? 'لا توجد نتائج' : 'لا توجد ديون مستحقة'}
                            message={search ? `لا يوجد مدين يطابق "${search}"` : 'جميع الحسابات مسوّاة حالياً.'}
                        />
                    }
                />
            )}

            {/* ── Collection sheet: form → review → done ───────────────────── */}
            <Modal visible={!!target} transparent animationType="slide" onRequestClose={closeSheet}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
                        <View style={{ backgroundColor: C.card, borderTopLeftRadius: Radius.card, borderTopRightRadius: Radius.card, maxHeight: '88%' }}>
                            <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }} keyboardShouldPersistTaps="handled">
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                                    <View style={{ width: 4, height: 22, borderRadius: 2, backgroundColor: C.primary }} />
                                    <Text style={{ flex: 1, color: C.foreground, fontSize: 18, fontWeight: '900', textAlign: 'right' }}>
                                        {step === 'done' ? 'تم التحصيل' : step === 'review' ? 'مراجعة التحصيل' : 'تحصيل دفعة'}
                                    </Text>
                                    {step !== 'done' && (
                                        <TouchableOpacity onPress={closeSheet} hitSlop={10} accessibilityLabel="إغلاق">
                                            <Ionicons name="close" size={24} color={C.mutedForeground} />
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {target && (
                                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', backgroundColor: C.background, borderRadius: Radius.control, padding: 12 }}>
                                        <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '800' }} numberOfLines={1}>{target.name}</Text>
                                        <Text style={{ color: C.mutedForeground, fontSize: 14 }}>الرصيد {formatIQD(target.balance)}</Text>
                                    </View>
                                )}

                                {step === 'form' && target && (
                                    <>
                                        <FormField
                                            label="المبلغ"
                                            required
                                            value={payAmount}
                                            onChangeText={setPayAmount}
                                            onBlur={() => setAmountTouched(true)}
                                            keyboardType="numeric"
                                            placeholder="0"
                                            suffix={CURRENCY}
                                            autoFocus
                                            error={amountTouched ? amountError : null}
                                        />
                                        <TouchableOpacity onPress={() => { setPayAmount(String(target.balance)); setAmountTouched(true); }} style={{ alignSelf: 'flex-end' }}>
                                            <Text style={{ color: C.primary, fontSize: 13, fontWeight: '700' }}>تحصيل كامل الرصيد</Text>
                                        </TouchableOpacity>
                                        <FormField label="ملاحظة" value={payNote} onChangeText={setPayNote} placeholder="مثال: دفعة من الرصيد" multiline />
                                        <AppButton
                                            label="مراجعة التحصيل"
                                            onPress={() => { setAmountTouched(true); if (!amountError) setStep('review'); }}
                                        />
                                        <InfoNote tone="warning" text="التحصيل يحتاج تأكيداً قبل تسجيل الدفعة." />
                                    </>
                                )}

                                {step === 'review' && target && (
                                    <>
                                        <Surface style={{ gap: 10 }}>
                                            <ReviewRow label="مبلغ التحصيل" value={formatIQD(amount)} strong />
                                            <ReviewRow label="الرصيد الحالي" value={formatIQD(target.balance)} />
                                            <ReviewRow label="الرصيد بعد التحصيل" value={formatIQD(Math.max(0, target.balance - amount))} tone="success" />
                                            {payNote.trim() ? <ReviewRow label="ملاحظة" value={payNote.trim()} /> : null}
                                        </Surface>
                                        <AppButton label="تأكيد التحصيل" icon="checkmark-circle-outline" loading={submitting} onPress={confirmCollection} />
                                        <AppButton label="تعديل" variant="outline" disabled={submitting} onPress={() => setStep('form')} />
                                    </>
                                )}

                                {step === 'done' && target && (
                                    <>
                                        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                                            <Ionicons name="checkmark-circle" size={56} color={C.success} />
                                            <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }}>سُجّلت دفعة {formatIQD(amount)}</Text>
                                            <Text style={{ color: C.mutedForeground, fontSize: 14 }}>
                                                الرصيد المتبقي {formatIQD(Math.max(0, target.balance - amount))}
                                            </Text>
                                        </View>
                                        <AppButton label="تم" onPress={() => setTarget(null)} />
                                    </>
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </KeyboardAvoidingView>
    );
}

function ReviewRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'success' }) {
    const C = usePalette();
    return (
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <Text style={{ color: C.mutedForeground, fontSize: 14 }}>{label}</Text>
            <Text style={{ color: tone === 'success' ? C.success : C.foreground, fontSize: strong ? 18 : 15, fontWeight: strong ? '900' : '700', flexShrink: 1, textAlign: 'left' }}>{value}</Text>
        </View>
    );
}
