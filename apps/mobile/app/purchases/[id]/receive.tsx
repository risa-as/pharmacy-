import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../../../services/api';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { usePalette, Surface, InfoNote, FormField, AppButton, StateBlock } from '../../../components/ui/Kit';
import { formatNumber } from '../../../utils/format';

interface ReceiveItem {
    id: string;
    itemId: string;
    drugName: string;
    quantity: number;
    receivedQuantity: string;
    batchNumber: string;
    expiryMonth: string;
    expiryYear: string;
    /** Unit purchase price, confirmed at receipt (orders may be created without one). */
    unitCost: string;
    /** Last purchase price of this drug in the branch, or null. */
    lastCost: number | null;
}

/** A price this far from the last one is usually a packet price typed as a strip price (or the reverse). */
const PRICE_JUMP_RATIO = 2;

function priceJump(item: ReceiveItem): boolean {
    const cost = Number(item.unitCost);
    if (!item.lastCost || !(cost > 0)) return false;
    return cost / item.lastCost >= PRICE_JUMP_RATIO || item.lastCost / cost >= PRICE_JUMP_RATIO;
}

/** "27" → "2027": employees often type two-digit years (same guard as inventory). */
function normalizeYear(raw: string): string {
    const v = raw.replace(/[^0-9]/g, '');
    if (v.length === 2) return `20${v}`;
    return v;
}

function itemErrors(item: ReceiveItem, nowYear: number) {
    const qty = parseInt(item.receivedQuantity, 10);
    const month = parseInt(item.expiryMonth, 10);
    const year = parseInt(item.expiryYear, 10);
    const cost = Number(item.unitCost);
    return {
        cost: !item.unitCost.trim() ? 'أدخل سعر الشراء' : (!Number.isFinite(cost) || cost < 0) ? 'سعر غير صالح' : null,
        quantity: !item.receivedQuantity.trim() ? 'أدخل الكمية المستلمة' : (isNaN(qty) || qty <= 0) ? 'الكمية يجب أن تكون أكبر من صفر' : null,
        batch: !item.batchNumber.trim() ? 'أدخل رقم الدفعة' : null,
        month: !item.expiryMonth ? 'أدخل شهر الصلاحية' : (isNaN(month) || month < 1 || month > 12) ? 'الشهر بين 1 و 12' : null,
        year: !item.expiryYear ? 'أدخل سنة الصلاحية' : (isNaN(year) || item.expiryYear.length !== 4 || year < nowYear || year > nowYear + 15) ? 'سنة غير صحيحة' : null,
    };
}

/**
 * Receive a purchase order (design receive.png): actual received quantity,
 * batch number and expiry month/year — no assumed expiry, and a review summary
 * before the stock is added.
 */
export default function ReceiveItemsScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const C = usePalette();
    const insets = useSafeAreaInsets();

    const [items, setItems] = useState<ReceiveItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [touched, setTouched] = useState(false);
    const nowYear = new Date().getFullYear();

    const fetchDetails = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            const data: any = await apiService.getPurchaseDetails(id as string);
            const baseTs = Date.now().toString(36).toUpperCase();
            setItems(data.items.map((item: any, idx: number) => ({
                ...item,
                itemId: item.id,
                receivedQuantity: String(item.quantity),
                batchNumber: `B${baseTs}${String(idx + 1).padStart(2, '0')}`,
                expiryMonth: '',
                expiryYear: '',
                lastCost: typeof item.lastCost === 'number' && item.lastCost > 0 ? item.lastCost : null,
                // Ordered price if one was set, else suggest the last purchase price.
                unitCost: item.cost > 0 ? String(item.cost) : item.lastCost > 0 ? String(item.lastCost) : '',
            })));
        } catch (error) {
            console.error(error);
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { if (id) fetchDetails(); }, [fetchDetails, id]);

    const updateItem = (index: number, field: keyof ReceiveItem, value: string) => {
        setItems(prev => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
    };

    const allErrors = items.map(it => itemErrors(it, nowYear));
    const invoiceTotal = items.reduce((sum, it) => {
        const qty = parseInt(it.receivedQuantity, 10);
        const cost = Number(it.unitCost);
        return sum + (qty > 0 && cost > 0 ? qty * cost : 0);
    }, 0);
    const firstInvalid = allErrors.findIndex(e => Object.values(e).some(Boolean));

    const submit = async () => {
        setSubmitting(true);
        try {
            const payload = items.map(item => ({
                itemId: item.itemId,
                quantity: parseInt(item.receivedQuantity, 10),
                batchNumber: item.batchNumber.trim(),
                expiryDate: new Date(`${item.expiryYear}-${item.expiryMonth.padStart(2, '0')}-01`).toISOString(),
                cost: Number(item.unitCost),
            }));
            await apiService.receivePurchase(id as string, payload);
            Alert.alert('تم الاستلام', 'أُضيفت المواد إلى المخزون.', [{ text: 'تم', onPress: () => router.back() }]);
        } catch {
            Alert.alert('خطأ', 'فشلت عملية الاستلام، يرجى المحاولة مرة أخرى');
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirm = () => {
        setTouched(true);
        if (firstInvalid >= 0) {
            Alert.alert('بيانات ناقصة', `أكمل بيانات "${items[firstInvalid].drugName}" قبل الاستلام.`);
            return;
        }
        const differs = items.filter(i => parseInt(i.receivedQuantity, 10) !== i.quantity);
        const lines = items.map(i => {
            const cost = Number(i.unitCost);
            return `• ${i.drugName}: ${formatNumber(parseInt(i.receivedQuantity, 10))} × ${cost > 0 ? `${formatNumber(cost)} د.ع` : 'مجاني'} — دفعة ${i.batchNumber} — ${i.expiryMonth.padStart(2, '0')}/${i.expiryYear}`;
        }).join('\n');
        const jumps = items.filter(priceJump);
        const warnings = [
            differs.length ? `${differs.length} صنف بكمية مختلفة عن المطلوب.` : '',
            jumps.length ? `سعر ${jumps.map(i => `«${i.drugName}»`).join('، ')} يختلف كثيراً عن آخر سعر شراء — تأكد أنه سعر الوحدة (الشريط) وليس الباكيت.` : '',
        ].filter(Boolean);
        Alert.alert(
            'تأكيد الاستلام',
            `${lines}\n\nإجمالي الفاتورة: ${formatNumber(invoiceTotal)} د.ع${warnings.length ? `\n\nتنبيه: ${warnings.join('\n')}` : ''}\n\nستُضاف هذه الكميات إلى المخزون.`,
            [
                { text: 'مراجعة', style: 'cancel' },
                { text: 'تأكيد الاستلام', onPress: submit },
            ],
        );
    };

    const header = <ScreenHeader title="استلام المشتريات" fallbackHref="/(tabs)/purchases" />;

    if (loading) return (
        <View style={{ flex: 1, backgroundColor: C.background }}>{header}<StateBlock loading title="جارِ تحميل الطلب…" /></View>
    );
    if (failed) return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {header}
            <StateBlock icon="cloud-offline-outline" title="تعذّر تحميل الطلب" message="تحقق من الاتصال ثم أعد المحاولة." actionLabel="إعادة المحاولة" onAction={fetchDetails} />
        </View>
    );

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.background }}>
            {header}
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
                <InfoNote
                    tone="warning"
                    title="تحقق من الدفعات"
                    text="أدخل بيانات الاستلام من المواد الفعلية وفاتورة المورد. الكمية والسعر بوحدة البيع نفسها في المخزون (مثل الشريط) — وليس الباكيت."
                />

                {items.map((item, index) => {
                    const e = touched ? allErrors[index] : { cost: null, quantity: null, batch: null, month: null, year: null };
                    const jump = priceJump(item);
                    const costValue = Number(item.unitCost);
                    const received = parseInt(item.receivedQuantity, 10);
                    const differs = !isNaN(received) && received > 0 && received !== item.quantity;
                    return (
                        <Surface key={item.id} style={{ gap: 12 }}>
                            <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '900', textAlign: 'right' }} numberOfLines={2}>{item.drugName}</Text>
                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 10 }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 13.5 }}>الكمية المطلوبة</Text>
                                <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '900' }}>{formatNumber(item.quantity)}</Text>
                            </View>
                            <FormField
                                label="الكمية المستلمة"
                                required
                                keyboardType="number-pad"
                                value={item.receivedQuantity}
                                onChangeText={v => updateItem(index, 'receivedQuantity', v.replace(/[^0-9]/g, ''))}
                                error={e.quantity}
                                hint={differs ? `تختلف عن الكمية المطلوبة (${formatNumber(item.quantity)})` : undefined}
                            />
                            <FormField
                                label="سعر شراء الوحدة"
                                required
                                keyboardType="decimal-pad"
                                suffix="د.ع"
                                placeholder="من فاتورة المورد"
                                value={item.unitCost}
                                onChangeText={v => updateItem(index, 'unitCost', v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
                                error={e.cost}
                                hint={
                                    jump ? `يختلف كثيراً عن آخر سعر (${formatNumber(item.lastCost ?? 0)} د.ع) — تأكد أنه سعر الشريط`
                                    : item.unitCost.trim() && costValue === 0 ? 'صفر = بونص مجاني من المورد'
                                    : item.lastCost ? `آخر سعر شراء: ${formatNumber(item.lastCost)} د.ع`
                                    : 'لا يوجد سعر شراء سابق لهذا الصنف'
                                }
                            />
                            <FormField
                                label="رقم الدفعة"
                                required
                                value={item.batchNumber}
                                onChangeText={v => updateItem(index, 'batchNumber', v)}
                                autoCapitalize="characters"
                                error={e.batch}
                            />
                            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                                <FormField
                                    containerStyle={{ flex: 1 }}
                                    label="شهر الصلاحية"
                                    required
                                    placeholder="الشهر"
                                    keyboardType="number-pad"
                                    maxLength={2}
                                    value={item.expiryMonth}
                                    onChangeText={v => updateItem(index, 'expiryMonth', v.replace(/[^0-9]/g, ''))}
                                    error={e.month}
                                />
                                <FormField
                                    containerStyle={{ flex: 1 }}
                                    label="سنة الصلاحية"
                                    required
                                    placeholder="السنة"
                                    keyboardType="number-pad"
                                    maxLength={4}
                                    value={item.expiryYear}
                                    onChangeText={v => updateItem(index, 'expiryYear', v.replace(/[^0-9]/g, ''))}
                                    onBlur={() => updateItem(index, 'expiryYear', normalizeYear(item.expiryYear))}
                                    error={e.year}
                                />
                            </View>
                        </Surface>
                    );
                })}

                {/* Review summary */}
                <Surface style={{ gap: 8 }}>
                    <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right' }}>ملخص المراجعة</Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right' }}>يرجى التأكد من صحة البيانات قبل تأكيد الاستلام</Text>
                    {items.map((item, i) => (
                        <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, gap: 4 }}>
                            <SummaryLine label="اسم المنتج" value={item.drugName} />
                            <SummaryLine label="الكمية المستلمة" value={item.receivedQuantity ? formatNumber(parseInt(item.receivedQuantity, 10)) : '—'} />
                            <SummaryLine
                                label="سعر الوحدة"
                                value={item.unitCost.trim() ? (Number(item.unitCost) > 0 ? `${formatNumber(Number(item.unitCost))} د.ع` : 'مجاني') : '—'}
                                warn={!!allErrors[i].cost || priceJump(item)}
                            />
                            <SummaryLine label="رقم الدفعة" value={item.batchNumber || '—'} />
                            <SummaryLine
                                label="تاريخ الصلاحية"
                                value={item.expiryMonth && item.expiryYear ? `${item.expiryMonth.padStart(2, '0')}/${item.expiryYear}` : '—'}
                                warn={!allErrors[i].month && !allErrors[i].year ? false : true}
                            />
                        </View>
                    ))}
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginTop: 2 }}>
                        <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '800' }}>إجمالي الفاتورة</Text>
                        <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900' }}>{formatNumber(invoiceTotal)} <Text style={{ fontSize: 12, color: C.mutedForeground }}>د.ع</Text></Text>
                    </View>
                </Surface>
            </ScrollView>

            <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.background }}>
                <AppButton label="مراجعة وتأكيد الاستلام" icon="checkmark-circle-outline" loading={submitting} onPress={handleConfirm} />
            </View>
        </KeyboardAvoidingView>
    );
}

function SummaryLine({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
    const C = usePalette();
    return (
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ color: C.mutedForeground, fontSize: 13.5 }}>{label}</Text>
            <Text style={{ color: warn ? C.warning : C.foreground, fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'left' }} numberOfLines={1}>{value}</Text>
        </View>
    );
}
