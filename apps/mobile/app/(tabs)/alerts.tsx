import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { request, apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { BranchSelector } from '../../components/BranchSelector';
import { useSyncStatus } from '../../context/SyncContext';

interface Notification {
    id: string;
    title: string;
    body: string;
    type: 'LOW_STOCK' | 'EXPIRY' | 'EXPIRED' | 'OUT_OF_STOCK' | 'NEW_PURCHASE' | 'SYSTEM';
    isRead: boolean;
    createdAt: string;
}

const TYPE_CONFIG: Record<string, {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    variant: 'danger' | 'warning' | 'info' | 'success';
    label: string;
}> = {
    OUT_OF_STOCK: { icon: 'close-circle',      variant: 'danger',  label: 'نفاد تام' },
    EXPIRED:      { icon: 'skull',             variant: 'danger',  label: 'منتهي الصلاحية' },
    LOW_STOCK:    { icon: 'alert-circle',      variant: 'warning', label: 'نقص مخزون' },
    EXPIRY:       { icon: 'time',              variant: 'warning', label: 'قرب الانتهاء' },
    NEW_PURCHASE: { icon: 'receipt',           variant: 'info',    label: 'طلب شراء' },
    SYSTEM:       { icon: 'information-circle', variant: 'success', label: 'نظام' },
};

export default function AlertsScreen() {
    const { isDarkMode } = useTheme();
    const { isAdmin, branchId: authBranchId } = useAuth();
    const { triggerSync } = useSyncStatus();
    const C = Colors(isDarkMode);

    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    // Admin can filter by branch; pharmacists are always scoped to their own branch.
    const [selectedBranch, setSelectedBranch] = useState<string | null>(
        isAdmin ? null : (authBranchId ?? null)
    );

    const fetchNotifications = useCallback(async () => {
        try {
            const effectiveBranch = isAdmin ? selectedBranch : authBranchId;
            const query = effectiveBranch ? `?branchId=${effectiveBranch}` : '';

            // Fetch both: stored in-app notifications AND real-time inventory alerts
            const [res, inventoryAlerts] = await Promise.all([
                request<{ notifications: Notification[]; unreadCount: number }>(
                    `/notifications/in-app${query}`,
                ).catch(() => ({ notifications: [] as Notification[], unreadCount: 0 })),
                apiService.getAlerts(effectiveBranch ?? undefined).catch(() => [] as any[]),
            ]);

            // Convert inventory/expiry alerts to the Notification shape
            // API returns explicit types: OUT_OF_STOCK, EXPIRED, LOW_STOCK, EXPIRY
            const inventoryAsNotifications: Notification[] = (inventoryAlerts as any[]).map((a: any) => ({
                id: `inv-${a.id}`,
                title: a.title ?? '',
                body: `${a.description ?? ''}${a.date ? `\n${a.date}` : ''}`,
                type: (a.type as Notification['type']) ?? 'SYSTEM',
                isRead: false,
                createdAt: new Date().toISOString(),
            }));

            // Inventory alerts shown first, then stored in-app notifications
            const merged = [...inventoryAsNotifications, ...(Array.isArray(res.notifications) ? res.notifications : [])];
            setNotifications(merged);
            setUnreadCount((res.unreadCount ?? 0) + inventoryAsNotifications.length);
        } catch (error) {
            console.error('AlertsScreen: fetch error', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [isAdmin, selectedBranch, authBranchId]);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    const onRefresh = useCallback(() => { setRefreshing(true); triggerSync('alerts'); fetchNotifications(); }, [fetchNotifications, triggerSync]);

    const handleMarkRead = useCallback(async (id: string) => {
        // Optimistic update
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
        // Inventory alerts (id starts with "inv-") don't persist read status in DB
        if (id.startsWith('inv-')) return;
        try {
            await request('/notifications/in-app', {
                method: 'POST',
                body: JSON.stringify({ ids: [id] }),
            });
        } catch {
            // Silent — already updated optimistically
        }
    }, []);

    const handleMarkAllRead = useCallback(async () => {
        if (unreadCount === 0) return;
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
        // Only mark stored in-app notifications (not inventory alerts) as read in DB
        try {
            await request('/notifications/in-app', {
                method: 'POST',
                body: JSON.stringify({ all: true }),
            });
        } catch (e) {
            Alert.alert('خطأ', 'فشل تحديث الإشعارات');
            fetchNotifications(); // re-sync on failure
        }
    }, [unreadCount, fetchNotifications]);

    const timeAgo = (iso: string) => {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'الآن';
        if (mins < 60) return `منذ ${mins} دقيقة`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `منذ ${hrs} ساعة`;
        return `منذ ${Math.floor(hrs / 24)} يوم`;
    };

    const renderItem = ({ item }: { item: Notification }) => {
        const config = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.SYSTEM;
        return (
            <TouchableOpacity activeOpacity={item.isRead ? 1 : 0.7} onPress={() => !item.isRead && handleMarkRead(item.id)}>
                <Card className={`mb-3 ${!item.isRead ? 'border-l-4' : ''}`}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 }}>
                        {/* Icon circle */}
                        <View style={{
                            backgroundColor: item.isRead ? C.border : `${C[config.variant === 'danger' ? 'dangerBg' : config.variant === 'warning' ? 'warningBg' : config.variant === 'info' ? 'infoBg' : 'successBg']}`,
                            borderRadius: 12, padding: 10, flexShrink: 0,
                        }}>
                            <Ionicons
                                name={config.icon}
                                size={20}
                                color={item.isRead ? C.mutedForeground : C[config.variant]}
                            />
                        </View>

                        {/* Content */}
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <Text style={{
                                    color: item.isRead ? C.mutedForeground : C.foreground,
                                    fontWeight: item.isRead ? '500' : '700',
                                    fontSize: 14, textAlign: 'right', flex: 1,
                                }} numberOfLines={2}>
                                    {item.title}
                                </Text>
                                {!item.isRead && (
                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, marginLeft: 8, flexShrink: 0 }} />
                                )}
                            </View>
                            <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginBottom: 8 }} numberOfLines={2}>
                                {item.body}
                            </Text>
                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Badge label={config.label} variant={config.variant} />
                                <Text style={{ color: C.mutedForeground, fontSize: 11 }}>{timeAgo(item.createdAt)}</Text>
                            </View>
                        </View>
                    </View>
                </Card>
            </TouchableOpacity>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {/* Header bar */}
            <View style={{ backgroundColor: C.background, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 16 }}>الإشعارات</Text>
                        {unreadCount > 0 && (
                            <View style={{ backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{unreadCount}</Text>
                            </View>
                        )}
                    </View>
                    {unreadCount > 0 && (
                        <TouchableOpacity onPress={handleMarkAllRead}>
                            <Text style={{ color: C.primary, fontSize: 13, fontWeight: '600' }}>تحديد الكل كمقروء</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Branch selector — admin only */}
            {isAdmin && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                    <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} />
                </View>
            )}

            {loading && !refreshing ? (
                <View style={{ padding: 16, gap: 12 }}>
                    {[1, 2, 3, 4].map(i => (
                        <Skeleton key={i} height={88} radius={16} />
                    ))}
                </View>
            ) : (
                <FlatList
                    data={notifications}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 110 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                    ListEmptyComponent={
                        <EmptyState
                            icon="notifications-outline"
                            title="لا توجد إشعارات"
                            subtitle="ستظهر هنا إشعارات المخزون والصلاحيات والمشتريات"
                        />
                    }
                />
            )}
        </View>
    );
}
