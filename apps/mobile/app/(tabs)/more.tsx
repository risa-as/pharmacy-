import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { router, useFocusEffect, Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { backgroundRequest } from '../../services/api';
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

/**
 * «المزيد» (navigation-map §3–4): every function that is not a bottom tab has
 * a reachable, role-appropriate entry here. Access is still enforced by the
 * server and by each screen.
 */
export default function MoreScreen() {
    const C = usePalette();
    const { user, shell } = useAuth();
    const [unread, setUnread] = useState(0);

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
                    { title: 'الديون', subtitle: 'أرصدة المدينين وتحصيل الدفعات', icon: 'wallet-outline', tone: 'danger', href: '/(tabs)/debts' as Href },
                    { title: 'المرضى', subtitle: 'الملفات والمعلومات الصحية المسجلة', icon: 'people-outline', tone: 'primary', href: '/crm' as Href },
                ],
            },
            {
                title: 'التوريد',
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

            {sections.map(section => (
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
