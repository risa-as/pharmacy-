import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { router, Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { request, apiService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Radius } from '../../constants/colors';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { usePalette, toneColors, Surface, IconTile, SegmentedTabs, AppButton, InfoNote, StateBlock, Tone } from '../../components/ui/Kit';
import { Skeleton } from '../../components/ui/Skeleton';
import { BranchSelector } from '../../components/BranchSelector';
import { useSyncStatus } from '../../context/SyncContext';
import { formatDate, formatTime, iraqDateString, todayIraq } from '../../utils/date';

interface Notification {
    id: string;
    title: string;
    body: string;
    type: 'LOW_STOCK' | 'EXPIRY' | 'EXPIRED' | 'OUT_OF_STOCK' | 'NEW_PURCHASE' | 'SYSTEM';
    isRead: boolean;
    createdAt: string;
    /** Drug this alert is about, so tapping opens it in the inventory. */
    drugName?: string | null;
}

/** Server notifications keep the drug in the title: "مخزون منخفض: Panadol". */
function drugFromTitle(title: string): string | null {
    const i = title.indexOf(':');
    const name = i > -1 ? title.slice(i + 1).trim() : '';
    return name || null;
}

type FilterKey = 'all' | 'critical' | 'warning' | 'info';

const TYPE_CONFIG: Record<string, {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    variant: 'danger' | 'warning' | 'info' | 'success';
    label: string;
}> = {
    OUT_OF_STOCK: { icon: 'close-circle',       variant: 'danger',  label: 'نفاد تام' },
    EXPIRED:      { icon: 'ban',                variant: 'danger',  label: 'منتهي الصلاحية' },
    LOW_STOCK:    { icon: 'alert-circle',       variant: 'warning', label: 'نقص مخزون' },
    EXPIRY:       { icon: 'time',               variant: 'warning', label: 'قرب الانتهاء' },
    NEW_PURCHASE: { icon: 'cart',               variant: 'info',    label: 'طلب شراء' },
    SYSTEM:       { icon: 'information-circle', variant: 'success', label: 'النظام' },
};

/** Lower = more severe (navigation-map §12: red critical, orange warning). */
const SEVERITY: Record<string, number> = { OUT_OF_STOCK: 0, EXPIRED: 0, LOW_STOCK: 1, EXPIRY: 1, NEW_PURCHASE: 2, SYSTEM: 3 };

const FILTER_TABS: { key: FilterKey; label: string; types: Notification['type'][] }[] = [
    { key: 'all',      label: 'الكل',   types: [] },
    { key: 'critical', label: 'حرج',    types: ['OUT_OF_STOCK', 'EXPIRED'] },
    { key: 'warning',  label: 'تحذير',  types: ['LOW_STOCK', 'EXPIRY'] },
    { key: 'info',     label: 'أخرى',   types: ['NEW_PURCHASE', 'SYSTEM'] },
];

// ── Read-state persistence for virtual inventory alerts ─────────────────────────
// Inventory/expiry/stock alerts (ids prefixed `inv-`) are derived live from the
// inventory on every fetch — the server has no per-alert read flag for them. So
// we remember which ones the user marked read in local storage and re-apply that
// on each fetch; otherwise "mark as read" never sticks across reloads.
const READ_INV_ALERTS_KEY = 'read_inventory_alerts';

async function loadReadInvIds(): Promise<Set<string>> {
    try {
        const raw = await AsyncStorage.getItem(READ_INV_ALERTS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(arr) ? arr : []);
    } catch {
        return new Set();
    }
}

async function saveReadInvIds(ids: Set<string>): Promise<void> {
    try {
        await AsyncStorage.setItem(READ_INV_ALERTS_KEY, JSON.stringify([...ids]));
    } catch { /* ignore */ }
}

async function addReadInvIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const current = await loadReadInvIds();
    ids.forEach(id => current.add(id));
    await saveReadInvIds(current);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/** "اليوم، 10:24 ص" — day word plus clock time, like the design. */
function alertTime(iso: string): string {
    const time = formatTime(iso, { hour: '2-digit', minute: '2-digit' });
    const day = iraqDateString(iso);
    const today = todayIraq();
    if (day === today) return `اليوم، ${time}`;
    const yesterday = iraqDateString(new Date(Date.now() - 86_400_000).toISOString());
    if (day === yesterday) return `أمس، ${time}`;
    return `${formatDate(iso, { day: 'numeric', month: 'long' })}، ${time}`;
}

// ═════════════════════════════════════════════════════════════════════════════
export default function AlertsScreen() {
    const { isAdmin, isPharmacistShell, branchId: authBranchId } = useAuth();
    const { triggerSync } = useSyncStatus();
    const C = usePalette();

    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount]     = useState(0);
    const [loading, setLoading]             = useState(true);
    const [refreshing, setRefreshing]       = useState(false);
    const [filterKey, setFilterKey]         = useState<FilterKey>('all');
    const [selectedBranch, setSelectedBranch] = useState<string | null>(
        isAdmin ? null : (authBranchId ?? null)
    );

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchNotifications = useCallback(async () => {
        try {
            const effectiveBranch = isAdmin ? selectedBranch : authBranchId;
            const query = effectiveBranch ? `?branchId=${effectiveBranch}` : '';

            const [res, inventoryAlerts, readInvIds] = await Promise.all([
                request<{ notifications: Notification[]; unreadCount: number }>(
                    `/notifications/in-app${query}`,
                ).catch(() => ({ notifications: [] as Notification[], unreadCount: 0 })),
                apiService.getAlerts(effectiveBranch ?? undefined).catch(() => [] as any[]),
                loadReadInvIds(),
            ]);

            const inventoryAsNotifications: Notification[] = (inventoryAlerts as any[]).map((a: any) => {
                const id = `inv-${a.id}`;
                return {
                    id,
                    title: a.title ?? '',
                    body: `${a.description ?? ''}${a.date ? `\n${a.date}` : ''}`,
                    type: (a.type as Notification['type']) ?? 'SYSTEM',
                    isRead: readInvIds.has(id),
                    createdAt: new Date().toISOString(),
                    drugName: a.drugName ?? drugFromTitle(a.title ?? ''),
                };
            });

            // Drop stored read-ids for alerts that no longer exist (resolved
            // conditions) so the set doesn't grow unbounded over time.
            const presentIds = new Set(inventoryAsNotifications.map(n => n.id));
            if ([...readInvIds].some(id => !presentIds.has(id))) {
                await saveReadInvIds(new Set([...readInvIds].filter(id => presentIds.has(id))));
            }

            const merged = [...inventoryAsNotifications, ...(Array.isArray(res.notifications) ? res.notifications : [])];
            setNotifications(merged);
            const unreadInv = inventoryAsNotifications.filter(n => !n.isRead).length;
            setUnreadCount((res.unreadCount ?? 0) + unreadInv);
        } catch (error) {
            console.error('AlertsScreen fetch error', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [isAdmin, selectedBranch, authBranchId]);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        triggerSync('alerts');
        fetchNotifications();
    }, [fetchNotifications, triggerSync]);

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleMarkRead = useCallback(async (id: string) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
        if (id.startsWith('inv-')) {
            addReadInvIds([id]); // virtual alert → persist read state locally
            return;
        }
        try {
            await request('/notifications/in-app', {
                method: 'POST',
                body: JSON.stringify({ ids: [id] }),
            });
        } catch { /* silent optimistic */ }
    }, []);

    const handleMarkAllRead = useCallback(async () => {
        if (unreadCount === 0) return;
        // Persist read state of all currently-unread virtual inventory alerts.
        const invIds = notifications.filter(n => n.id.startsWith('inv-') && !n.isRead).map(n => n.id);
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
        addReadInvIds(invIds);
        try {
            await request('/notifications/in-app', {
                method: 'POST',
                body: JSON.stringify({ all: true }),
            });
        } catch {
            Alert.alert('خطأ', 'فشل تحديث الإشعارات');
            fetchNotifications();
        }
    }, [unreadCount, notifications, fetchNotifications]);

    // ── Derived data ──────────────────────────────────────────────────────────
    // Pharmacists cannot open manager purchase orders — those notifications are not listed for them.
    const visibleNotifications = useMemo(
        () => (isPharmacistShell ? notifications.filter(n => n.type !== 'NEW_PURCHASE') : notifications),
        [notifications, isPharmacistShell],
    );

    const filterCounts = useMemo(() => {
        const by = (keys: string[]) => visibleNotifications.filter(n => keys.includes(n.type)).length;
        const critical = by(['OUT_OF_STOCK', 'EXPIRED']);
        const warning = by(['LOW_STOCK', 'EXPIRY']);
        return { all: visibleNotifications.length, critical, warning, info: visibleNotifications.length - critical - warning };
    }, [visibleNotifications]);

    // Severity first, then newest.
    const list = useMemo(() => {
        const tab = FILTER_TABS.find(t => t.key === filterKey)!;
        let rows = visibleNotifications;
        if (filterKey === 'info') rows = rows.filter(n => !['OUT_OF_STOCK', 'EXPIRED', 'LOW_STOCK', 'EXPIRY'].includes(n.type));
        else if (filterKey !== 'all') rows = rows.filter(n => (tab.types as string[]).includes(n.type));
        return [...rows].sort((a, b) =>
            (SEVERITY[a.type] ?? 3) - (SEVERITY[b.type] ?? 3) ||
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [visibleNotifications, filterKey]);

    const openTarget = (item: Notification) => {
        if (!item.isRead) handleMarkRead(item.id);
        if (['LOW_STOCK', 'EXPIRY', 'EXPIRED', 'OUT_OF_STOCK'].includes(item.type)) {
            // Open the drug itself, not just the inventory page.
            const drug = item.drugName ?? drugFromTitle(item.title ?? '');
            router.push((drug
                ? { pathname: '/(tabs)/inventory', params: { search: drug, tab: 'all' } }
                : '/(tabs)/inventory') as unknown as Href);
        } else if (item.type === 'NEW_PURCHASE' && !isPharmacistShell) {
            router.push('/(tabs)/purchases' as Href);
        }
    };

    const actionLabel = (item: Notification): string | null => {
        if (['LOW_STOCK', 'EXPIRY', 'EXPIRED', 'OUT_OF_STOCK'].includes(item.type)) return 'عرض في المخزون';
        if (item.type === 'NEW_PURCHASE' && !isPharmacistShell) return 'فتح المشتريات';
        return null;
    };

    const renderItem = ({ item }: { item: Notification }) => {
        const config = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.SYSTEM;
        const tone: Tone = config.variant === 'danger' ? 'danger' : config.variant === 'warning' ? 'warning' : 'primary';
        const { fg } = toneColors(C, tone);
        const opens = !!actionLabel(item);
        // The description arrives as "text\ndate"; the date line is shown as the time below.
        const description = (item.body ?? '').split('\n')[0]?.trim();
        return (
            <TouchableOpacity
                onPress={() => (opens ? openTarget(item) : handleMarkRead(item.id))}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}${description ? `، ${description}` : ''}`}
            >
                <Surface padded={false} style={{ marginBottom: 10, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
                    <IconTile icon={config.icon} tone={item.isRead ? 'neutral' : tone} size={46} />
                    <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: item.isRead ? C.mutedForeground : C.foreground, fontSize: 16, fontWeight: item.isRead ? '700' : '900', textAlign: 'right' }} numberOfLines={1}>
                            {item.title}
                        </Text>
                        {!!description && (
                            <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right' }} numberOfLines={2}>
                                {description}
                            </Text>
                        )}
                        <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right' }}>{alertTime(item.createdAt)}</Text>
                    </View>
                    <View style={{ alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: item.isRead ? 'transparent' : fg }} />
                        {item.type === 'NEW_PURCHASE' && !isPharmacistShell ? (
                            <AppButton label="فتح" variant="outline" compact onPress={() => openTarget(item)} />
                        ) : opens ? (
                            <Ionicons name="chevron-back" size={18} color={C.mutedForeground} />
                        ) : null}
                    </View>
                </Surface>
            </TouchableOpacity>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <ScreenHeader
                title="التنبيهات"
                subtitle={isPharmacistShell ? 'فرعك الحالي' : undefined}
                hideBack={!isPharmacistShell}
                fallbackHref="/(tabs)/more"
                action={isAdmin ? (
                    <View style={{ width: 170 }}>
                        <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} hideIfSingle label="الفرع" />
                    </View>
                ) : undefined}
            />

            <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 10 }}>
                <SegmentedTabs<FilterKey>
                    items={FILTER_TABS.map(t => ({ key: t.key, label: t.label, count: filterCounts[t.key] }))}
                    value={filterKey}
                    onChange={setFilterKey}
                />

                {unreadCount > 0 && (
                    <TouchableOpacity onPress={handleMarkAllRead} activeOpacity={0.8} accessibilityRole="button">
                        <Surface padded={false} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
                            <Text style={{ flex: 1, color: C.primary, fontSize: 15.5, fontWeight: '800', textAlign: 'right' }}>تحديد الكل كمقروء</Text>
                            <View style={{ width: 38, height: 38, borderRadius: Radius.control, backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="checkmark" size={20} color={C.primary} />
                            </View>
                        </Surface>
                    </TouchableOpacity>
                )}
            </View>

            {loading && !refreshing ? (
                <View style={{ padding: 16, gap: 10 }}>
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} height={120} radius={Radius.card} />)}
                </View>
            ) : (
                <FlatList
                    data={list}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ flexGrow: list.length === 0 ? 1 : 0, padding: 16, paddingTop: 6, paddingBottom: 32 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                    ListFooterComponent={list.length > 0 ? <InfoNote style={{ marginTop: 4 }} text="قراءة التنبيه تغيّر حالة القراءة فقط، ولا تعني أن المشكلة حُلّت." /> : null}
                    ListEmptyComponent={
                        <StateBlock
                            icon="notifications-outline"
                            title="لا توجد تنبيهات"
                            message={filterKey !== 'all' ? 'لا توجد تنبيهات في هذه الفئة' : 'ستظهر هنا تنبيهات المخزون والصلاحية'}
                        />
                    }
                />
            )}
        </View>
    );
}
