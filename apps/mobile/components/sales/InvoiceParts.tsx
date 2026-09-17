import React from 'react';
import { View, Text } from 'react-native';
import { Radius } from '../../constants/colors';
import { usePalette } from '../ui/Kit';
import { formatNumber, formatIQD } from '../../utils/format';

export interface InvoiceItemRow {
    id: string;
    drugId: string;
    quantity: number;
    price: number;
    drug?: { tradeName?: string | null } | null;
}

/**
 * The invoice number as a soft chip. On its own it reads as one more grey
 * caption beside the date and the two run together; the chip separates them.
 */
export function InvoiceNumberChip({ label }: { label: string }) {
    const C = usePalette();
    return (
        <View style={{
            paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: Radius.badge,
            backgroundColor: C.input, borderWidth: 1, borderColor: C.border,
        }}>
            <Text style={{ color: C.mutedForeground, fontSize: 12.5, fontWeight: '800' }} numberOfLines={1}>{label}</Text>
        </View>
    );
}

/**
 * The lines of one invoice: drug, quantity, line total, then the invoice total.
 * Shared by the sales history and the patient file so an invoice reads the same
 * wherever it is opened.
 */
export function InvoiceItemsTable({ items, total, returnedByDrug }: {
    items: InvoiceItemRow[];
    total: number;
    /** Returned quantity per drug; shown in red under the name. */
    returnedByDrug?: Record<string, number>;
}) {
    const C = usePalette();
    return (
        <View style={{ borderRadius: Radius.control, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
            <View style={{ flexDirection: 'row-reverse', backgroundColor: C.input, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ flex: 2, color: C.mutedForeground, fontSize: 12.5, textAlign: 'right' }}>الدواء</Text>
                <Text style={{ flex: 1, color: C.mutedForeground, fontSize: 12.5, textAlign: 'center' }}>الكمية</Text>
                <Text style={{ flex: 1.2, color: C.mutedForeground, fontSize: 12.5, textAlign: 'left' }}>الإجمالي</Text>
            </View>
            {items.map(it => {
                const returned = returnedByDrug?.[it.drugId] ?? 0;
                return (
                    <View key={it.id} style={{ flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.border }}>
                        <View style={{ flex: 2 }}>
                            <Text style={{ color: C.foreground, fontSize: 13.5, fontWeight: '700', textAlign: 'right' }} numberOfLines={1}>{it.drug?.tradeName ?? 'صنف'}</Text>
                            {returned > 0 && <Text style={{ color: C.danger, fontSize: 11.5, textAlign: 'right' }}>مرتجع {formatNumber(returned)}</Text>}
                        </View>
                        <Text style={{ flex: 1, color: C.foreground, fontSize: 13.5, textAlign: 'center' }}>{formatNumber(it.quantity)}</Text>
                        <Text style={{ flex: 1.2, color: C.foreground, fontSize: 13.5, textAlign: 'left' }}>{formatNumber(it.quantity * it.price)}</Text>
                    </View>
                );
            })}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', backgroundColor: C.primaryMuted, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '800' }}>المجموع</Text>
                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '900' }}>{formatIQD(total)}</Text>
            </View>
        </View>
    );
}

export default InvoiceItemsTable;
