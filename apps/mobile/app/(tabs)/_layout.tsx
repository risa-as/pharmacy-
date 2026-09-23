import { Tabs, router } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { AppIcon as Ionicons } from '../../components/ui/AppIcon';
import { View, Text, Platform, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { backgroundRequest } from '../../services/api';
import { pollingService } from '../../services/polling';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useSyncStatus } from '../../context/SyncContext';
import { Colors, Radius } from '../../constants/colors';
import { routePermission } from '../../utils/route-access';
import type { AppShell } from '../../utils/roles';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ── Tab definitions (navigation-map §2) ─────────────────────────────────────────
interface TabDef { route: string; label: string; icon: IconName; iconActive: IconName }

const TAB: Record<string, TabDef> = {
    index:     { route: 'index',     label: 'الرئيسية',   icon: 'home-outline',          iconActive: 'home' },
    reports:   { route: 'reports',   label: 'التقارير',   icon: 'stats-chart-outline',   iconActive: 'stats-chart' },
    inventory: { route: 'inventory', label: 'المخزون',    icon: 'cube-outline',          iconActive: 'cube' },
    alerts:    { route: 'alerts',    label: 'التنبيهات',  icon: 'notifications-outline', iconActive: 'notifications' },
    more:      { route: 'more',      label: 'المزيد',     icon: 'menu-outline',          iconActive: 'menu' },
    sales:     { route: 'sales',     label: 'نقطة البيع', icon: 'cart-outline',          iconActive: 'cart' },
    debts:     { route: 'debts',     label: 'الديون',     icon: 'hand-coins',            iconActive: 'hand-coins' },
};

/** Order is right-to-left on screen. */
const SHELL_TABS: Record<AppShell, TabDef[]> = {
    manager:    [TAB.index, TAB.reports, TAB.inventory, TAB.alerts, TAB.more],
    pharmacist: [TAB.index, TAB.sales, TAB.inventory, TAB.debts, TAB.more],
};

/**
 * Route → owning tab (navigation-map §11). Screens that are not a tab of the
 * current shell light up the tab that owns them instead of a random one.
 */
function ownerTab(routeName: string, shell: AppShell): string {
    const owned: Record<string, string> = shell === 'manager'
        ? { settings: 'more', purchases: 'more', 'smart-orders': 'more', debts: 'more', sales: 'more' }
        : { settings: 'more', alerts: 'more', reports: 'more', purchases: 'more', 'smart-orders': 'more' };
    return owned[routeName] ?? routeName;
}

/** Screens whose content is live data → show the sync chip in the header. */
const DATA_ROUTES = new Set(['index', 'reports', 'inventory', 'alerts', 'debts', 'purchases', 'smart-orders']);

// Relative time helper (Arabic)
function timeAgoAr(date: Date): string {
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'الآن';
    if (mins < 60) return `منذ ${mins} د`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `منذ ${hrs} س`;
    return `منذ ${Math.floor(hrs / 24)} ي`;
}

// ── Header — page title + sync status + (pharmacist home) bell + avatar ───────
const CustomHeader = ({ title, routeName, alertsCount }: { title: string; routeName: string; alertsCount: number }) => {
    const { isDarkMode } = useTheme();
    const { isSyncing, lastSyncedAt } = useSyncStatus();
    const { user, shell } = useAuth();
    const C = Colors(isDarkMode);
    const insets = useSafeAreaInsets();

    const lastSync = Object.values(lastSyncedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const synced = !isSyncing && !!lastSync;
    const chipColor = isSyncing ? C.warning : synced ? C.success : C.mutedForeground;
    const chipBg    = isSyncing ? C.warningBg : synced ? C.successBg : C.input;
    const chipIcon: IconName = isSyncing ? 'sync-outline' : synced ? 'cloud-done-outline' : 'cloud-offline-outline';
    const syncLabel = isSyncing ? 'جاري التحديث' : synced ? `آخر تحديث ${timeAgoAr(lastSync)}` : 'غير محدّث';

    const initial = user?.name?.trim().charAt(0).toUpperCase() ?? '';
    const showBell = shell === 'pharmacist' && routeName === 'index';

    return (
        <View
            style={{
                backgroundColor: C.background,
                paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 24 : 44) + 8,
                paddingBottom: 10,
                paddingHorizontal: 16,
            }}
        >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: C.foreground, textAlign: 'right' }} numberOfLines={1}>
                        {title}
                    </Text>
                    {DATA_ROUTES.has(routeName) && (
                        <View style={{
                            flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
                            alignSelf: 'flex-end', marginTop: 6,
                            backgroundColor: chipBg, borderRadius: Radius.badge,
                            paddingHorizontal: 8, paddingVertical: 4,
                        }}>
                            <Ionicons name={chipIcon} size={12} color={chipColor} />
                            <Text style={{ color: chipColor, fontSize: 11, fontWeight: '700' }}>{syncLabel}</Text>
                        </View>
                    )}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity
                        onPress={() => router.push('/(tabs)/more' as any)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="المزيد والحساب"
                        style={{
                            width: 46, height: 46, borderRadius: Radius.card,
                            backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        {initial
                            ? <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>{initial}</Text>
                            : <Ionicons name="person" size={20} color="#fff" />}
                    </TouchableOpacity>
                    {showBell && (
                        <TouchableOpacity
                            onPress={() => router.push('/(tabs)/alerts' as any)}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={`التنبيهات${alertsCount > 0 ? `، ${alertsCount} غير مقروء` : ''}`}
                            style={{
                                width: 46, height: 46, borderRadius: Radius.card,
                                backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
                                alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <Ionicons name="notifications-outline" size={22} color={C.primary} />
                            {alertsCount > 0 && <CountBadge count={alertsCount} color={C.danger} />}
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
};

function CountBadge({ count, color }: { count: number; color: string }) {
    return (
        <View style={{
            position: 'absolute', top: -4, right: -6, minWidth: 18, height: 18, borderRadius: 9,
            backgroundColor: color, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
        }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{count > 99 ? '99+' : count}</Text>
        </View>
    );
}

// ── Bottom bar — fixed per shell, colour marks the active owner tab ─────────────
function ShellTabBar({ state, navigation, shell, alertsCount }: BottomTabBarProps & { shell: AppShell; alertsCount: number }) {
    const {can} = useAuth();
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const insets = useSafeAreaInsets();
    const focusedName = state.routes[state.index]?.name ?? 'index';
    const activeKey = ownerTab(focusedName, shell);

    return (
        <View style={{
            flexDirection: 'row-reverse',
            backgroundColor: C.card,
            borderTopWidth: 1, borderTopColor: C.border,
            paddingTop: 8, paddingBottom: insets.bottom + 8,
        }}>
            {SHELL_TABS[shell].filter(tab => { const permission=routePermission('/'+tab.route);return !permission||can(permission);}).map(tab => {
                const active = tab.route === activeKey;
                const color = active ? C.primary : C.mutedForeground;
                // Pharmacist alerts live under «المزيد» — its badge moves there too.
                const badge = (shell === 'manager' && tab.route === 'alerts') || (shell === 'pharmacist' && tab.route === 'more')
                    ? alertsCount : 0;
                return (
                    <TouchableOpacity
                        key={tab.route}
                        onPress={() => {
                            const route = state.routes.find(r => r.name === tab.route);
                            const event = route
                                ? navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                                : null;
                            if (!event?.defaultPrevented) navigation.navigate(tab.route as never);
                        }}
                        activeOpacity={0.8}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={badge > 0 ? `${tab.label}، ${badge} تنبيه` : tab.label}
                        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}
                    >
                        <View>
                            <Ionicons name={active ? tab.iconActive : tab.icon} size={24} color={color} />
                            {badge > 0 && <CountBadge count={badge} color={C.danger} />}
                        </View>
                        <Text style={{ color, fontSize: 11.5, fontWeight: active ? '800' : '600' }}>{tab.label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

export default function TabLayout() {
    const [alertsCount, setAlertsCount] = useState(0);
    const { isDarkMode } = useTheme();
    const { shell, isLoading } = useAuth();
    const { markSynced, setSyncing, registerTrigger } = useSyncStatus();
    const C = Colors(isDarkMode);

    useEffect(() => {
        if (isLoading) return;

        // ── Alerts / Notifications (30s) — real unread count ────────────────
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
            tabBar={(props) => <ShellTabBar {...props} shell={shell} alertsCount={alertsCount} />}
            screenOptions={({ route }) => ({
                headerShown: true,
                header: ({ options }) => (
                    <CustomHeader title={options.title || ''} routeName={route.name} alertsCount={alertsCount} />
                ),
                sceneStyle: { backgroundColor: C.background },
            })}
        >
            <Tabs.Screen name="index" options={{ title: 'الرئيسية' }} />
            <Tabs.Screen name="reports" options={{ title: 'التقارير' }} />
            <Tabs.Screen name="sales" options={{ title: 'نقطة البيع', headerShown: false }} />
            <Tabs.Screen name="debts" options={{ title: 'الديون', headerShown: false }} />
            <Tabs.Screen name="inventory" options={{ title: 'المخزون', headerShown: false }} />
            <Tabs.Screen name="alerts" options={{ title: 'التنبيهات', headerShown: false }} />
            <Tabs.Screen name="smart-orders" options={{ title: 'الطلبات الذكية', headerShown: false }} />
            <Tabs.Screen name="purchases" options={{ title: 'المشتريات', headerShown: false }} />
            <Tabs.Screen name="more" options={{ title: 'المزيد' }} />
            <Tabs.Screen name="settings" options={{ title: 'الإعدادات' }} />
        </Tabs>
    );
}
