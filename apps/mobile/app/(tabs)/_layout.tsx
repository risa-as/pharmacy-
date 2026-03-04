import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Platform, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { backgroundRequest } from '../../services/api';
import { pollingService } from '../../services/polling';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useSyncStatus } from '../../context/SyncContext';
import { Colors } from '../../constants/colors';

// Relative time helper (Arabic)
function timeAgoAr(date: Date): string {
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'الآن';
    if (mins < 60) return `منذ ${mins} د`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `منذ ${hrs} س`;
    return `منذ ${Math.floor(hrs / 24)} ي`;
}

// Custom Header — sync status dot + آخر تحديث label
const CustomHeader = ({ title }: { title: string }) => {
    const { isDarkMode } = useTheme();
    const { isSyncing, lastSyncedAt } = useSyncStatus();
    const C = Colors(isDarkMode);

    // Most recent sync across all tracked keys
    const lastSync = Object.values(lastSyncedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const dotColor = isSyncing ? C.warning : lastSync ? C.success : C.border;
    const syncLabel = isSyncing
        ? 'جاري التحديث...'
        : lastSync
            ? `آخر تحديث: ${timeAgoAr(lastSync)}`
            : '';

    return (
        <View
            style={{
                backgroundColor: C.card,
                paddingTop: Platform.OS === 'android' ? 40 : 50,
                paddingBottom: syncLabel ? 12 : 16,
                paddingHorizontal: 20,
                borderBottomWidth: 1,
                borderBottomColor: C.border,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 2,
                elevation: 2,
                zIndex: 100,
            }}
        >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 22, fontWeight: 'bold', color: C.foreground }}>{title}</Text>
                <TouchableOpacity
                    style={{ padding: 4, backgroundColor: C.primaryMuted, borderRadius: 50 }}
                >
                    <Ionicons name="person-circle-outline" size={32} color={C.primary} />
                </TouchableOpacity>
            </View>
            {syncLabel ? (
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 5 }}>
                    <View style={{
                        width: 7, height: 7, borderRadius: 4,
                        backgroundColor: dotColor,
                    }} />
                    <Text style={{ color: C.mutedForeground, fontSize: 11 }}>{syncLabel}</Text>
                </View>
            ) : null}
        </View>
    );
};

export default function TabLayout() {
    const [alertsCount, setAlertsCount] = useState(0);
    const { isDarkMode } = useTheme();
    const { isPharmacist, isLoading } = useAuth();
    const insets = useSafeAreaInsets();
    const { markSynced, setSyncing, registerTrigger } = useSyncStatus();
    const C = Colors(isDarkMode);

    useEffect(() => {
        if (isLoading) return;

        // ── Alerts / Notifications (30s) ──────────────────────────────────
        const fetchAlerts = async () => {
            setSyncing('alerts', true);
            try {
                const res = await backgroundRequest<{ unreadCount: number }>('/notifications/in-app?unread=1');
                setAlertsCount(res.unreadCount ?? 0);
                markSynced('alerts');
            } catch {
                setSyncing('alerts', false);
            }
        };

        pollingService.register('alerts', fetchAlerts, 30_000);
        registerTrigger('alerts', () => pollingService.trigger('alerts'));

        // ── Inventory low-stock heartbeat (2 min) ─────────────────────────
        // Screens watching SyncContext.lastSyncedAt.inventory can refetch locally
        const pingInventory = async () => {
            setSyncing('inventory', true);
            markSynced('inventory');
        };
        pollingService.register('inventory', pingInventory, 120_000);
        registerTrigger('inventory', () => pollingService.trigger('inventory'));

        // ── Dashboard stats heartbeat (5 min) ────────────────────────────
        const pingStats = async () => {
            setSyncing('stats', true);
            markSynced('stats');
        };
        pollingService.register('stats', pingStats, 300_000);
        registerTrigger('stats', () => pollingService.trigger('stats'));

        return () => pollingService.unregisterAll();
    }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

    if (isLoading) {
        return <View style={{ flex: 1, backgroundColor: C.background }} />;
    }

    return (
        <Tabs
            screenOptions={{
                headerShown: true,
                header: ({ options }) => <CustomHeader title={options.title || ''} />,
                tabBarActiveTintColor: C.primary,
                tabBarInactiveTintColor: C.mutedForeground,
                tabBarStyle: {
                    backgroundColor: C.card,
                    borderWidth: 1,
                    borderColor: C.border,
                    elevation: 10,
                    shadowColor: '#000',
                    shadowOpacity: 0.1,
                    shadowRadius: 10,
                    height: 65 + insets.bottom,
                    paddingBottom: insets.bottom + 8,
                    paddingTop: 8,
                    marginHorizontal: 16,
                    marginBottom: Platform.OS === 'android' ? 8 : 16,
                    borderRadius: 20,
                    position: 'absolute',
                },
                tabBarItemStyle: {
                    justifyContent: 'center',
                    alignItems: 'center',
                },
                tabBarLabelStyle: {
                    fontSize: 10,
                    marginTop: 4,
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'الرئيسية',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="home" size={size} color={color} />
                    ),
                }}
            />

            {/* Manager Tabs */}
            <Tabs.Screen
                name="reports"
                options={{
                    title: 'التقارير',
                    href: isPharmacist ? null : '/reports',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="stats-chart" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="sales"
                options={{
                    title: 'نقطة بيع',
                    href: isPharmacist ? '/sales' : null,
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="cart" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="debts"
                options={{
                    title: 'الديون',
                    href: isPharmacist ? '/debts' : null,
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="book" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="inventory"
                options={{
                    title: 'المخزون',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="cube" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="alerts"
                options={{
                    title: 'تنبيهات',
                    href: '/alerts',
                    tabBarBadge: alertsCount > 0 ? alertsCount : undefined,
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="notifications" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="smart-orders"
                options={{
                    title: 'الطلبات',
                    href: isPharmacist ? null : '/smart-orders',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="bulb" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="purchases"
                options={{
                    title: 'المشتريات',
                    href: isPharmacist ? null : '/purchases',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="receipt" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="settings"
                options={{
                    title: 'الإعدادات',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="settings" size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}
