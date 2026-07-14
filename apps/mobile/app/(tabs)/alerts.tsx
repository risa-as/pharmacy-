import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View, Text, SectionList, TouchableOpacity,
    RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { request, apiService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { managerPalette, Radius } from '../../constants/colors';
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

const FILTER_TABS: { key: FilterKey; label: string; types: Notification['type'][] }[] = [
    { key: 'all',      label: 'الكل',   types: [] },
    { key: 'critical', label: 'حرج',    types: ['OUT_OF_STOCK', 'EXPIRED'] },
    { key: 'warning',  label: 'تحذير',  types: ['LOW_STOCK', 'EXPIRY'] },
    { key: 'info',     label: 'أخرى',   types: ['NEW_PURCHASE', 'SYSTEM'] },
];

// ── Group flat list by relative date ─────────────────────────────────────────
function groupByDate(items: Notification[]): { title: string; data: Notification[] }[] {
    const todayMs    = new Date().setHours(0, 0, 0, 0);
    const yesterMs   = todayMs - 86_400_000;
    const weekMs     = todayMs - 7 * 86_400_000;

    const buckets: Record<string, Notification[]> = {
        'اليوم': [], 'أمس': [], 'هذا الأسبوع': [], 'أقدم': [],
    };

    for (const n of items) {
        const ts = new Date(n.createdAt).getTime();
        if (ts >= todayMs)       buckets['اليوم'].push(n);
        else if (ts >= yesterMs) buckets['أمس'].push(n);
        else if (ts >= weekMs)   buckets['هذا الأسبوع'].push(n);
        else                     buckets['أقدم'].push(n);
    }

    return Object.entries(buckets)
        .filter(([, data]) => data.length > 0)
        .map(([title, data]) => ({ title, data }));
}

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
function timeAgo(iso: string): string {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 1)  return 'الآن';
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `منذ ${hrs} ساعة`;
    return `منذ ${Math.floor(hrs / 24)} يوم`;
}

// ── Color helpers ─────────────────────────────────────────────────────────────
type Variant = 'danger' | 'warning' | 'info' | 'success';
function variantColor(C: ReturnType<typeof managerPalette>, v: Variant) {
    return { color: C[v], bg: C[`${v}Bg` as keyof typeof C] as string };
}

// ── Alert meta renderer ─────────────────────────────────────────────────────
// Turns a run-on description like "المتبقي: 1 · الحد الأدنى: 5 · الفرع الرئيسي"
// into tidy chips (key muted, value highlighted; a plain segment gets a branch
// icon). Free-text bodies with no separators fall back to plain text.
function AlertMeta({ body, color, isRead, C }: {
    body: string;
    color: string;
    isRead: boolean;
    C: ReturnType<typeof managerPalette>;
}) {
    const lines = body.split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length === 0) return null;

    const [desc, ...rest] = lines;
    const parts = desc.split(/\s*[·•|،]\s*|\s+\.\s+/).map(s => s.trim()).filter(Boolean);
    const structured = parts.length > 1 || desc.includes(':');

    if (!structured) {
        return (
            <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', lineHeight: 18 }} numberOfLines={3}>
                {body}
            </Text>
        );
    }

    const chipBg = isRead ? C.input : `${color}14`;
    const valueColor = isRead ? C.mutedForeground : color;

    return (
        <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 }}>
                {parts.map((p, i) => {
                    const ci = p.indexOf(':');
                    const hasKV = ci > -1;
                    const label = hasKV ? p.slice(0, ci).trim() : '';
                    const value = hasKV ? p.slice(ci + 1).trim() : p;
                    return (
                        <View
                            key={i}
                            style={{
                                flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
                                backgroundColor: chipBg, borderRadius: Radius.xs,
                                paddingHorizontal: 8, paddingVertical: 4,
                            }}
                        >
                            {!hasKV && <Ionicons name="business-outline" size={11} color={C.mutedForeground} />}
                            {hasKV && (
                                <Text style={{ color: C.mutedForeground, fontSize: 11, fontWeight: '600' }}>
                                    {label}
                                </Text>
                            )}
                            <Text style={{ color: hasKV ? valueColor : C.mutedForeground, fontSize: 11, fontWeight: hasKV ? '800' : '600' }}>
                                {value}
                            </Text>
                        </View>
                    );
                })}
            </View>
            {rest.map((r, i) => (
                <Text key={i} style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right' }}>
                    {r}
                </Text>
            ))}
        </View>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function AlertsScreen() {
    const { isDarkMode } = useTheme();
    const { isAdmin, branchId: authBranchId } = useAuth();
    const { triggerSync } = useSyncStatus();
    const C = managerPalette(isDarkMode);

    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount]     = useState(0);
    const [loading, setLoading]             = useState(true);
    const [refreshing, setRefreshing]       = useState(false);
    const [filterKey, setFilterKey]         = useState<FilterKey>('all');
    const [unreadOnly, setUnreadOnly]       = useState(false);
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
    const filterCounts = useMemo(() => ({
        all:      notifications.length,
        critical: notifications.filter(n => ['OUT_OF_STOCK', 'EXPIRED'].includes(n.type)).length,
        warning:  notifications.filter(n => ['LOW_STOCK', 'EXPIRY'].includes(n.type)).length,
        info:     notifications.filter(n => ['NEW_PURCHASE', 'SYSTEM'].includes(n.type)).length,
    }), [notifications]);

    const sections = useMemo(() => {
        let list = notifications;
        const tab = FILTER_TABS.find(t => t.key === filterKey)!;
        if (filterKey !== 'all') list = list.filter(n => (tab.types as string[]).includes(n.type));
        if (unreadOnly) list = list.filter(n => !n.isRead);
        return groupByDate(list);
    }, [notifications, filterKey, unreadOnly]);

    // ── Card ──────────────────────────────────────────────────────────────────
    const renderItem = ({ item }: { item: Notification }) => {
        const config  = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.SYSTEM;
        const { color, bg } = variantColor(C, config.variant);

        return (
            <TouchableOpacity
                activeOpacity={item.isRead ? 1 : 0.75}
                onPress={() => !item.isRead && handleMarkRead(item.id)}
                style={{
                    backgroundColor: C.card,
                    borderRadius: Radius.sm,
                    marginBottom: 10,
                    borderWidth: 1.5,
                    borderColor: item.isRead ? C.border : `${color}40`,
                    padding: 13,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: item.isRead ? 0 : 0.05,
                    shadowRadius: 8,
                    elevation: item.isRead ? 0 : 2,
                }}
            >
                {/* Top row: icon bubble + title + unread dot */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 }}>
                    {/* Icon bubble */}
                    <View style={{
                        backgroundColor: item.isRead ? C.border : bg,
                        borderRadius: Radius.xs, padding: 8, flexShrink: 0,
                    }}>
                        <Ionicons
                            name={config.icon}
                            size={18}
                            color={item.isRead ? C.mutedForeground : color}
                        />
                    </View>

                    {/* Title + body */}
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                            <Text
                                style={{
                                    color: item.isRead ? C.mutedForeground : C.foreground,
                                    fontWeight: item.isRead ? '500' : '800',
                                    fontSize: 14, textAlign: 'right', flex: 1,
                                }}
                                numberOfLines={2}
                            >
                                {item.title}
                            </Text>
                            {/* Unread dot */}
                            {!item.isRead && (
                                <View style={{
                                    width: 9, height: 9, borderRadius: 5,
                                    backgroundColor: color, marginLeft: 8, flexShrink: 0,
                                }} />
                            )}
                        </View>

                        {!!item.body && (
                            <AlertMeta body={item.body} color={color} isRead={item.isRead} C={C} />
                        )}
                    </View>
                </View>

                {/* Bottom row: type chip + time + mark-read action */}
                <View style={{
                    flexDirection: 'row-reverse', justifyContent: 'space-between',
                    alignItems: 'center', marginTop: 10,
                    paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border,
                }}>
                    {/* Type chip */}
                    <View style={{
                        backgroundColor: item.isRead ? C.border : bg,
                        borderRadius: Radius.xs, paddingHorizontal: 8, paddingVertical: 3,
                        flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
                    }}>
                        <Text style={{
                            color: item.isRead ? C.mutedForeground : color,
                            fontSize: 11, fontWeight: '700',
                        }}>
                            {config.label}
                        </Text>
                    </View>

                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                        {/* Time */}
                        <Text style={{ color: C.mutedForeground, fontSize: 11 }}>
                            {timeAgo(item.createdAt)}
                        </Text>
                        {/* Mark read button */}
                        {!item.isRead && (
                            <TouchableOpacity
                                onPress={() => handleMarkRead(item.id)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={{
                                    backgroundColor: C.primaryMuted, borderRadius: Radius.xs,
                                    paddingHorizontal: 8, paddingVertical: 4,
                                    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
                                }}
                            >
                                <Ionicons name="checkmark" size={12} color={C.primary} />
                                <Text style={{ color: C.primary, fontSize: 11, fontWeight: '700' }}>
                                    تم القراءة
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    // ── Section header ────────────────────────────────────────────────────────
    const renderSectionHeader = ({ section }: { section: { title: string } }) => (
        <View style={{
            flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
            paddingVertical: 8, marginBottom: 4,
        }}>
            <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '700' }}>
                {section.title}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
        </View>
    );

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>

            {/* ── Header ─────────────────────────────────────────────────── */}
            <View style={{ backgroundColor: C.background, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>

                {/* Title row */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: C.foreground, fontSize: 22, fontWeight: '900' }}>
                            التنبيهات
                        </Text>
                        {unreadCount > 0 && (
                            <View style={{
                                backgroundColor: C.danger, borderRadius: 10,
                                paddingHorizontal: 8, paddingVertical: 2, minWidth: 22, alignItems: 'center',
                            }}>
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                                    {unreadCount}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Mark all read */}
                    {unreadCount > 0 && (
                        <TouchableOpacity
                            onPress={handleMarkAllRead}
                            style={{
                                flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
                                backgroundColor: C.primaryMuted, borderRadius: 5,
                                paddingHorizontal: 10, paddingVertical: 7,
                            }}
                            activeOpacity={0.75}
                        >
                            <Ionicons name="checkmark-done" size={14} color={C.primary} />
                            <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>
                                تحديد الكل كمقروء
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Branch selector */}
                {isAdmin && (
                    <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} hideIfSingle />
                )}

                {/* ── Filter tabs ─────────────────────────────────────────── */}
                <View style={{ flexDirection: 'row-reverse', gap: 6, marginBottom: 10 }}>
                    {FILTER_TABS.map(tab => {
                        const active = filterKey === tab.key;
                        const count  = filterCounts[tab.key];
                        const tabVariant: Variant | null =
                            tab.key === 'critical' ? 'danger' :
                            tab.key === 'warning'  ? 'warning' :
                            tab.key === 'info'     ? 'info' : null;
                        const tabColor = tabVariant ? variantColor(C, tabVariant).color : C.primary;
                        const tabBg    = tabVariant ? variantColor(C, tabVariant).bg : C.primaryMuted;

                        return (
                            <TouchableOpacity
                                key={tab.key}
                                onPress={() => setFilterKey(tab.key)}
                                activeOpacity={0.8}
                                style={{
                                    flex: 1, alignItems: 'center', gap: 2,
                                    paddingVertical: 8,
                                    borderRadius: 5,
                                    backgroundColor: active
                                        ? (tabVariant ? tabBg : C.primaryMuted)
                                        : C.card,
                                    borderWidth: 1.5,
                                    borderColor: active
                                        ? (tabVariant ? tabColor : C.primary)
                                        : C.border,
                                }}
                            >
                                <Text style={{
                                    fontSize: 12, fontWeight: '700',
                                    color: active ? (tabVariant ? tabColor : C.primary) : C.mutedForeground,
                                }}>
                                    {tab.label}
                                </Text>
                                {count > 0 && (
                                    <Text style={{
                                        fontSize: 11, fontWeight: '800',
                                        color: active ? (tabVariant ? tabColor : C.primary) : C.mutedForeground,
                                    }}>
                                        {count}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* ── Unread only toggle + result count ───────────────────── */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <TouchableOpacity
                        onPress={() => setUnreadOnly(v => !v)}
                        activeOpacity={0.75}
                        style={{
                            flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
                            backgroundColor: unreadOnly ? C.primaryMuted : 'transparent',
                            borderRadius: 5, paddingHorizontal: 10, paddingVertical: 5,
                            borderWidth: 1,
                            borderColor: unreadOnly ? C.primary : C.border,
                        }}
                    >
                        <View style={{
                            width: 8, height: 8, borderRadius: 4,
                            backgroundColor: unreadOnly ? C.primary : C.mutedForeground,
                        }} />
                        <Text style={{
                            color: unreadOnly ? C.primary : C.mutedForeground,
                            fontSize: 12, fontWeight: unreadOnly ? '700' : '500',
                        }}>
                            غير مقروءة فقط
                        </Text>
                    </TouchableOpacity>

                    <Text style={{ color: C.mutedForeground, fontSize: 12 }}>
                        {sections.reduce((s, sec) => s + sec.data.length, 0)} إشعار
                    </Text>
                </View>
            </View>

            {/* ── List ───────────────────────────────────────────────────── */}
            {loading && !refreshing ? (
                <View style={{ padding: 16, gap: 10 }}>
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} height={110} radius={5} />)}
                </View>
            ) : (
                <SectionList
                    sections={sections}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    renderSectionHeader={renderSectionHeader}
                    contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: 110 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                    stickySectionHeadersEnabled={false}
                    ListEmptyComponent={
                        <EmptyState
                            icon="notifications-outline"
                            title="لا توجد إشعارات"
                            subtitle={
                                unreadOnly ? 'لا توجد إشعارات غير مقروءة' :
                                filterKey !== 'all' ? 'لا توجد إشعارات في هذه الفئة' :
                                'ستظهر هنا إشعارات المخزون والصلاحيات والمشتريات'
                            }
                        />
                    }
                />
            )}
        </View>
    );
}
