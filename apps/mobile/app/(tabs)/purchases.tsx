import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { BranchSelector } from '../../components/BranchSelector';
import { useSyncStatus } from '../../context/SyncContext';

type BadgeVariantType = 'success' | 'warning' | 'danger' | 'info' | 'default';

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariantType }> = {
    COMPLETED: { label: 'مكتمل',        variant: 'success' },
    PENDING:   { label: 'قيد الانتظار', variant: 'warning' },
    CANCELLED: { label: 'ملغى',          variant: 'danger'  },
    RECEIVED:  { label: 'تم الاستلام',  variant: 'info'    },
};

function getStatus(status: string) {
    return STATUS_MAP[status] ?? { label: status, variant: 'default' as BadgeVariantType };
}

export default function PurchasesScreen() {
    const router = useRouter();
    const { isDarkMode } = useTheme();
    const { branchId: authBranchId } = useAuth();
    const { triggerSync } = useSyncStatus();
    const C = Colors(isDarkMode);

    const [purchases, setPurchases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(authBranchId);

    const fetchPurchases = useCallback(async () => {
        try {
            const data = await apiService.getPurchases(selectedBranch ?? undefined);
            setPurchases(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('PurchasesScreen: fetch error', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedBranch]);

    useEffect(() => {
        setLoading(true);
        fetchPurchases();
    }, [fetchPurchases]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        triggerSync('purchases');
        fetchPurchases();
    }, [fetchPurchases, triggerSync]);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: C.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
            {/* Header */}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 8 }}>
                <View>
                    <Text style={{ color: C.foreground, fontSize: 20, fontWeight: '800', textAlign: 'right' }}>المشتريات</Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 12, marginTop: 2, textAlign: 'right' }}>
                        {purchases.length > 0 ? `${purchases.length} طلب شراء` : 'لا توجد طلبات'}
                    </Text>
                </View>
                <View style={{ backgroundColor: C.primaryMuted, borderRadius: 12, padding: 10 }}>
                    <Ionicons name="receipt" size={22} color={C.primary} />
                </View>
            </View>

            {/* Branch Selector */}
            <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} />

            {loading && !refreshing ? (
                <View style={{ gap: 12, marginTop: 8 }}>
                    {[1, 2, 3, 4].map(i => (
                        <Skeleton key={i} height={100} radius={16} />
                    ))}
                </View>
            ) : purchases.length === 0 ? (
                <EmptyState
                    icon="receipt-outline"
                    title="لا توجد مشتريات"
                    subtitle="لم يتم تسجيل أي طلبات شراء بعد"
                />
            ) : (
                <View style={{ gap: 12, marginTop: 8 }}>
                    {purchases.map((purchase) => {
                        const { label, variant } = getStatus(purchase.status);
                        const isPending = purchase.status === 'PENDING';

                        return (
                            <TouchableOpacity
                                key={purchase.id}
                                onPress={() => router.push(`/purchases/${purchase.id}` as any)}
                                activeOpacity={0.85}
                            >
                                <Card>
                                    {/* Purchase header row */}
                                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 14, textAlign: 'right' }}>
                                                {purchase.supplier?.name ?? `طلب #${purchase.id.slice(0, 8)}`}
                                            </Text>
                                            <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }}>
                                                {new Date(purchase.createdAt).toLocaleDateString('ar-EG', {
                                                    day: 'numeric', month: 'long', year: 'numeric',
                                                })}
                                            </Text>
                                        </View>
                                        <Badge label={label} variant={variant} />
                                    </View>

                                    {/* Details row */}
                                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ color: C.mutedForeground, fontSize: 12 }}>
                                            {purchase.items?.length ?? 0} صنف
                                        </Text>
                                        <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 15 }}>
                                            {(purchase.totalAmount ?? 0).toLocaleString()} د.ع
                                        </Text>
                                    </View>

                                    {/* Receive action for pending orders */}
                                    {isPending && (
                                        <TouchableOpacity
                                            style={{
                                                marginTop: 12,
                                                backgroundColor: C.primary,
                                                borderRadius: 10,
                                                paddingVertical: 10,
                                                alignItems: 'center',
                                                flexDirection: 'row-reverse',
                                                justifyContent: 'center',
                                                gap: 6,
                                            }}
                                            onPress={() => router.push(`/purchases/${purchase.id}/receive` as any)}
                                            activeOpacity={0.8}
                                        >
                                            <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                                            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                                                استلام الطلب
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </Card>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}
        </ScrollView>
    );
}
