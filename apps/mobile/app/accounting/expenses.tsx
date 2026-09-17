import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { request } from '../../services/api';
import { Radius } from '../../constants/colors';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { usePalette, Surface, IconTile, SectionTitle, SegmentedTabs, FormField, AppButton, StateBlock, Tone } from '../../components/ui/Kit';
import { formatDate, iraqDateString } from '../../utils/date';
import { formatNumber, formatIQD, CURRENCY } from '../../utils/format';

type Category = 'RENT' | 'SALARY' | 'UTILITIES' | 'SUPPLIES' | 'OTHER';
type Filter = 'ALL' | 'RENT' | 'SALARY' | 'OTHER';

/** Categories an expense can be saved under. */
const ADD_CATEGORIES: { key: Category; label: string; tone: Tone }[] = [
    { key: 'RENT', label: 'إيجار', tone: 'warning' },
    { key: 'SALARY', label: 'رواتب', tone: 'primary' },
    { key: 'UTILITIES', label: 'خدمات', tone: 'danger' },
    { key: 'SUPPLIES', label: 'مستلزمات', tone: 'success' },
    { key: 'OTHER', label: 'أخرى', tone: 'neutral' },
];

const FILTERS: { key: Filter; label: string }[] = [
    { key: 'ALL', label: 'الكل' },
    { key: 'RENT', label: 'إيجار' },
    { key: 'SALARY', label: 'رواتب' },
    { key: 'OTHER', label: 'أخرى' },
];

// Rows come from two vocabularies: mobile saves keys (RENT), the web saves Arabic text (إيجار).
const categoryMeta = (key: string) => ADD_CATEGORIES.find(c => c.key === key || c.label === key);

/** «أخرى» covers every category that has no tab of its own. */
function matchesFilter(expenseCategory: string, filter: Filter): boolean {
    if (filter === 'ALL') return true;
    if (filter === 'OTHER') return expenseCategory !== 'RENT' && expenseCategory !== 'SALARY';
    return expenseCategory === filter;
}

interface Expense {
    id: string;
    amount: number;
    category: string;
    description: string | null;
    date: string;
}

/** Expenses (design expenses.png): search, category filter, total, list, short add form with review. */
export default function ExpensesScreen() {
    const C = usePalette();
    const insets = useSafeAreaInsets();
    const scrollRef = useRef<ScrollView>(null);

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<Filter>('ALL');
    const [search, setSearch] = useState('');

    const [formDesc, setFormDesc] = useState('');
    const [formAmount, setFormAmount] = useState('');
    const [formCategory, setFormCategory] = useState<Category>('OTHER');
    const [categoryPicker, setCategoryPicker] = useState(false);
    const [touched, setTouched] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    /** Expense being edited; null while adding a new one. */
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchExpenses = useCallback(async () => {
        try {
            const data = await request<Expense[]>('/expenses', { method: 'GET' });
            setExpenses(Array.isArray(data) ? data : []);
            setFailed(false);
        } catch (error) {
            console.error('ExpensesScreen: fetch error', error);
            setFailed(true);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchExpenses(); }, [fetchExpenses]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchExpenses(); }, [fetchExpenses]);

    const filtered = useMemo(() => expenses.filter(e =>
        matchesFilter(e.category, filter) &&
        (!search.trim() || (e.description ?? '').toLowerCase().includes(search.trim().toLowerCase()))),
    [expenses, filter, search]);

    const total = filtered.reduce((sum, e) => sum + e.amount, 0);

    const grouped = useMemo(() => {
        const map = new Map<string, Expense[]>();
        for (const e of filtered) {
            const k = iraqDateString(e.date);
            if (!map.has(k)) map.set(k, []);
            map.get(k)!.push(e);
        }
        return Array.from(map.values());
    }, [filtered]);

    const amount = parseFloat(formAmount.replace(/[^0-9.]/g, ''));
    const descError = !formDesc.trim() ? 'أدخل وصف المصروف' : null;
    const amountError = !formAmount.trim() ? 'أدخل المبلغ' : !Number.isFinite(amount) || amount <= 0 ? 'المبلغ يجب أن يكون أكبر من صفر' : null;

    const resetForm = () => {
        setFormDesc(''); setFormAmount(''); setFormCategory('OTHER');
        setTouched(false); setEditingId(null);
    };

    const submit = async () => {
        setSubmitting(true);
        try {
            const body = JSON.stringify({ amount, category: formCategory, description: formDesc.trim() });
            // Server sets `date`; only amount/category/description are read.
            if (editingId) await request(`/expenses/${editingId}`, { method: 'PATCH', body });
            else await request('/expenses', { method: 'POST', body });
            resetForm();
            fetchExpenses();
        } catch (error: any) {
            Alert.alert('تعذّر الحفظ', error?.message || 'لم يُسجَّل المصروف. حاول مرة أخرى.');
        } finally {
            setSubmitting(false);
        }
    };

    /** Loads an expense into the form below and scrolls to it. */
    const startEdit = (e: Expense) => {
        setEditingId(e.id);
        setFormDesc(e.description ?? '');
        setFormAmount(String(e.amount));
        setFormCategory((categoryMeta(e.category)?.key ?? 'OTHER') as Category);
        setTouched(false);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    };

    const confirmDelete = (e: Expense) => {
        Alert.alert(
            'حذف المصروف',
            `${e.description || 'مصروف'}\n${formatIQD(e.amount)}\n\nسيُحذف نهائياً من حسابات الفرع.`,
            [
                { text: 'إلغاء', style: 'cancel' },
                {
                    text: 'حذف',
                    style: 'destructive',
                    onPress: async () => {
                        setDeletingId(e.id);
                        try {
                            await request(`/expenses/${e.id}`, { method: 'DELETE' });
                            if (editingId === e.id) resetForm();
                            fetchExpenses();
                        } catch (error: any) {
                            Alert.alert('تعذّر الحذف', error?.message || 'لم يُحذف المصروف. حاول مرة أخرى.');
                        } finally {
                            setDeletingId(null);
                        }
                    },
                },
            ],
        );
    };

    const reviewAndAdd = () => {
        setTouched(true);
        if (descError || amountError) return;
        const catLabel = categoryMeta(formCategory)?.label ?? '';
        Alert.alert(
            editingId ? 'مراجعة التعديل' : 'مراجعة المصروف',
            `${formDesc.trim()}\n${catLabel} · ${formatIQD(amount)}\n\n${editingId ? 'سيُحدَّث المصروف بهذه البيانات.' : 'سيُسجَّل بتاريخ اليوم.'}`,
            [
                { text: 'تعديل', style: 'cancel' },
                { text: editingId ? 'حفظ التعديل' : 'إضافة المصروف', onPress: submit },
            ],
        );
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.background }}>
            <ScreenHeader title="المصروفات" fallbackHref="/(tabs)/more" />
            <ScrollView
                ref={scrollRef}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 14 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            >
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: Radius.control, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 }}>
                    <Ionicons name="search-outline" size={20} color={C.mutedForeground} />
                    <TextInput
                        placeholder="ابحث في المصروفات"
                        placeholderTextColor={C.mutedForeground}
                        value={search}
                        onChangeText={setSearch}
                        style={{ flex: 1, color: C.foreground, paddingVertical: 12, textAlign: 'right', fontSize: 15 }}
                    />
                </View>

                <SegmentedTabs<Filter> items={FILTERS} value={filter} onChange={setFilter} />

                {loading && !refreshing ? (
                    <StateBlock loading title="جارِ تحميل المصروفات…" />
                ) : failed ? (
                    <StateBlock icon="cloud-offline-outline" title="تعذّر تحميل المصروفات" actionLabel="إعادة المحاولة" onAction={onRefresh} />
                ) : (
                    <>
                        <Surface style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 14, textAlign: 'right' }}>إجمالي المصروفات</Text>
                                <Text style={{ color: C.primary, fontSize: 28, fontWeight: '900', textAlign: 'right' }}>
                                    {formatNumber(total)} <Text style={{ fontSize: 14, color: C.mutedForeground }}>{CURRENCY}</Text>
                                </Text>
                            </View>
                            <IconTile icon="wallet-outline" size={48} />
                        </Surface>

                        {filtered.length === 0 ? (
                            <StateBlock icon="wallet-outline" title="لا توجد مصروفات" message={search ? 'جرب كلمة بحث مختلفة' : 'لم يتم تسجيل أي مصروفات في هذا التصنيف'} />
                        ) : grouped.map(group => (
                            <View key={group[0].id} style={{ gap: 8 }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 14, fontWeight: '700', textAlign: 'right' }}>
                                    {formatDate(group[0].date, { weekday: 'long', day: 'numeric', month: 'long' })}
                                </Text>
                                {group.map(e => {
                                    const cat = categoryMeta(e.category);
                                    return (
                                        <Surface key={e.id} padded={false} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
                                            <IconTile icon="document-text-outline" tone={cat?.tone ?? 'neutral'} size={42} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: C.foreground, fontSize: 15.5, fontWeight: '800', textAlign: 'right' }} numberOfLines={1}>{e.description || 'مصروف'}</Text>
                                                <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>
                                                    {formatDate(e.date, { day: 'numeric', month: 'long' })} · {cat?.label ?? e.category}
                                                </Text>
                                            </View>
                                            <Text style={{ color: C.primary, fontSize: 17, fontWeight: '900' }}>
                                                {formatNumber(e.amount)} <Text style={{ fontSize: 12, color: C.mutedForeground }}>{CURRENCY}</Text>
                                            </Text>
                                            {/* Edit / delete, stacked */}
                                            <View style={{ gap: 6 }}>
                                                <TouchableOpacity
                                                    onPress={() => startEdit(e)}
                                                    hitSlop={6}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`تعديل ${e.description || 'المصروف'}`}
                                                    style={{ width: 30, height: 30, borderRadius: Radius.control, backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center' }}
                                                >
                                                    <Ionicons name="create-outline" size={16} color={C.primary} />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => confirmDelete(e)}
                                                    disabled={deletingId === e.id}
                                                    hitSlop={6}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`حذف ${e.description || 'المصروف'}`}
                                                    style={{ width: 30, height: 30, borderRadius: Radius.control, backgroundColor: C.dangerBg, alignItems: 'center', justifyContent: 'center', opacity: deletingId === e.id ? 0.5 : 1 }}
                                                >
                                                    <Ionicons name="trash-outline" size={16} color={C.danger} />
                                                </TouchableOpacity>
                                            </View>
                                        </Surface>
                                    );
                                })}
                            </View>
                        ))}
                    </>
                )}

                <View>
                    <SectionTitle title={editingId ? 'تعديل المصروف' : 'إضافة مصروف'} />
                    <Surface style={{ gap: 14 }}>
                        <FormField label="الوصف" required value={formDesc} onChangeText={setFormDesc} placeholder="أدخل وصف المصروف" error={touched ? descError : null} />
                        <FormField label="المبلغ" required value={formAmount} onChangeText={setFormAmount} keyboardType="numeric" placeholder="أدخل المبلغ" suffix={CURRENCY} error={touched ? amountError : null} />
                        <View style={{ gap: 6 }}>
                            <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '700', textAlign: 'right' }}>التصنيف</Text>
                            <TouchableOpacity
                                onPress={() => setCategoryPicker(true)}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityLabel={`التصنيف: ${categoryMeta(formCategory)?.label ?? ''}`}
                                style={{
                                    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                                    backgroundColor: C.input, borderRadius: Radius.control, borderWidth: 1, borderColor: C.border,
                                    paddingHorizontal: 14, height: 48,
                                }}
                            >
                                <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '700' }}>{categoryMeta(formCategory)?.label ?? 'أخرى'}</Text>
                                <Ionicons name="chevron-down" size={18} color={C.mutedForeground} />
                            </TouchableOpacity>
                        </View>
                        {editingId ? (
                            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                                <AppButton label="حفظ التعديل" icon="checkmark" loading={submitting} onPress={reviewAndAdd} style={{ flex: 1.4 }} />
                                <AppButton label="إلغاء" variant="outline" disabled={submitting} onPress={resetForm} style={{ flex: 1 }} />
                            </View>
                        ) : (
                            <AppButton label="إضافة مصروف" icon="add" loading={submitting} onPress={reviewAndAdd} />
                        )}
                    </Surface>
                </View>
            </ScrollView>

            <Modal visible={categoryPicker} transparent animationType="fade" onRequestClose={() => setCategoryPicker(false)}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setCategoryPicker(false)}
                    style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', paddingHorizontal: 24 }}
                >
                    <Surface padded={false} style={{ overflow: 'hidden' }}>
                        <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right', padding: 14 }}>اختر التصنيف</Text>
                        {ADD_CATEGORIES.map(c => {
                            const sel = formCategory === c.key;
                            return (
                                <TouchableOpacity
                                    key={c.key}
                                    onPress={() => { setFormCategory(c.key); setCategoryPicker(false); }}
                                    activeOpacity={0.75}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: sel }}
                                    style={{
                                        flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                                        paddingHorizontal: 14, paddingVertical: 13,
                                        borderTopWidth: 1, borderTopColor: C.border,
                                        backgroundColor: sel ? C.primaryMuted : 'transparent',
                                    }}
                                >
                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sel ? C.primary : C.border }} />
                                    <Text style={{ flex: 1, color: sel ? C.primary : C.foreground, fontSize: 15, fontWeight: sel ? '800' : '600', textAlign: 'right' }}>{c.label}</Text>
                                    {sel && <Ionicons name="checkmark" size={18} color={C.primary} />}
                                </TouchableOpacity>
                            );
                        })}
                    </Surface>
                </TouchableOpacity>
            </Modal>
        </KeyboardAvoidingView>
    );
}
