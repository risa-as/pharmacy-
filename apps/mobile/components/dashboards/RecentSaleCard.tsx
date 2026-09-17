import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePalette, IconTile, PressableCard, StatusBadge, Tone } from '../ui/Kit';
import { formatDate, formatTime } from '../../utils/date';
import { formatNumber, formatInvoiceNumber, paymentMethodLabel, CURRENCY } from '../../utils/format';

export interface RecentSale {
    id: string;
    invoiceNumber?: number | null;
    total?: number;
    createdAt: string;
    payment?: { method?: string | null } | null;
}

/**
 * One recent sale as its own compact two-tier card (design option «ب»): method
 * icon + invoice number + time on top, payment badge + amount below a thin
 * divider. Shared by the manager and pharmacist home screens so «آخر المبيعات»
 * looks identical for both roles.
 */
export function RecentSaleCard({ sale, onPress }: { sale: RecentSale; onPress: () => void }) {
    const C = usePalette();
    const method = sale.payment?.method ?? 'CASH';
    const tone: Tone = method === 'CREDIT' ? 'warning' : method === 'CARD' ? 'primary' : 'success';
    const methodIcon: React.ComponentProps<typeof Ionicons>['name'] = method === 'CREDIT'
        ? 'time-outline'
        : method === 'CARD' ? 'card-outline' : 'cash-outline';

    const dayOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    const time = sale.createdAt ? formatTime(sale.createdAt, { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const isToday = !!sale.createdAt && formatDate(sale.createdAt, dayOpts) === formatDate(new Date(), dayOpts);
    const when = sale.createdAt && !isToday ? `${formatDate(sale.createdAt, dayOpts)} · ${time}` : `اليوم · ${time}`;

    return (
        <PressableCard
            onPress={onPress}
            padded={false}
            style={{ paddingHorizontal: 12, paddingVertical: 10 }}
            accessibilityLabel={`الفاتورة ${formatInvoiceNumber(sale)}، ${formatNumber(sale.total ?? 0)} ${CURRENCY}، ${paymentMethodLabel(method)}`}
        >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                <IconTile icon={methodIcon} tone={tone} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: C.foreground, fontSize: 14.5, fontWeight: '800', textAlign: 'right' }}>
                        فاتورة {formatInvoiceNumber(sale)}
                    </Text>
                    <Text numberOfLines={1} style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right' }}>{when}</Text>
                </View>
            </View>

            <View style={{ height: 1, backgroundColor: C.border, marginVertical: 8 }} />

            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                <StatusBadge label={paymentMethodLabel(method)} tone={tone} />
                <Text numberOfLines={1} style={{ color: C.foreground, fontSize: 17, fontWeight: '900' }}>
                    {formatNumber(sale.total ?? 0)} <Text style={{ color: C.mutedForeground, fontSize: 11.5, fontWeight: '600' }}>{CURRENCY}</Text>
                </Text>
            </View>
        </PressableCard>
    );
}

export default RecentSaleCard;
