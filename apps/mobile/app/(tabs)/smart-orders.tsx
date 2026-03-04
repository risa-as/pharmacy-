import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, ScrollView, RefreshControl,
    TouchableOpacity, Alert,
} from 'react-native';
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
import { BranchSelector } from '../../components/BranchSelector';

interface SmartOrderItem {
    id: string;
    // API returns nested drug relation: item.drug.tradeName
    drug?: { tradeName?: string; scientificName?: string };
    // API field names from /api/smart-order
    currentQuantity: number;
    suggestedReorderQuantity: number;
    daysUntilStockout?: number;
    branch?: { name?: string };
}

export default function SmartOrdersScreen() {
    const { isDarkMode } = useTheme();
    const { branchId: authBranchId } = useAuth();
    const C = Colors(isDarkMode);

    const [items, setItems] = useState<SmartOrderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);
    const [approvingId, setApprovingId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const data = await apiService.getSmartOrders(selectedBranch ?? undefined);
            setItems(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('SmartOrdersScreen: fetch error', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedBranch]);

    useEffect(() => {
        setLoading(true);
        fetchData();
    }, [fetchData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

    const handleApprove = useCallback(async (item: SmartOrderItem) => {
        const drugName = item.drug?.tradeName ?? 'دواء';
        Alert.alert(
            'تأكيد الطلب',
            `هل تريد إنشاء طلب شراء لـ "${drugName}" بكمية ${item.suggestedReorderQuantity}؟`,
            [
                { text: 'إلغاء', style: 'cancel' },
                {
                    text: 'موافق',
                    onPress: async () => {
                        setApprovingId(item.id);
                        try {
                            // Placeholder: navigate to purchases create or call API
                            Alert.alert('تم', 'سيتم توجيهك لإنشاء الطلب');
                        } finally {
                            setApprovingId(null);
                        }
                    },
                },
            ],
        );
    }, []);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
            {/* Header */}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 8 }}>
                <View>
                    <Text style={{ color: C.foreground, fontSize: 20, fontWeight: '800', textAlign: 'right' }}>
                        الطلبات الذكية
                    </Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 12, marginTop: 2, textAlign: 'right' }}>
                        أصناف تحتاج إلى إعادة طلب
                    </Text>
                </View>
                <View style={{ backgroundColor: C.warningBg, borderRadius: 6, padding: 10 }}>
                    <Ionicons name="bulb" size={22} color={C.warning} />
                </View>
            </View>

            {/* Branch selector */}
            <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} />

            {loading && !refreshing ? (
                <View style={{ gap: 12, marginTop: 8 }}>
                    {[1, 2, 3].map(i => (
                        <Skeleton key={i} height={168} radius={8} />
                    ))}
                </View>
            ) : items.length === 0 ? (
                <EmptyState
                    icon="checkmark-circle"
                    title="المخزون ممتاز!"
                    subtitle="لا توجد أصناف تحتاج إلى إعادة طلب حالياً"
                />
            ) : (
                <View style={{ gap: 12, marginTop: 8 }}>
                    {items.map((item) => (
                        <Card key={item.id}>
                            {/* Item header */}
                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 15, textAlign: 'right' }}>
                                        {item.drug?.tradeName ?? 'دواء غير محدد'}
                                    </Text>
                                    {item.drug?.scientificName && (
                                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }}>
                                            {item.drug.scientificName}
                                        </Text>
                                    )}
                                    {item.branch?.name && (
                                        <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 1 }}>
                                            الفرع: {item.branch.name}
                                        </Text>
                                    )}
                                </View>
                                <Badge
                                    label={item.daysUntilStockout !== undefined && item.daysUntilStockout <= 7 ? 'عاجل' : 'نقص'}
                                    variant={item.daysUntilStockout !== undefined && item.daysUntilStockout <= 7 ? 'danger' : 'warning'}
                                />
                            </View>

                            {/* Stock info row */}
                            <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: 14 }}>
                                <View style={{ flex: 1, backgroundColor: C.dangerBg, borderRadius: 6, padding: 10, alignItems: 'center' }}>
                                    <Text style={{ color: C.danger, fontSize: 18, fontWeight: '800' }}>
                                        {item.currentQuantity}
                                    </Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 11, marginTop: 2 }}>المخزون الحالي</Text>
                                </View>
                                <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                                    <Ionicons name="arrow-back" size={18} color={C.mutedForeground} />
                                </View>
                                <View style={{ flex: 1, backgroundColor: C.successBg, borderRadius: 6, padding: 10, alignItems: 'center' }}>
                                    <Text style={{ color: C.success, fontSize: 18, fontWeight: '800' }}>
                                        {item.suggestedReorderQuantity}
                                    </Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 11, marginTop: 2 }}>الكمية المقترحة</Text>
                                </View>
                            </View>

                            {/* Approve button */}
                            <Button
                                label="إنشاء طلب شراء"
                                onPress={() => handleApprove(item)}
                                loading={approvingId === item.id}
                            />
                        </Card>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}
