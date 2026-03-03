import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, RefreshControl, ActivityIndicator,
    TouchableOpacity, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { request } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';

type Category = 'ALL' | 'RENT' | 'SALARY' | 'UTILITIES' | 'SUPPLIES' | 'OTHER';

const CATEGORIES: { key: Category; label: string }[] = [
    { key: 'ALL',       label: 'الكل' },
    { key: 'RENT',      label: 'إيجار' },
    { key: 'SALARY',    label: 'رواتب' },
    { key: 'UTILITIES', label: 'خدمات' },
    { key: 'SUPPLIES',  label: 'مستلزمات' },
    { key: 'OTHER',     label: 'أخرى' },
];

const CATEGORY_VARIANT: Record<Category, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
    ALL:       'default',
    RENT:      'warning',
    SALARY:    'info',
    UTILITIES: 'danger',
    SUPPLIES:  'success',
    OTHER:     'default',
};

interface Expense {
    id: string;
    description: string;
    amount: number;
    category: Category;
    date: string;
}

export default function ExpensesScreen() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<Category>('ALL');
    const [search, setSearch] = useState('');

    const fetchExpenses = useCallback(async () => {
        try {
            const data = await request<Expense[]>('/accounting/expenses', { method: 'GET' });
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

    const filtered = expenses.filter((e) => {
        const matchesCategory = selectedCategory === 'ALL' || e.category === selectedCategory;
        const matchesSearch = !search || e.description.toLowerCase().includes(search.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const total = filtered.reduce((sum, e) => sum + e.amount, 0);

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {/* Sticky top: search + category filter */}
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: C.background }}>
                {/* Search bar */}
                <View style={{
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                    backgroundColor: C.input,
                    borderRadius: 12,
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
                                borderRadius: 20,
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
                                            {expense.description}
                                        </Text>
                                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 3 }}>
                                            {new Date(expense.date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}
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
        </View>
    );
}
