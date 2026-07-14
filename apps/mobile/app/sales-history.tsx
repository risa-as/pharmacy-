import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, RefreshControl,
    Modal, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { request } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { managerPalette, Radius } from '../constants/colors';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDate, formatTime, iraqDateString, todayIraq } from '../utils/date';

type Palette = ReturnType<typeof managerPalette>;

const PAGE_LIMIT = 50;

// ── Types ───────────────────────────────────────────────────────────────────
interface Sale {
    id: string;
    invoiceNumber?: number | null;
    total: number;
    discount?: number;
    patientId?: string | null;
    safeId?: string | null;
    createdAt: string;
}

interface SaleItemRow {
    id: string;
    drugId: string;
    quantity: number;
    price: number;
    drug?: { tradeName?: string | null } | null;
}

interface SaleReturnRow {
    id: string;
    total: number;
    createdAt: string;
    items: { drugId: string; quantity: number; price: number }[];
}

// GET /sales/[id] — sale + items(drug) + patient + payment + returns(items)
interface SaleDetail extends Sale {
    items: SaleItemRow[];
    patient?: { id: string; name: string } | null;
    payment?: { method?: string | null } | null;
    returns: SaleReturnRow[];
}

type Filter = 'today' | 'week' | 'all';
const FILTERS: { key: Filter; label: string }[] = [
    { key: 'today', label: 'اليوم' },
    { key: 'week',  label: 'أسبوع' },
    { key: 'all',   label: 'الكل' },
];

const PAYMENT_LABELS: Record<string, string> = {
    CASH:          'نقدي',
    CREDIT:        'آجل',
    CARD:          'بطاقة',
    MOBILE_WALLET: 'محفظة إلكترونية',
    BANK_TRANSFER: 'تحويل بنكي',
    ZAIN_CASH:     'زين كاش',
    STRIPE:        'بطاقة',
};

// Collapsed-row fallback when the detail (with payment.method) isn't loaded:
// CREDIT sales leave safeId null + set patientId; CASH attaches a safe.
function isCredit(s: Sale): boolean {
    return !!s.patientId && !s.safeId;
}

// Server-side date filter start (device-local midnight, matching financial.tsx)
function periodFrom(filter: Filter): Date | null {
    if (filter === 'all') return null;
    const from = new Date();
    if (filter === 'week') from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return from;
}

// Max returnable per drugId = sold − already returned.
// Mirrors the server's return-route logic exactly (last item wins per drugId).
function returnableByDrug(detail: SaleDetail): Record<string, number> {
    const map: Record<string, number> = {};
    for (const it of detail.items ?? []) map[it.drugId] = it.quantity;
    for (const r of detail.returns ?? []) {
        for (const ri of r.items ?? []) {
            if (map[ri.drugId] !== undefined) map[ri.drugId] -= ri.quantity;
        }
    }
    return map;
}

function returnedQtyFor(detail: SaleDetail, drugId: string): number {
    let n = 0;
    for (const r of detail.returns ?? []) {
        for (const ri of r.items ?? []) {
            if (ri.drugId === drugId) n += ri.quantity;
        }
    }
    return n;
}

export default function SalesHistoryScreen() {
    const { isDarkMode } = useTheme();
    const C = managerPalette(isDarkMode);
    const insets = useSafeAreaInsets();

    const [sales, setSales]           = useState<Sale[]>([]);
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lastPageFull, setLastPageFull] = useState(false);
    const [filter, setFilter]         = useState<Filter>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Per-sale detail cache (fetched lazily on expand)
    const [details, setDetails]           = useState<Record<string, SaleDetail>>({});
    const [detailLoading, setDetailLoading] = useState<string | null>(null);
    const [detailFailed, setDetailFailed]   = useState<Record<string, boolean>>({});

    // Return modal state
    const [returnTarget, setReturnTarget]       = useState<SaleDetail | null>(null);
    const [returnQty, setReturnQty]             = useState<Record<string, number>>({});
    const [submittingReturn, setSubmittingReturn] = useState(false);

    const card = (accent: string) => ({
        backgroundColor: C.card,
        borderRadius: Radius.sm,
        borderWidth: 1.5,
        borderColor: `${accent}33`,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 } as const,
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
    });

    const fetchSales = useCallback(async (offset: number, append: boolean) => {
        try {
            const from = periodFrom(filter);
            let q = `?limit=${PAGE_LIMIT}&offset=${offset}`;
            if (from) q += `&from=${from.toISOString()}`;
            const data = await request<Sale[]>(`/sales${q}`);
            const page = Array.isArray(data) ? data : [];
            setSales(prev => (append ? [...prev, ...page] : page));
            setLastPageFull(page.length === PAGE_LIMIT);
        } catch (err) {
            console.error('SalesHistoryScreen:', err);
            if (!append) setSales([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    }, [filter]);

    useEffect(() => {
        setLoading(true);
        setExpandedId(null);
        fetchSales(0, false);
    }, [fetchSales]);

    const onRefresh  = useCallback(() => { setRefreshing(true); fetchSales(0, false); }, [fetchSales]);
    const onLoadMore = useCallback(() => { setLoadingMore(true); fetchSales(sales.length, true); }, [fetchSales, sales.length]);

    // Client-side fallback filter on top of the server-side `from` param
    const filtered = useMemo(() => {
        if (filter === 'all') return sales;
        if (filter === 'today') {
            const today = todayIraq();
            return sales.filter(s => s.createdAt && iraqDateString(s.createdAt) === today);
        }
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return sales.filter(s => s.createdAt && new Date(s.createdAt).getTime() >= weekAgo);
    }, [sales, filter]);

    const summaryTotal = useMemo(() => filtered.reduce((sum, s) => sum + (s.total ?? 0), 0), [filtered]);

    // ── Expand + lazy detail fetch ──────────────────────────────────────────
    const openSale = useCallback(async (saleId: string) => {
        const willExpand = expandedId !== saleId;
        setExpandedId(willExpand ? saleId : null);
        if (!willExpand || details[saleId] || detailLoading === saleId) return;

        setDetailLoading(saleId);
        try {
            const d = await request<SaleDetail>(`/sales/${saleId}`);
            setDetails(prev => ({ ...prev, [saleId]: d }));
            setDetailFailed(prev => ({ ...prev, [saleId]: false }));
        } catch (err) {
            console.error('SalesHistoryScreen detail:', err);
            setDetailFailed(prev => ({ ...prev, [saleId]: true }));
        } finally {
            setDetailLoading(null);
        }
    }, [expandedId, details, detailLoading]);

    // ── Return flow ─────────────────────────────────────────────────────────
    const maxByDrug = useMemo(
        () => (returnTarget ? returnableByDrug(returnTarget) : {}),
        [returnTarget],
    );

    // Unique items per drugId (last wins — mirrors the server's map)
    const modalItems = useMemo(() => {
        if (!returnTarget) return [];
        const seen = new Map<string, SaleItemRow>();
        for (const it of returnTarget.items ?? []) seen.set(it.drugId, it);
        return Array.from(seen.values()).filter(it => (maxByDrug[it.drugId] ?? 0) > 0);
    }, [returnTarget, maxByDrug]);

    const returnTotal = useMemo(() => {
        if (!returnTarget) return 0;
        return modalItems.reduce((sum, it) => sum + (returnQty[it.drugId] ?? 0) * it.price, 0);
    }, [returnTarget, modalItems, returnQty]);

    const openReturnModal = (detail: SaleDetail) => {
        const init: Record<string, number> = {};
        for (const it of detail.items ?? []) init[it.drugId] = 0;
        setReturnQty(init);
        setReturnTarget(detail);
    };

    const stepQty = (drugId: string, delta: number) => {
        const max = Math.max(0, maxByDrug[drugId] ?? 0);
        setReturnQty(prev => ({
            ...prev,
            [drugId]: Math.max(0, Math.min(max, (prev[drugId] ?? 0) + delta)),
        }));
    };

    const returnAll = () => {
        setReturnQty(Object.fromEntries(
            modalItems.map(it => [it.drugId, Math.max(0, maxByDrug[it.drugId] ?? 0)]),
        ));
    };

    const doSubmitReturn = async (items: { drugId: string; quantity: number }[]) => {
        if (!returnTarget || submittingReturn) return;
        setSubmittingReturn(true);
        const saleId = returnTarget.id;
        try {
            await request(`/sales/${saleId}/return`, {
                method: 'POST',
                headers: { 'x-idempotency-key': Date.now().toString(36) + Math.random().toString(36).substring(2) },
                body: JSON.stringify({ items }),
            });
            setReturnTarget(null);
            setExpandedId(null);
            // Drop the cached detail so the next expand refetches fresh returned quantities
            setDetails(prev => {
                const next = { ...prev };
                delete next[saleId];
                return next;
            });
            fetchSales(0, false);
            Alert.alert('تم', 'تمت معالجة المرتجع بنجاح');
        } catch (err: any) {
            console.error('SalesHistoryScreen return:', err);
            Alert.alert('خطأ', err?.message || 'تعذّرت معالجة المرتجع');
        } finally {
            setSubmittingReturn(false);
        }
    };

    const submitReturn = () => {
        if (!returnTarget || submittingReturn) return;
        const items = modalItems
            .filter(it => (returnQty[it.drugId] ?? 0) > 0)
            .map(it => ({ drugId: it.drugId, quantity: returnQty[it.drugId] }));
        if (items.length === 0) {
            Alert.alert('تنبيه', 'حدد كمية واحدة على الأقل للإرجاع');
            return;
        }
        const credit = returnTarget.payment?.method === 'CREDIT';
        Alert.alert(
            'تأكيد الإرجاع',
            `سيتم إرجاع ${returnTotal.toLocaleString('en-US')} د.ع ${credit ? 'خصماً من دين العميل' : 'من الصندوق'}. هل أنت متأكد؟`,
            [
                { text: 'إلغاء', style: 'cancel' },
                { text: 'تأكيد الإرجاع', style: 'destructive', onPress: () => doSubmitReturn(items) },
            ],
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>

            {/* ── Header bar ─────────────────────────────────────────────── */}
            <View style={{
                paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 10,
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: C.background,
            }}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    activeOpacity={0.8}
                    style={{ width: 40, height: 40, borderRadius: Radius.xs, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Ionicons name="arrow-forward" size={20} color={C.foreground} />
                </TouchableOpacity>
                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }}>سجل المبيعات</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 110 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            >
                {/* ── Filter segmented control ───────────────────────────── */}
                <View style={{
                    flexDirection: 'row-reverse',
                    backgroundColor: C.card,
                    borderRadius: Radius.sm,
                    borderWidth: 1.5,
                    borderColor: `${C.primary}33`,
                    padding: 4, gap: 4, marginBottom: 16,
                }}>
                    {FILTERS.map(({ key, label }) => {
                        const sel = filter === key;
                        return (
                            <TouchableOpacity
                                key={key} onPress={() => setFilter(key)} activeOpacity={0.8}
                                style={{
                                    flex: 1, paddingVertical: 9, borderRadius: Radius.xs,
                                    alignItems: 'center',
                                    backgroundColor: sel ? C.primary : 'transparent',
                                }}
                            >
                                <Text style={{ fontSize: 13, fontWeight: sel ? '800' : '600', color: sel ? '#fff' : C.mutedForeground }}>
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* ── Loading skeleton ───────────────────────────────────── */}
                {loading && !refreshing ? (
                    <View style={{ gap: 12 }}>
                        <Skeleton height={64} radius={Radius.sm} />
                        <Skeleton height={64} radius={Radius.sm} />
                        <Skeleton height={64} radius={Radius.sm} />
                        <Skeleton height={64} radius={Radius.sm} />
                    </View>
                ) : filtered.length === 0 ? (
                    <View style={{ marginTop: 30 }}>
                        <EmptyState
                            icon="receipt-outline"
                            title="لا توجد مبيعات"
                            subtitle="لم يتم تسجيل أي فاتورة في هذه الفترة"
                        />
                    </View>
                ) : (
                    <View style={{ gap: 12 }}>
                        {/* ── Summary chip ───────────────────────────────── */}
                        <View style={{
                            ...card(C.primary),
                            flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                            padding: 14,
                        }}>
                            <View>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right' }}>إجمالي الفواتير</Text>
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                                    <Text style={{ color: C.foreground, fontSize: 20, fontWeight: '900' }}>
                                        {summaryTotal.toLocaleString('en-US')}
                                    </Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '700' }}>د.ع</Text>
                                </View>
                            </View>
                            <View style={{ backgroundColor: C.primaryMuted, borderRadius: Radius.xs, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' }}>
                                <Text style={{ color: C.primary, fontSize: 18, fontWeight: '900' }}>{filtered.length}</Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 10, fontWeight: '600' }}>فاتورة</Text>
                            </View>
                        </View>

                        {/* ── Sale cards ─────────────────────────────────── */}
                        {filtered.map((sale) => {
                            const detail = details[sale.id];
                            // Authoritative payment method once the detail is loaded
                            const methodKey = detail?.payment?.method ?? (isCredit(sale) ? 'CREDIT' : 'CASH');
                            const credit = methodKey === 'CREDIT';
                            const mColor = credit ? C.warning : C.success;
                            const mBg    = credit ? C.warningBg : C.successBg;
                            const mLabel = PAYMENT_LABELS[methodKey] ?? methodKey;
                            const expanded = expandedId === sale.id;
                            const hasReturns = (detail?.returns?.length ?? 0) > 0;
                            const totalReturned = (detail?.returns ?? []).reduce((s, r) => s + (r.total ?? 0), 0);
                            const totalReturnable = detail
                                ? Object.values(returnableByDrug(detail)).reduce((s, n) => s + Math.max(0, n), 0)
                                : 0;
                            return (
                                <TouchableOpacity
                                    key={sale.id}
                                    activeOpacity={0.8}
                                    onPress={() => openSale(sale.id)}
                                    style={{ ...card(mColor), padding: 14 }}
                                >
                                    {/* Row header */}
                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
                                        <View style={{
                                            width: 40, height: 40, borderRadius: Radius.xs,
                                            backgroundColor: mBg, justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                                        }}>
                                            <Ionicons name={credit ? 'time-outline' : 'cash-outline'} size={19} color={mColor} />
                                        </View>

                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 4 }}>
                                                <Text style={{ color: C.foreground, fontWeight: '900', fontSize: 16 }}>
                                                    {(sale.total ?? 0).toLocaleString('en-US')}
                                                </Text>
                                                <Text style={{ color: C.mutedForeground, fontSize: 10.5, fontWeight: '700' }}>د.ع</Text>
                                                {hasReturns && (
                                                    <View style={{ backgroundColor: C.dangerBg, borderRadius: Radius.xs, paddingHorizontal: 6, paddingVertical: 1 }}>
                                                        <Text style={{ color: C.danger, fontSize: 9, fontWeight: '800' }}>مرتجع جزئي</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 7, marginTop: 4 }}>
                                                <View style={{ backgroundColor: mBg, borderRadius: Radius.xs, paddingHorizontal: 7, paddingVertical: 2 }}>
                                                    <Text style={{ color: mColor, fontSize: 10, fontWeight: '800' }}>{mLabel}</Text>
                                                </View>
                                                {sale.invoiceNumber != null && (
                                                    <Text style={{ color: C.mutedForeground, fontSize: 11, fontWeight: '700' }}>
                                                        #{sale.invoiceNumber}
                                                    </Text>
                                                )}
                                                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 3 }}>
                                                    <Ionicons name="time-outline" size={11} color={C.mutedForeground} />
                                                    <Text style={{ color: C.mutedForeground, fontSize: 11, fontWeight: '600' }}>
                                                        {sale.createdAt ? formatTime(sale.createdAt, { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                                    </Text>
                                                </View>
                                                {sale.createdAt && (
                                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 3 }}>
                                                        <Ionicons name="calendar-outline" size={11} color={C.mutedForeground} />
                                                        <Text style={{ color: C.mutedForeground, fontSize: 11, fontWeight: '600' }}>
                                                            {formatDate(sale.createdAt, { day: 'numeric', month: 'short' })}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>

                                        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={C.mutedForeground} />
                                    </View>

                                    {/* ── Expanded details ───────────────── */}
                                    {expanded && (
                                        <View style={{ marginTop: 12, gap: 8 }}>
                                            <View style={{ height: 1, backgroundColor: C.border }} />

                                            {detailLoading === sale.id ? (
                                                <ActivityIndicator size="small" color={C.primary} style={{ marginVertical: 10 }} />
                                            ) : detail ? (
                                                <>
                                                    {/* Line items */}
                                                    {detail.items.map((it) => {
                                                        const returned = returnedQtyFor(detail, it.drugId);
                                                        return (
                                                            <View key={it.id} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={{ color: C.foreground, fontSize: 13, fontWeight: '700', textAlign: 'right' }} numberOfLines={1}>
                                                                        {it.drug?.tradeName ?? 'صنف'}
                                                                    </Text>
                                                                    <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 1 }}>
                                                                        {it.quantity} × {it.price.toLocaleString('en-US')} د.ع
                                                                        {returned > 0 ? `  ·  مرتجع: ${returned}` : ''}
                                                                    </Text>
                                                                </View>
                                                                <Text style={{ color: C.foreground, fontSize: 13, fontWeight: '800' }}>
                                                                    {(it.quantity * it.price).toLocaleString('en-US')}
                                                                </Text>
                                                            </View>
                                                        );
                                                    })}

                                                    <View style={{ height: 1, backgroundColor: C.border }} />

                                                    {detail.patient && (
                                                        <DetailRow C={C} label="العميل" value={detail.patient.name} />
                                                    )}
                                                    <DetailRow C={C} label="طريقة الدفع" value={mLabel} />
                                                    {(sale.discount ?? 0) > 0 && (
                                                        <DetailRow C={C} label="الخصم" value={`${(sale.discount ?? 0).toLocaleString('en-US')} د.ع`} valueColor={C.warning} />
                                                    )}
                                                    {hasReturns && (
                                                        <DetailRow
                                                            C={C}
                                                            label="مرتجعات سابقة"
                                                            value={`${detail.returns.length} — ${totalReturned.toLocaleString('en-US')} د.ع`}
                                                            valueColor={C.danger}
                                                        />
                                                    )}
                                                    <DetailRow C={C} label="الإجمالي" value={`${(sale.total ?? 0).toLocaleString('en-US')} د.ع`} valueColor={C.foreground} bold />

                                                    {/* Return action */}
                                                    {totalReturnable > 0 && (
                                                        <TouchableOpacity
                                                            onPress={() => openReturnModal(detail)}
                                                            activeOpacity={0.8}
                                                            style={{
                                                                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
                                                                gap: 6, marginTop: 4, paddingVertical: 10,
                                                                borderRadius: Radius.xs, borderWidth: 1.5,
                                                                borderColor: `${C.danger}50`, backgroundColor: C.dangerBg,
                                                            }}
                                                        >
                                                            <Ionicons name="return-down-back-outline" size={16} color={C.danger} />
                                                            <Text style={{ color: C.danger, fontSize: 13, fontWeight: '800' }}>إرجاع أصناف</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <DetailRow C={C} label="التاريخ" value={sale.createdAt ? formatDate(sale.createdAt, { weekday: 'long', day: 'numeric', month: 'long' }) : '—'} />
                                                    {sale.invoiceNumber != null && (
                                                        <DetailRow C={C} label="رقم الفاتورة" value={`#${sale.invoiceNumber}`} />
                                                    )}
                                                    <DetailRow C={C} label="الإجمالي" value={`${(sale.total ?? 0).toLocaleString('en-US')} د.ع`} valueColor={C.foreground} bold />
                                                    <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                                                        {detailFailed[sale.id] ? 'تعذّر تحميل تفاصيل الفاتورة — اسحب للتحديث وحاول مجدداً' : 'جاري تحميل التفاصيل...'}
                                                    </Text>
                                                </>
                                            )}
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}

                        {/* ── Load more ──────────────────────────────────── */}
                        {filter === 'all' && lastPageFull && (
                            <TouchableOpacity
                                onPress={onLoadMore}
                                disabled={loadingMore}
                                activeOpacity={0.8}
                                style={{
                                    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
                                    gap: 8, paddingVertical: 12, borderRadius: Radius.sm,
                                    borderWidth: 1.5, borderColor: `${C.primary}33`, backgroundColor: C.card,
                                }}
                            >
                                {loadingMore
                                    ? <ActivityIndicator size="small" color={C.primary} />
                                    : (
                                        <>
                                            <Ionicons name="chevron-down" size={15} color={C.primary} />
                                            <Text style={{ color: C.primary, fontSize: 13, fontWeight: '700' }}>تحميل المزيد</Text>
                                        </>
                                    )}
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </ScrollView>

            {/* ── Return modal ───────────────────────────────────────────── */}
            <Modal
                visible={!!returnTarget}
                transparent
                animationType="fade"
                onRequestClose={() => !submittingReturn && setReturnTarget(null)}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => !submittingReturn && setReturnTarget(null)}
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        style={{ backgroundColor: C.card, borderRadius: Radius.sm, padding: 20, gap: 14, maxHeight: '85%' }}
                    >
                        {/* Header */}
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                            <View style={{
                                width: 40, height: 40, borderRadius: Radius.xs,
                                backgroundColor: C.dangerBg, justifyContent: 'center', alignItems: 'center',
                            }}>
                                <Ionicons name="return-down-back" size={20} color={C.danger} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right' }}>
                                    إرجاع أصناف
                                </Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 1 }}>
                                    {returnTarget?.invoiceNumber != null ? `فاتورة #${returnTarget.invoiceNumber}` : 'حدد الكميات المراد إرجاعها'}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={returnAll} activeOpacity={0.8} hitSlop={6}>
                                <Text style={{ color: C.primary, fontSize: 12, fontWeight: '800' }}>إرجاع الكل</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Items with steppers */}
                        <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                            <View style={{ gap: 12 }}>
                                {modalItems.map((it) => {
                                    const max = Math.max(0, maxByDrug[it.drugId] ?? 0);
                                    const qty = returnQty[it.drugId] ?? 0;
                                    return (
                                        <View key={it.drugId} style={{
                                            flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                                            backgroundColor: C.background, borderRadius: Radius.xs, padding: 10,
                                        }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: C.foreground, fontSize: 13, fontWeight: '700', textAlign: 'right' }} numberOfLines={1}>
                                                    {it.drug?.tradeName ?? 'صنف'}
                                                </Text>
                                                <Text style={{ color: C.mutedForeground, fontSize: 11, textAlign: 'right', marginTop: 1 }}>
                                                    المتاح للإرجاع: {max} · {it.price.toLocaleString('en-US')} د.ع
                                                </Text>
                                            </View>
                                            {/* Stepper */}
                                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                                                <TouchableOpacity
                                                    onPress={() => stepQty(it.drugId, +1)}
                                                    disabled={qty >= max}
                                                    activeOpacity={0.7}
                                                    style={{
                                                        width: 30, height: 30, borderRadius: Radius.xs,
                                                        backgroundColor: qty >= max ? C.border : C.primary,
                                                        alignItems: 'center', justifyContent: 'center',
                                                    }}
                                                >
                                                    <Ionicons name="add" size={16} color="#fff" />
                                                </TouchableOpacity>
                                                <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '900', minWidth: 24, textAlign: 'center' }}>
                                                    {qty}
                                                </Text>
                                                <TouchableOpacity
                                                    onPress={() => stepQty(it.drugId, -1)}
                                                    disabled={qty <= 0}
                                                    activeOpacity={0.7}
                                                    style={{
                                                        width: 30, height: 30, borderRadius: Radius.xs,
                                                        backgroundColor: qty <= 0 ? C.border : C.danger,
                                                        alignItems: 'center', justifyContent: 'center',
                                                    }}
                                                >
                                                    <Ionicons name="remove" size={16} color="#fff" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </ScrollView>

                        {/* Refund preview */}
                        <View style={{ height: 1, backgroundColor: C.border }} />
                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 13, fontWeight: '600' }}>قيمة المرتجع</Text>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 5 }}>
                                <Text style={{ color: C.danger, fontSize: 20, fontWeight: '900' }}>
                                    {returnTotal.toLocaleString('en-US')}
                                </Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '700' }}>د.ع</Text>
                            </View>
                        </View>

                        {/* Actions */}
                        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                            <TouchableOpacity
                                onPress={submitReturn}
                                disabled={submittingReturn || returnTotal <= 0}
                                activeOpacity={0.85}
                                style={{
                                    flex: 2, flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center',
                                    gap: 6, backgroundColor: C.danger, borderRadius: Radius.sm, paddingVertical: 13,
                                    opacity: submittingReturn || returnTotal <= 0 ? 0.6 : 1,
                                }}
                            >
                                {submittingReturn
                                    ? <ActivityIndicator color="#fff" />
                                    : (
                                        <>
                                            <Ionicons name="return-down-back-outline" size={18} color="#fff" />
                                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>تأكيد الإرجاع</Text>
                                        </>
                                    )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setReturnTarget(null)}
                                disabled={submittingReturn}
                                activeOpacity={0.75}
                                style={{
                                    flex: 1, flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center',
                                    gap: 6, backgroundColor: C.card, borderRadius: Radius.sm, paddingVertical: 13,
                                    borderWidth: 1, borderColor: C.border,
                                }}
                            >
                                <Ionicons name="close-outline" size={18} color={C.mutedForeground} />
                                <Text style={{ color: C.foreground, fontWeight: '600', fontSize: 14 }}>إلغاء</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

// ── Detail row ──────────────────────────────────────────────────────────────
function DetailRow({
    C, label, value, valueColor, bold,
}: {
    C: Palette; label: string; value: string; valueColor?: string; bold?: boolean;
}) {
    return (
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: C.mutedForeground, fontSize: 12 }}>{label}</Text>
            <Text style={{ color: valueColor ?? C.foreground, fontSize: 13, fontWeight: bold ? '900' : '700' }}>
                {value}
            </Text>
        </View>
    );
}
