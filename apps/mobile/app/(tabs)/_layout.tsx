import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Platform, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { backgroundRequest } from '../../services/api';
import { pollingService } from '../../services/polling';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useSyncStatus } from '../../context/SyncContext';
import { Colors, managerPalette, Radius } from '../../constants/colors';

// Relative time helper (Arabic)
function timeAgoAr(date: Date): string {
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'الآن';
    if (mins < 60) return `منذ ${mins} د`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `منذ ${hrs} س`;
    return `منذ ${Math.floor(hrs / 24)} ي`;
}

// Custom Header — page title + sync status ("آخر تحديث") + user avatar.
const CustomHeader = ({ title }: { title: string }) => {
    const { isDarkMode } = useTheme();
    const { isSyncing, lastSyncedAt } = useSyncStatus();
    const { user } = useAuth();
    const C = managerPalette(isDarkMode);

    // Most recent sync across all tracked keys
    const lastSync = Object.values(lastSyncedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const synced = !isSyncing && !!lastSync;
    const chipColor = isSyncing ? C.warning : synced ? C.success : C.mutedForeground;
    const chipBg    = isSyncing ? C.warningBg : synced ? C.successBg : C.input;
    const chipIcon: keyof typeof Ionicons.glyphMap = isSyncing ? 'sync-outline' : synced ? 'cloud-done-outline' : 'cloud-offline-outline';
    const syncLabel = isSyncing ? 'جاري التحديث' : synced ? `آخر تحديث ${timeAgoAr(lastSync)}` : 'غير محدّث';

    const initial = user?.name?.trim().charAt(0).toUpperCase() ?? '';

    return (
        <View
            style={{
                backgroundColor: C.card,
                paddingTop: Platform.OS === 'android' ? 38 : 50,
                paddingBottom: 14,
                paddingHorizontal: 20,
                borderBottomWidth: 1,
                borderBottomColor: C.border,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.04,
                shadowRadius: 6,
                elevation: 2,
                zIndex: 100,
            }}
        >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Title + sync chip */}
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 22, fontWeight: '900', color: C.foreground, textAlign: 'right', letterSpacing: 0.2 }}>
                        {title}
                    </Text>
                    <View style={{
                        flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
                        alignSelf: 'flex-end', marginTop: 6,
                        backgroundColor: chipBg, borderRadius: Radius.xs,
                        paddingHorizontal: 8, paddingVertical: 4,
                    }}>
                        <Ionicons name={chipIcon} size={11} color={chipColor} />
                        <Text style={{ color: chipColor, fontSize: 10.5, fontWeight: '700' }}>{syncLabel}</Text>
                    </View>
                </View>

                {/* Avatar → settings */}
                <TouchableOpacity
                    onPress={() => router.push('/(tabs)/settings' as any)}
                    activeOpacity={0.8}
                    style={{
                        width: 44, height: 44, borderRadius: Radius.sm,
                        backgroundColor: C.primary,
                        alignItems: 'center', justifyContent: 'center',
                        shadowColor: C.primary, shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
                    }}
                >
                    {initial
                        ? <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>{initial}</Text>
                        : <Ionicons name="person" size={20} color="#fff" />}
                    {/* Presence dot */}
                    <View style={{
                        position: 'absolute', bottom: -2, left: -2,
                        width: 14, height: 14, borderRadius: 7,
                        backgroundColor: C.success, borderWidth: 2.5, borderColor: C.card,
                    }} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

/** Tab icon — active glyph is slightly larger and tinted with the brand colour. */
function TabBarIcon({ name, color, focused }: { name: keyof typeof Ionicons.glyphMap; color: string; focused: boolean }) {
    return <Ionicons name={name} size={focused ? 24 : 22} color={color} />;
}

export default function TabLayout() {
    const [alertsCount, setAlertsCount] = useState(0);
    const { isDarkMode } = useTheme();
    const { isPharmacist, isLoading } = useAuth();
    const insets = useSafeAreaInsets();
    const { markSynced, setSyncing, registerTrigger } = useSyncStatus();
    const C = Colors(isDarkMode);
    // Medical-blue brand accent for the navigation bar (matches manager dashboard).
    const brand = isDarkMode ? '#3B8FD6' : '#1E6FBF';

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
                tabBarActiveTintColor: brand,
                tabBarInactiveTintColor: C.mutedForeground,
                tabBarStyle: {
                    backgroundColor: C.card,
                    borderTopWidth: 1,
                    borderTopColor: C.border,
                    elevation: 0,
                    shadowColor: '#000',
                    shadowOpacity: 0.08,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: -3 },
                    height: 60 + insets.bottom,
                    paddingBottom: insets.bottom + 8,
                    paddingTop: 8,
                },
                tabBarItemStyle: {
                    justifyContent: 'center',
                    alignItems: 'center',
                },
                tabBarLabelStyle: {
                    fontSize: 10,
                    fontWeight: '700',
                    marginTop: 3,
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'الرئيسية',
                    tabBarIcon: ({ color, focused }) => (
                        <TabBarIcon name="home" color={color} focused={focused} />
                    ),
                }}
            />

            {/* Manager Tabs */}
            <Tabs.Screen
                name="reports"
                options={{
                    title: 'التقارير',
                    href: isPharmacist ? null : '/reports',
                    tabBarIcon: ({ color, focused }) => (
                        <TabBarIcon name="stats-chart" color={color} focused={focused} />
                    ),
                }}
            />

            <Tabs.Screen
                name="sales"
                options={{
                    title: 'نقطة بيع',
                    href: isPharmacist ? '/sales' : null,
                    tabBarIcon: ({ color, focused }) => (
                        <TabBarIcon name="cart" color={color} focused={focused} />
                    ),
                }}
            />

            <Tabs.Screen
                name="debts"
                options={{
                    title: 'الديون',
                    href: isPharmacist ? '/debts' : null,
                    tabBarIcon: ({ color, focused }) => (
                        <TabBarIcon name="book" color={color} focused={focused} />
                    ),
                }}
            />

            <Tabs.Screen
                name="inventory"
                options={{
                    title: 'المخزون',
                    tabBarIcon: ({ color, focused }) => (
                        <TabBarIcon name="cube" color={color} focused={focused} />
                    ),
                }}
            />

            <Tabs.Screen
                name="alerts"
                options={{
                    title: 'تنبيهات',
                    href: '/alerts',
                    tabBarBadge: alertsCount > 0 ? alertsCount : undefined,
                    tabBarIcon: ({ color, focused }) => (
                        <TabBarIcon name="notifications" color={color} focused={focused} />
                    ),
                }}
            />

            <Tabs.Screen
                name="smart-orders"
                options={{
                    title: 'الطلبات',
                    href: isPharmacist ? null : '/smart-orders',
                    tabBarIcon: ({ color, focused }) => (
                        <TabBarIcon name="bulb" color={color} focused={focused} />
                    ),
                }}
            />

            <Tabs.Screen
                name="purchases"
                options={{
                    title: 'المشتريات',
                    href: isPharmacist ? null : '/purchases',
                    tabBarIcon: ({ color, focused }) => (
                        <TabBarIcon name="receipt" color={color} focused={focused} />
                    ),
                }}
            />

            <Tabs.Screen
                name="settings"
                options={{
                    title: 'الإعدادات',
                    tabBarIcon: ({ color, focused }) => (
                        <TabBarIcon name="settings" color={color} focused={focused} />
                    ),
                }}
            />
        </Tabs>
    );
}
