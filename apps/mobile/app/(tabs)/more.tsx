import { routePermission } from '../../utils/route-access';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { router, useFocusEffect, Href } from 'expo-router';
import { AppIcon as Ionicons } from '../../components/ui/AppIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { apiService, backgroundRequest } from '../../services/api';
import { Radius } from '../../constants/colors';
import { usePalette, Surface, SectionTitle, ListRow, Tone } from '../../components/ui/Kit';
import { initials } from '../../utils/format';
import { roleLabel } from '../../utils/roles';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface MoreItem {
    title: string;
    subtitle: string;
    icon: IconName;
    tone: Tone;
    href: Href;
    badge?: number;
}

interface MoreSection { title: string; items: MoreItem[] }

const MULTI_BRANCH_KEY_PREFIX = 'more:hasOtherBranches:';
/** Session cache of the multi-branch check, keyed like the AsyncStorage entry. */
const multiBranchMemo = new Map<string, boolean>();

/**
 * «المزيد» (navigation-map §3–4): every function that is not a bottom tab has
 * a reachable, role-appropriate entry here. Access is still enforced by the
 * server and by each screen.
 */
export default function MoreScreen() {
    const C = usePalette();
    const { user, shell, can, features, isAdmin, branchId } = useAuth();
    const [unread, setUnread] = useState(0);
    const transfersEnabled = features.interBranchTransfers && can('canTransferStock');
    const multiBranchKey = `${MULTI_BRANCH_KEY_PREFIX}${branchId ?? (isAdmin ? 'org' : 'none')}`;
    // null = unknown → entry stays hidden, so it never appears and then vanishes.
    const [hasOtherBranches, setHasOtherBranches] = useState<boolean | null>(
        () => multiBranchMemo.get(multiBranchKey) ?? null,
    );

    // Transfers are meaningless with a single branch, so hide the entry. Non-admin
    // users only see their own branch from /branches, so ask the transfer
    // destinations endpoint (other branches in the org) instead. The answer is
    // cached (memory + AsyncStorage) so later opens render the final state at once.
    useEffect(() => {
        if (!transfersEnabled) return;
        let active = true;
        const apply = (value: boolean) => {
            multiBranchMemo.set(multiBranchKey, value);
            if (active) setHasOtherBranches(value);
        };
        let known = multiBranchMemo.has(multiBranchKey);
        if (known) setHasOtherBranches(multiBranchMemo.get(multiBranchKey)!);
        else {
            AsyncStorage.getItem(multiBranchKey)
                .then(saved => { if (saved !== null && !multiBranchMemo.has(multiBranchKey)) { known = true; apply(saved === '1'); } })
                .catch(() => {});
        }
        const check: Promise<number | null> = branchId
            ? backgroundRequest<{ branches: unknown[] }>(`/inventory/transfers?branchId=${encodeURIComponent(branchId)}&type=destinations`)
                .then(res => Array.isArray(res?.branches) ? res.branches.length + 1 : null)
            : isAdmin
                ? apiService.getBranches().then(list => Array.isArray(list) && list.length ? list.length : null)
                : Promise.resolve(null);
        check
            .catch(() => null)
            .then(count => {
                if (count !== null) {
                    apply(count > 1);
                    AsyncStorage.setItem(multiBranchKey, count > 1 ? '1' : '0').catch(() => {});
                } else if (!known && !multiBranchMemo.has(multiBranchKey)) {
                    // Offline with no cached answer: fall back to showing the entry.
                    if (active) setHasOtherBranches(true);
                }
            });
        return () => { active = false; };
    }, [transfersEnabled, multiBranchKey, branchId, isAdmin]);

    useFocusEffect(
        useCallback(() => {
            if (shell !== 'pharmacist') return;
            let active = true;
            backgroundRequest<{ unreadCount: number }>('/notifications/in-app?unread=1')
                .then(res => { if (active) setUnread(res.unreadCount ?? 0); })
                .catch(() => {});
            return () => { active = false; };
        }, [shell]),
    );

    const settingsItem: MoreItem = {
        title: 'الإعدادات', subtitle: 'الحساب والتفضيلات والأجهزة والمساعدة',
        icon: 'settings-outline', tone: 'neutral', href: '/(tabs)/settings' as Href,
    };

    const sections: MoreSection[] = shell === 'manager'
        ? [
            {
                title: 'المبيعات والعملاء',
                items: [
                    { title: 'سجل المبيعات', subtitle: 'الفواتير والتفاصيل والإرجاع', icon: 'receipt-outline', tone: 'primary', href: '/sales-history' as Href },
                    { title: 'الديون', subtitle: 'أرصدة المدينين وتحصيل الدفعات', icon: 'hand-coins', tone: 'danger', href: '/(tabs)/debts' as Href },
                    { title: 'المرضى', subtitle: 'الملفات والمعلومات الصحية المسجلة', icon: 'people-outline', tone: 'primary', href: '/crm' as Href },
                ],
            },
            {
                title: 'المشتريات والمخزون',
                items: [
                    { title: 'المشتريات', subtitle: 'طلبات الشراء والاستلام', icon: 'bag-handle-outline', tone: 'primary', href: '/(tabs)/purchases' as Href },
                    { title: 'الطلبات الذكية', subtitle: 'النواقص المتوقعة وإنشاء الطلبات', icon: 'list-outline', tone: 'success', href: '/(tabs)/smart-orders' as Href },
                ],
            },
            {
                title: 'الإدارة',
                items: [
                    // The manager shell has no POS tab; this is its only entry point.
                    { title: 'نقطة البيع', subtitle: 'تسجيل فاتورة بيع جديدة', icon: 'cart-outline', tone: 'success', href: '/(tabs)/sales' as Href },
                    { title: 'المصروفات', subtitle: 'عرض وإضافة مصروفات الصيدلية', icon: 'cash-outline', tone: 'warning', href: '/accounting/expenses' as Href },
                    { title: 'فحص الوصفة', subtitle: 'قراءة الوصفة ومراجعة النتائج', icon: 'scan-outline', tone: 'primary', href: '/scan-prescription' as Href },
                ],
            },
            { title: 'التطبيق', items: [settingsItem] },
        ]
        : [
            {
                title: 'العمل اليومي',
                items: [
                    { title: 'سجل المبيعات', subtitle: 'الفواتير والتفاصيل والإرجاع', icon: 'receipt-outline', tone: 'primary', href: '/sales-history' as Href },
                    { title: 'المرضى', subtitle: 'الملفات والمعلومات الصحية المسجلة', icon: 'people-outline', tone: 'primary', href: '/crm' as Href },
                    { title: 'فحص الوصفة', subtitle: 'قراءة الوصفة ومراجعة النتائج', icon: 'scan-outline', tone: 'primary', href: '/scan-prescription' as Href },
                ],
            },
            {
                title: 'المتابعة',
                items: [
                    { title: 'التنبيهات', subtitle: 'نقص المخزون وقرب الانتهاء', icon: 'notifications-outline', tone: 'warning', href: '/(tabs)/alerts' as Href, badge: unread },
                ],
            },
            { title: 'التطبيق', items: [settingsItem] },
        ];

    const operational = [
        ...(features.warehouseManagement && can('canViewWarehouseOrders') ? [{title:'طلبات المذاخر',subtitle:'العروض والشحن والاستلام والمرتجعات',icon:'business-outline',tone:'primary',href:'/warehouse-orders'}] : []),
        ...(can('canDoStocktake') ? [{title:'الجرد',subtitle:'عد الدفعات ومراجعة الفروقات',icon:'clipboard-outline',tone:'primary',href:'/stocktakes'}] : []),
        ...(transfersEnabled && hasOtherBranches === true ? [{title:'التحويلات',subtitle:'إرسال واستلام المخزون بين الفروع',icon:'swap-horizontal-outline',tone:'primary',href:'/transfers'}] : []),
        ...(shell === 'pharmacist' && can('canViewSuppliers') ? [{title:'المشتريات',subtitle:'طلبات الموردين والاستلام',icon:'bag-handle-outline',tone:'primary',href:'/(tabs)/purchases'}] : []),
        ...(shell === 'pharmacist' && can('canViewInventory') && can('canCreatePurchase') ? [{title:'الشراء الذكي',subtitle:'تحديد احتياج المخزون',icon:'list-outline',tone:'primary',href:'/(tabs)/smart-orders'}] : []),
    ] as MoreItem[];
    const inventorySection = sections.find(section => section.title === 'المشتريات والمخزون');
    if (inventorySection) {
        const existingRoutes = new Set(inventorySection.items.map(item => String(item.href)));
        inventorySection.items.push(...operational.filter(item => !existingRoutes.has(String(item.href))));
    } else if (operational.length) {
        sections.unshift({title:'المشتريات والمخزون',items:operational});
    }
    const visibleSections = sections.map(section => ({...section,items:section.items.filter(item => {const p=routePermission(String(item.href));return !p || can(p);})})).filter(s=>s.items.length);
    return (
        <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 20 }}>
            <Surface style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 54, height: 54, borderRadius: Radius.card, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>{initials(user?.name) || '؟'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900', textAlign: 'right' }} numberOfLines={1}>{user?.name ?? 'المستخدم'}</Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }}>
                        {roleLabel(user?.role)}
                    </Text>
                </View>
            </Surface>

            {visibleSections.map(section => (
                <View key={section.title}>
                    <SectionTitle title={section.title} />
                    <Surface padded={false} style={{ overflow: 'hidden' }}>
                        {section.items.map((item, i) => (
                            <ListRow
                                key={item.title}
                                icon={item.icon}
                                tone={item.tone}
                                title={item.title}
                                subtitle={item.subtitle}
                                divider={i < section.items.length - 1}
                                onPress={() => router.push(item.href)}
                                trailing={item.badge ? (
                                    <View style={{ minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{item.badge > 99 ? '99+' : item.badge}</Text>
                                    </View>
                                ) : undefined}
                            />
                        ))}
                    </Surface>
                </View>
            ))}
        </ScrollView>
    );
}
