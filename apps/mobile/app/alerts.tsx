import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/colors';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';

interface Alert {
    id: string;
    message?: string;
    drugName?: string;
    type?: string;
    date?: string;
    createdAt?: string;
}

export default function AlertsScreen() {
    const { isDarkMode } = useTheme();
    const { branchId } = useAuth();
    const C = Colors(isDarkMode);

    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchAlerts = useCallback(async () => {
        try {
            const data = await apiService.getAlerts(branchId ?? undefined);
            setAlerts(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('AlertsScreen: fetch error', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [branchId]);

    useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

    const onRefresh = useCallback(() => { setRefreshing(true); fetchAlerts(); }, [fetchAlerts]);

    const typeVariant = (type?: string): 'danger' | 'warning' | 'info' => {
        if (type === 'LOW_STOCK') return 'danger';
        if (type === 'EXPIRY')    return 'warning';
        return 'info';
    };

    const typeLabel = (type?: string): string => {
        if (type === 'LOW_STOCK') return 'نقص مخزون';
        if (type === 'EXPIRY')    return 'قرب الانتهاء';
        return 'تنبيه';
    };

    const renderItem = ({ item }: { item: Alert }) => (
        <Card className="mb-3">
            <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 }}>
                <View style={{
                    backgroundColor: item.type === 'LOW_STOCK' ? C.dangerBg : C.warningBg,
                    borderRadius: 10, padding: 8, flexShrink: 0,
                }}>
                    <Ionicons
                        name={item.type === 'LOW_STOCK' ? 'alert-circle' : 'time-outline'}
                        size={20}
                        color={item.type === 'LOW_STOCK' ? C.danger : C.warning}
                    />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: C.foreground, fontWeight: '600', fontSize: 14, textAlign: 'right' }} numberOfLines={2}>
                        {item.drugName ?? item.message ?? 'تنبيه'}
                    </Text>
                    {(item.date || item.createdAt) && (
                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 4 }}>
                            {new Date(item.date ?? item.createdAt!).toLocaleDateString('ar-EG', {
                                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                            })}
                        </Text>
                    )}
                    {item.type && (
                        <View style={{ marginTop: 6 }}>
                            <Badge label={typeLabel(item.type)} variant={typeVariant(item.type)} />
                        </View>
                    )}
                </View>
            </View>
        </Card>
    );

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {loading && !refreshing ? (
                <View style={{ padding: 16, gap: 10 }}>
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} height={80} radius={16} />)}
                </View>
            ) : (
                <FlatList
                    data={alerts}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
                    }
                    ListEmptyComponent={
                        <EmptyState
                            icon="notifications-off-outline"
                            title="لا توجد تنبيهات"
                            subtitle="المخزون والصلاحيات تحت السيطرة"
                        />
                    }
                />
            )}
        </View>
    );
}
