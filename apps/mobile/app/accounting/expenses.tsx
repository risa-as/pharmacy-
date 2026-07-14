import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, RefreshControl, ActivityIndicator,
    TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { request } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { Colors, Radius } from '../../constants/colors';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatDate } from '../../utils/date';

type Category = 'ALL' | 'RENT' | 'SALARY' | 'UTILITIES' | 'SUPPLIES' | 'OTHER';

const CATEGORIES: { key: Category; label: string }[] = [
    { key: 'ALL',       label: 'الكل' },
    { key: 'RENT',      label: 'إيجار' },
    { key: 'SALARY',    label: 'رواتب' },
    { key: 'UTILITIES', label: 'خدمات' },
    { key: 'SUPPLIES',  label: 'مستلزمات' },
    { key: 'OTHER',     label: 'أخرى' },
];

// Categories offered when creating a new expense (excludes the "ALL" filter).
const ADD_CATEGORIES = CATEGORIES.filter(c => c.key !== 'ALL');

const CATEGORY_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
    ALL:       'default',
    RENT:      'warning',
    SALARY:    'info',
    UTILITIES: 'danger',
    SUPPLIES:  'success',
    OTHER:     'default',
};

interface Expense {
    id: string;
    branchId: string;
    safeId?: string | null;
    amount: number;
    category: string;
    description: string | null;
    date: string;
    createdAt?: string;
    updatedAt?: string;
}

export default function ExpensesScreen() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const insets = useSafeAreaInsets();

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<Category>('ALL');
    const [search, setSearch] = useState('');

    // ── Add-expense modal state ─────────────────────────────────────────────
    const [showAdd, setShowAdd] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formDesc, setFormDesc] = useState('');
    const [formAmount, setFormAmount] = useState('');
    const [formCategory, setFormCategory] = useState<Category>('RENT');

    const fetchExpenses = useCallback(async () => {
        try {
            const data = await request<Expense[]>('/expenses', { method: 'GET' });
            setExpenses(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('ExpensesScreen: fetch error', error);
            setExpenses([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchExpenses();
    }, [fetchExpenses]);

    const resetForm = () => {
        setFormDesc('');
        setFormAmount('');
        setFormCategory('RENT');
    };

    const submitExpense = async () => {
        const amount = parseFloat(formAmount);
        if (!formDesc.trim()) {
            Alert.alert('تنبيه', 'يرجى إدخال وصف المصروف');
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            Alert.alert('تنبيه', 'يرجى إدخال مبلغ صحيح');
            return;
        }
        setSubmitting(true);
        try {
            // Server sets `date` via @default(now()); only amount/category/description are read.
            await request('/expenses', {
                method: 'POST',
                body: JSON.stringify({
                    amount,
                    category: formCategory,
                    description: formDesc.trim(),
                }),
            });
            setShowAdd(false);
            resetForm();
            fetchExpenses();
        } catch (error: any) {
            console.error('ExpensesScreen: create error', error);
            Alert.alert('خطأ', error?.message || 'تعذّر إضافة المصروف');
        } finally {
            setSubmitting(false);
        }
    };

    const filtered = expenses.filter((e) => {
        const matchesCategory = selectedCategory === 'ALL' || e.category === selectedCategory;
        const matchesSearch = !search || (e.description ?? '').toLowerCase().includes(search.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const total = filtered.reduce((sum, e) => sum + e.amount, 0);

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {/* ── Header bar (matches other sub-pages) ─────────────────────── */}
            <View style={{
                paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 10,
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: C.background,
            }}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    activeOpacity={0.8}
                    style={{ width: 40, height: 40, borderRadius: Radius.xs, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Ionicons name="arrow-forward" size={20} color={C.foreground} />
                </TouchableOpacity>
                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }}>المصروفات</Text>
                <TouchableOpacity
                    onPress={() => setShowAdd(true)}
                    activeOpacity={0.8}
                    style={{ width: 40, height: 40, borderRadius: Radius.xs, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Ionicons name="add" size={22} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Sticky top: search + category filter */}
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, backgroundColor: C.background }}>
                {/* Search bar */}
                <View style={{
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                    backgroundColor: C.input,
                    borderRadius: 6,
                    paddingHorizontal: 12,
                    borderWidth: 1,
                    borderColor: C.border,
                    marginBottom: 12,
                    gap: 8,
                }}>
                    <Ionicons name="search" size={18} color={C.mutedForeground} />
                    <TextInput
                        placeholder="ابحث في المصروفات..."
                        placeholderTextColor={C.mutedForeground}
                        value={search}
                        onChangeText={setSearch}
                        style={{ flex: 1, color: C.foreground, paddingVertical: 10, textAlign: 'right', fontSize: 14 }}
                    />
                </View>

                {/* Category filter chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: 'row-reverse' }}>
                    {CATEGORIES.map(({ key, label }) => (
                        <TouchableOpacity
                            key={key}
                            onPress={() => setSelectedCategory(key)}
                            style={{
                                paddingHorizontal: 14,
                                paddingVertical: 7,
                                borderRadius: 4,
                                backgroundColor: selectedCategory === key ? C.primary : C.card,
                                borderWidth: 1,
                                borderColor: selectedCategory === key ? C.primary : C.border,
                            }}
                        >
                            <Text style={{
                                fontSize: 13,
                                fontWeight: '600',
                                color: selectedCategory === key ? '#FFFFFF' : C.mutedForeground,
                            }}>
                                {label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            <ScrollView
                contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 110 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            >
                {/* Total summary card */}
                {!loading && filtered.length > 0 && (
                    <Card className="mb-4 flex-row-reverse items-center justify-between">
                        <View>
                            <Text style={{ color: C.mutedForeground, fontSize: 12 }}>إجمالي المصروفات</Text>
                            <Text style={{ color: C.danger, fontWeight: '900', fontSize: 22, marginTop: 2 }}>
                                {total.toLocaleString()} د.ع
                            </Text>
                        </View>
                        <View style={{ backgroundColor: C.dangerBg, borderRadius: 12, padding: 10 }}>
                            <Ionicons name="trending-down" size={22} color={C.danger} />
                        </View>
                    </Card>
                )}

                {loading && !refreshing ? (
                    <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 40 }} />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon="wallet-outline"
                        title="لا توجد مصروفات"
                        subtitle={search ? 'جرب كلمة بحث مختلفة' : 'لم يتم تسجيل أي مصروفات بعد'}
                    />
                ) : (
                    <View style={{ gap: 10 }}>
                        {filtered.map((expense) => (
                            <Card key={expense.id}>
                                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: C.foreground, fontWeight: '700', textAlign: 'right', fontSize: 14 }}>
                                            {expense.description || 'مصروف'}
                                        </Text>
                                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 3 }}>
                                            {formatDate(expense.date, { day: 'numeric', month: 'long' })}
                                        </Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                        <Text style={{ color: C.danger, fontWeight: '800', fontSize: 15 }}>
                                            {expense.amount.toLocaleString()} د.ع
                                        </Text>
                                        <Badge
                                            label={CATEGORIES.find(c => c.key === expense.category)?.label ?? expense.category}
                                            variant={CATEGORY_VARIANT[expense.category] ?? 'default'}
                                        />
                                    </View>
                                </View>
                            </Card>
                        ))}
                    </View>
                )}
            </ScrollView>

            {/* ── Add-expense modal ────────────────────────────────────────── */}
            <Modal
                visible={showAdd}
                transparent
                animationType="fade"
                onRequestClose={() => setShowAdd(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => setShowAdd(false)}
                        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}
                    >
                        <TouchableOpacity
                            activeOpacity={1}
                            style={{ backgroundColor: C.card, borderRadius: Radius.sm, padding: 20, gap: 14 }}
                        >
                            {/* Header */}
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                                <View style={{
                                    width: 40, height: 40, borderRadius: Radius.xs,
                                    backgroundColor: C.dangerBg, justifyContent: 'center', alignItems: 'center',
                                }}>
                                    <Ionicons name="wallet" size={20} color={C.danger} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right' }}>
                                        إضافة مصروف
                                    </Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 1 }}>
                                        {formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
                                    </Text>
                                </View>
                            </View>

                            {/* Description */}
                            <View style={{
                                backgroundColor: C.input, borderRadius: Radius.xs,
                                borderWidth: 1, borderColor: C.border, paddingHorizontal: 14,
                            }}>
                                <TextInput
                                    style={{ color: C.foreground, paddingVertical: 12, textAlign: 'right', fontSize: 14 }}
                                    placeholder="وصف المصروف"
                                    placeholderTextColor={C.mutedForeground}
                                    value={formDesc}
                                    onChangeText={setFormDesc}
                                />
                            </View>

                            {/* Amount */}
                            <View style={{
                                flexDirection: 'row-reverse', alignItems: 'center',
                                backgroundColor: C.input, borderRadius: Radius.xs,
                                borderWidth: 1.5, borderColor: C.danger, paddingHorizontal: 14, gap: 6,
                            }}>
                                <TextInput
                                    style={{ flex: 1, color: C.foreground, paddingVertical: 13, textAlign: 'right', fontSize: 20, fontWeight: '800' }}
                                    placeholder="0"
                                    placeholderTextColor={C.mutedForeground}
                                    keyboardType="numeric"
                                    value={formAmount}
                                    onChangeText={setFormAmount}
                                />
                                <Text style={{ color: C.mutedForeground, fontSize: 13, fontWeight: '700' }}>د.ع</Text>
                            </View>

                            {/* Category picker */}
                            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
                                {ADD_CATEGORIES.map(({ key, label }) => {
                                    const sel = formCategory === key;
                                    return (
                                        <TouchableOpacity
                                            key={key}
                                            onPress={() => setFormCategory(key)}
                                            activeOpacity={0.8}
                                            style={{
                                                paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.xs,
                                                backgroundColor: sel ? C.primary : C.card,
                                                borderWidth: 1, borderColor: sel ? C.primary : C.border,
                                            }}
                                        >
                                            <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? '#fff' : C.mutedForeground }}>
                                                {label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {/* Actions */}
                            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                                <TouchableOpacity
                                    onPress={submitExpense}
                                    disabled={submitting}
                                    activeOpacity={0.85}
                                    style={{
                                        flex: 2, flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center',
                                        gap: 6, backgroundColor: C.primary, borderRadius: Radius.sm, paddingVertical: 13,
                                        opacity: submitting ? 0.7 : 1,
                                    }}
                                >
                                    {submitting
                                        ? <ActivityIndicator color="#fff" />
                                        : (
                                            <>
                                                <Ionicons name="checkmark-outline" size={18} color="#fff" />
                                                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>حفظ</Text>
                                            </>
                                        )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setShowAdd(false)}
                                    disabled={submitting}
                                    activeOpacity={0.75}
                                    style={{
                                        flex: 1, flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center',
                                        gap: 6, backgroundColor: C.card, borderRadius: Radius.sm, paddingVertical: 13,
                                        borderWidth: 1, borderColor: C.border,
                                    }}
                                >
                                    <Ionicons name="close-outline" size={18} color={C.mutedForeground} />
                                    <Text style={{ color: C.foreground, fontWeight: '600', fontSize: 14 }}>إلغاء</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}
