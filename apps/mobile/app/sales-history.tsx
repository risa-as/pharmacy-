import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, RefreshControl, Modal, Alert, ActivityIndicator,
    TextInput, KeyboardAvoidingView, Platform, Pressable, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { request, newIdempotencyKey, isNetworkError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Radius } from '../constants/colors';
import { Skeleton } from '../components/ui/Skeleton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { usePalette, useReduceMotion, Surface, StatusBadge, SegmentedTabs, AppButton, StateBlock, InfoNote, FormField, Tone } from '../components/ui/Kit';
import { Stepper } from '../components/checkout/CheckoutParts';
import { InvoiceItemsTable, InvoiceNumberChip } from '../components/sales/InvoiceParts';
import { formatDate, formatTime, iraqDateString, todayIraq } from '../utils/date';
import { formatNumber, formatIQD, formatInvoiceNumber, paymentMethodLabel, CURRENCY } from '../utils/format';

const PAGE_LIMIT = 50;
const MAX_INITIAL_PAGES = 100;
const SEARCH_DEBOUNCE_MS = 400;
const DRUG_SEARCH_MIN = 2;

// ── Types ───────────────────────────────────────────────────────────────────
interface Sale {
    id: string;
    invoiceNumber?: number | null;
    total: number;
    discount?: number;
    branchId?: string;
    patientId?: string | null;
    safeId?: string | null;
    createdAt: string;
    payment?: { method?: string | null } | null;
    // Present on search results only (GET /sales?mode=…&q=…)
    patient?: { name?: string | null } | null;
    branch?: { name?: string | null } | null;
    items?: { drugId: string; drug?: { tradeName?: string | null; barcode?: string | null } | null }[];
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
interface SaleDetail extends Omit<Sale, 'items' | 'patient'> {
    items: SaleItemRow[];
    patient?: { id: string; name: string } | null;
    returns: SaleReturnRow[];
}

type Filter = 'today' | 'week' | 'all';
type SearchMode = 'invoice' | 'drug';
type SearchError = 'failed' | 'unsupported' | null;

function methodOf(s: Sale | SaleDetail, detail?: SaleDetail): string {
    return detail?.payment?.method ?? s.payment?.method ?? (s.patientId && !s.safeId ? 'CREDIT' : 'CASH');
}

function methodTone(method: string): Tone {
    return method === 'CREDIT' ? 'warning' : method === 'CARD' ? 'primary' : 'success';
}

// Server-side date filter start (device-local midnight, matching financial.tsx)
function periodFrom(filter: Filter): Date | null {
    if (filter === 'all') return null;
    const from = new Date();
    if (filter === 'week') from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return from;
}

/** Same normalisation as the server: Arabic-Indic digits → Western, drop a leading "#". */
function normalizeInvoiceQuery(q: string): string {
    return q.trim().replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/^#/, '').trim();
}

function matchesInvoice(sale: Sale, q: string): boolean {
    const norm = normalizeInvoiceQuery(q);
    if (!norm) return false;
    if (/^\d+$/.test(norm) && sale.invoiceNumber === Number(norm)) return true;
    // Id prefix counts only for unnumbered sales (the ones displayed by id), as on the server.
    return sale.invoiceNumber == null && norm.length >= 4 && sale.id.toLowerCase().startsWith(norm.toLowerCase());
}

/** Drug names in a search result that matched the query (the desktop's highlighted line). */
function matchingDrugNames(sale: Sale, q: string): string {
    const needle = q.trim().toLowerCase();
    const names = new Set<string>();
    for (const it of sale.items ?? []) {
        const name = it.drug?.tradeName ?? '';
        if (name.toLowerCase().includes(needle) || (it.drug?.barcode ?? '').includes(q.trim())) {
            if (name) names.add(name);
        }
    }
    return Array.from(names).join('، ');
}

// Max returnable per drugId = sold − already returned (mirrors the server's return route).
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
    for (const r of detail.returns ?? []) for (const ri of r.items ?? []) if (ri.drugId === drugId) n += ri.quantity;
    return n;
}

/**
 * Sales history — one invoice-detail structure for every role
 * (navigation-map §8); data scope and actions come from the server.
 * The search bar finds an invoice by number or by a drug it contains, the same
 * two ways as the desktop POS return dialog (F9).
 */
export default function SalesHistoryScreen() {
    const C = usePalette();
    const insets = useSafeAreaInsets();
    const { branchId: authBranchId } = useAuth();

    const [sales, setSales]               = useState<Sale[]>([]);
    const [loading, setLoading]           = useState(true);
    const [failed, setFailed]             = useState(false);
    const [refreshing, setRefreshing]     = useState(false);
    const [loadingMore, setLoadingMore]   = useState(false);
    const [lastPageFull, setLastPageFull] = useState(false);
    const [filter, setFilter]             = useState<Filter>('today');
    const [expandedId, setExpandedId]     = useState<string | null>(null);

    const [details, setDetails]             = useState<Record<string, SaleDetail>>({});
    const [detailLoading, setDetailLoading] = useState<string | null>(null);
    const [detailFailed, setDetailFailed]   = useState<Record<string, boolean>>({});

    const [searchMode, setSearchMode]   = useState<SearchMode>('invoice');
    const [query, setQuery]             = useState('');
    const [results, setResults]         = useState<Sale[]>([]);
    const [searching, setSearching]     = useState(false);
    const [searchError, setSearchError] = useState<SearchError>(null);
    const searchVersion = useRef(0);

    const [returnTarget, setReturnTarget]         = useState<SaleDetail | null>(null);
    const [returnQty, setReturnQty]               = useState<Record<string, number>>({});
    const [returnNotes, setReturnNotes]           = useState('');
    const [submittingReturn, setSubmittingReturn] = useState(false);
    const [returnKey, setReturnKey]               = useState(newIdempotencyKey);
    const salesRequestVersion = useRef(0);

    const trimmedQuery = query.trim();
    const searchActive = trimmedQuery.length > 0;
    const drugQueryTooShort = searchMode === 'drug' && trimmedQuery.length < DRUG_SEARCH_MIN;

    const fetchSales = useCallback(async (offset: number, append: boolean) => {
        const requestVersion = ++salesRequestVersion.current;
        try {
            const from = periodFrom(filter);
            let nextOffset = append ? offset : 0;
            let page: Sale[] = [];
            const collected: Sale[] = [];
            let pageCount = 0;

            // The summary must be based on the complete selected period, not
            // only the first page returned by /sales (which is limited to 50).
            do {
                let q = `?limit=${PAGE_LIMIT}&offset=${nextOffset}`;
                if (from) q += `&from=${from.toISOString()}`;
                const data = await request<Sale[]>(`/sales${q}`);
                if (requestVersion !== salesRequestVersion.current) return;
                page = Array.isArray(data) ? data : [];
                collected.push(...page);
                nextOffset += page.length;
                pageCount += 1;
            } while (!append && page.length === PAGE_LIMIT && pageCount < MAX_INITIAL_PAGES);

            setSales(prev => (append ? [...prev, ...collected] : collected));
            setLastPageFull(page.length === PAGE_LIMIT);
            setFailed(false);
        } catch (err) {
            console.error('SalesHistoryScreen:', err);
            if (requestVersion === salesRequestVersion.current && !append) { setSales([]); setFailed(true); }
        } finally {
            if (requestVersion === salesRequestVersion.current) {
                setLoading(false);
                setRefreshing(false);
                setLoadingMore(false);
            }
        }
    }, [filter]);

    useEffect(() => {
        setLoading(true);
        setExpandedId(null);
        fetchSales(0, false);
    }, [fetchSales]);

    const loadDetail = useCallback(async (saleId: string) => {
        setDetailLoading(saleId);
        try {
            const d = await request<SaleDetail>(`/sales/${saleId}`);
            setDetails(prev => ({ ...prev, [saleId]: d }));
            setDetailFailed(prev => ({ ...prev, [saleId]: false }));
        } catch (err) {
            console.error('SalesHistoryScreen detail:', err);
            setDetailFailed(prev => ({ ...prev, [saleId]: true }));
        } finally {
            setDetailLoading(current => (current === saleId ? null : current));
        }
    }, []);

    // ── Search ──────────────────────────────────────────────────────────────
    const runSearch = useCallback(async (mode: SearchMode, q: string) => {
        const version = ++searchVersion.current;
        setSearching(true);
        setSearchError(null);
        try {
            const data = await request<Sale[]>(`/sales?mode=${mode}&q=${encodeURIComponent(q)}`);
            if (version !== searchVersion.current) return;
            const list = Array.isArray(data) ? data : [];
            // A server without search ignores mode/q and returns the latest
            // sales — detect that instead of showing unrelated invoices.
            const supported = mode === 'drug'
                ? list.every(s => Array.isArray(s.items))
                : list.every(s => matchesInvoice(s, q));
            if (!supported) {
                setResults([]);
                setSearchError('unsupported');
                return;
            }
            setResults(list);
            if (mode === 'invoice' && list.length === 1) {
                setExpandedId(list[0].id);
                loadDetail(list[0].id);
            }
        } catch (err) {
            console.error('SalesHistoryScreen search:', err);
            if (version === searchVersion.current) { setResults([]); setSearchError('failed'); }
        } finally {
            if (version === searchVersion.current) setSearching(false);
        }
    }, [loadDetail]);

    useEffect(() => {
        if (!trimmedQuery || drugQueryTooShort) {
            searchVersion.current++;
            setResults([]);
            setSearching(false);
            setSearchError(null);
            return;
        }
        setSearching(true);
        const timer = setTimeout(() => runSearch(searchMode, trimmedQuery), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [trimmedQuery, searchMode, drugQueryTooShort, runSearch]);

    const changeSearchMode = (mode: SearchMode) => {
        if (mode === searchMode) return;
        setSearchMode(mode);
        setQuery('');
        setExpandedId(null);
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchSales(0, false);
        if (trimmedQuery && !drugQueryTooShort) runSearch(searchMode, trimmedQuery);
    }, [fetchSales, runSearch, searchMode, trimmedQuery, drugQueryTooShort]);
    const onLoadMore = useCallback(() => { setLoadingMore(true); fetchSales(sales.length, true); }, [fetchSales, sales.length]);
    const onFilterChange = useCallback((next: Filter) => {
        if (next === filter) return;
        // Clear the previous period immediately so its summary cannot remain visible
        // while the new period is being fetched.
        setSales([]);
        setExpandedId(null);
        setLastPageFull(false);
        setLoading(true);
        setFilter(next);
    }, [filter]);

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
    const filterLabel = filter === 'today' ? 'اليوم' : filter === 'week' ? 'آخر أسبوع' : 'كل الفترات';

    // Group by Iraq calendar day, newest first.
    const groups = useMemo(() => {
        const map = new Map<string, Sale[]>();
        for (const s of filtered) {
            const key = s.createdAt ? iraqDateString(s.createdAt) : 'unknown';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(s);
        }
        return Array.from(map.entries());
    }, [filtered]);

    const openSale = useCallback((saleId: string) => {
        const willExpand = expandedId !== saleId;
        setExpandedId(willExpand ? saleId : null);
        if (!willExpand || details[saleId] || detailLoading === saleId) return;
        loadDetail(saleId);
    }, [expandedId, details, detailLoading, loadDetail]);

    // The return route only accepts sales from the user's own branch.
    const canReturnSale = useCallback(
        (sale: Sale) => !!authBranchId && (!sale.branchId || sale.branchId === authBranchId),
        [authBranchId],
    );

    // ── Return flow ─────────────────────────────────────────────────────────
    const maxByDrug = useMemo(() => (returnTarget ? returnableByDrug(returnTarget) : {}), [returnTarget]);

    // Every sold drug is listed (like the desktop table); fully returned ones stay visible but disabled.
    const modalItems = useMemo(() => {
        if (!returnTarget) return [];
        const seen = new Map<string, SaleItemRow>();
        for (const it of returnTarget.items ?? []) if (it.quantity > 0) seen.set(it.drugId, it);
        return Array.from(seen.values());
    }, [returnTarget]);

    const returnTotal = useMemo(
        () => modalItems.reduce((sum, it) => sum + (returnQty[it.drugId] ?? 0) * it.price, 0),
        [modalItems, returnQty],
    );
    const previouslyReturned = useMemo(
        () => (returnTarget?.returns ?? []).reduce((sum, r) => sum + (r.total ?? 0), 0),
        [returnTarget],
    );

    const openReturnModal = (detail: SaleDetail) => {
        const init: Record<string, number> = {};
        for (const it of detail.items ?? []) init[it.drugId] = 0;
        setReturnQty(init);
        setReturnNotes('');
        setReturnKey(newIdempotencyKey());
        setReturnTarget(detail);
    };

    const stepQty = (drugId: string, delta: number) => {
        const max = Math.max(0, maxByDrug[drugId] ?? 0);
        setReturnQty(prev => ({ ...prev, [drugId]: Math.max(0, Math.min(max, (prev[drugId] ?? 0) + delta)) }));
    };

    const returnAll = () => {
        setReturnQty(Object.fromEntries(modalItems.map(it => [it.drugId, Math.max(0, maxByDrug[it.drugId] ?? 0)])));
    };

    // A new key whenever the return itself changes; retries of the same
    // quantities keep the key so the server can drop a duplicate.
    const returnSignature = useMemo(
        () => JSON.stringify([returnTarget?.id, modalItems.map(it => [it.drugId, returnQty[it.drugId] ?? 0]), returnNotes.trim()]),
        [returnTarget?.id, modalItems, returnQty, returnNotes],
    );
    useEffect(() => { setReturnKey(newIdempotencyKey()); }, [returnSignature]);

    const finishReturn = (saleId: string, message: string) => {
        setReturnTarget(null);
        setDetails(prev => { const next = { ...prev }; delete next[saleId]; return next; });
        fetchSales(0, false);
        // Keep the searched invoice open with its refreshed returns.
        if (expandedId === saleId) loadDetail(saleId);
        Alert.alert('تم الإرجاع', message);
    };

    const doSubmitReturn = async (items: { drugId: string; quantity: number }[]) => {
        if (!returnTarget || submittingReturn) return;
        setSubmittingReturn(true);
        const saleId = returnTarget.id;
        const returnsBefore = returnTarget.returns?.length ?? 0;
        try {
            const res = await request<{ duplicate?: boolean }>(`/sales/${saleId}/return`, {
                method: 'POST',
                headers: { 'x-idempotency-key': returnKey },
                body: JSON.stringify({ items, notes: returnNotes.trim() || undefined }),
            });
            finishReturn(saleId, res?.duplicate
                ? 'هذا الإرجاع مسجّل مسبقاً، ولم يُكرَّر.'
                : 'تمت معالجة المرتجع وإعادة الكميات إلى المخزون.');
        } catch (err: any) {
            console.error('SalesHistoryScreen return:', err);
            if (isNetworkError(err)) {
                // The response may have been lost after the server committed:
                // check the invoice before telling the user it failed.
                const fresh = await request<SaleDetail>(`/sales/${saleId}`).catch(() => null);
                if (fresh && (fresh.returns?.length ?? 0) > returnsBefore) {
                    finishReturn(saleId, 'انقطع الاتصال لكن الإرجاع سُجّل على الخادم.');
                    return;
                }
                Alert.alert(
                    'تعذّر التأكد من الإرجاع',
                    fresh
                        ? 'لم يُسجَّل الإرجاع. أعد المحاولة بنفس الكميات.'
                        : 'انقطع الاتصال. أعد المحاولة بنفس الكميات؛ لن يُسجَّل الإرجاع مرتين.',
                );
                return;
            }
            Alert.alert('تعذّر الإرجاع', err?.message || 'تعذّرت معالجة المرتجع');
        } finally {
            setSubmittingReturn(false);
        }
    };

    const submitReturn = () => {
        if (!returnTarget || submittingReturn) return;
        const items = modalItems
            .filter(it => (returnQty[it.drugId] ?? 0) > 0)
            .map(it => ({ drugId: it.drugId, quantity: returnQty[it.drugId] }));
        if (items.length === 0) { Alert.alert('تنبيه', 'حدد كمية واحدة على الأقل للإرجاع'); return; }
        Alert.alert(
            'تأكيد الإرجاع',
            `هل أنت متأكد من إرجاع بضاعة بقيمة ${formatIQD(returnTotal)}؟`,
            [
                { text: 'إلغاء', style: 'cancel' },
                { text: 'تأكيد الإرجاع', style: 'destructive', onPress: () => doSubmitReturn(items) },
            ],
        );
    };

    const renderSaleCard = (sale: Sale, opts?: { showDate?: boolean; matchLine?: string }) => (
        <SaleCard
            key={sale.id}
            sale={sale}
            detail={details[sale.id]}
            expanded={expandedId === sale.id}
            loadingDetail={detailLoading === sale.id}
            detailFailed={!!detailFailed[sale.id]}
            canReturn={canReturnSale(sale)}
            showDate={opts?.showDate}
            matchLine={opts?.matchLine}
            onToggle={() => openSale(sale.id)}
            onReturn={openReturnModal}
        />
    );

    const returnMethod = returnTarget ? methodOf(returnTarget) : 'CASH';
    const refundNote = returnMethod === 'CREDIT'
        ? `يُخصم المبلغ من دين العميل${returnTarget?.patient?.name ? ` ${returnTarget.patient.name}` : ''}.`
        : returnMethod === 'CARD'
            ? 'بيع بالبطاقة: لا يُسحب المبلغ من الصندوق. سوِّ الاسترداد مع جهاز البطاقة.'
            : 'يُصرف المبلغ نقداً من الصندوق.';

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <ScreenHeader title="سجل المبيعات" fallbackHref="/(tabs)/more" />

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 12 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            >
                {/* ── Search (invoice number or drug) ─────────────────────── */}
                <View style={{ gap: 8 }}>
                    <View style={{
                        flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
                        backgroundColor: C.card, borderWidth: 1, borderColor: searchActive ? C.primary : C.border,
                        borderRadius: Radius.control, paddingRight: 12, paddingLeft: 6, height: 50,
                    }}>
                        <Ionicons name="search-outline" size={20} color={searchActive ? C.primary : C.mutedForeground} />
                        <TextInput
                            value={query}
                            onChangeText={setQuery}
                            placeholder={searchMode === 'invoice' ? 'رقم الفاتورة، مثال 1048' : 'اسم الدواء أو الباركود'}
                            placeholderTextColor={C.mutedForeground}
                            // Text keyboard in both modes: invoices without a number show an id prefix (letters).
                            keyboardType="default"
                            returnKeyType="search"
                            onSubmitEditing={() => { if (trimmedQuery && !drugQueryTooShort) runSearch(searchMode, trimmedQuery); }}
                            autoCorrect={false}
                            autoCapitalize="none"
                            accessibilityLabel={searchMode === 'invoice' ? 'البحث برقم الفاتورة' : 'البحث باسم الدواء أو الباركود'}
                            style={{ flex: 1, color: C.foreground, fontSize: 15, textAlign: 'right', paddingVertical: 0 }}
                        />
                        {searching ? (
                            <ActivityIndicator size="small" color={C.primary} />
                        ) : searchActive ? (
                            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="مسح البحث">
                                <Ionicons name="close-circle" size={20} color={C.mutedForeground} />
                            </TouchableOpacity>
                        ) : null}
                        <View style={{ width: 1, height: 28, backgroundColor: C.border }} />
                        <SearchModeSwitch mode={searchMode} onToggle={() => changeSearchMode(searchMode === 'invoice' ? 'drug' : 'invoice')} />
                    </View>
                    <ReturnHint mode={searchMode} />
                </View>

                {searchActive ? (
                    <SearchResults
                        mode={searchMode}
                        query={trimmedQuery}
                        tooShort={drugQueryTooShort}
                        searching={searching}
                        error={searchError}
                        results={results}
                        onRetry={() => runSearch(searchMode, trimmedQuery)}
                        renderSale={sale => renderSaleCard(sale, {
                            showDate: true,
                            matchLine: searchMode === 'drug' ? matchingDrugNames(sale, trimmedQuery) : undefined,
                        })}
                    />
                ) : (
                    <>
                        <SegmentedTabs<Filter>
                            items={[{ key: 'today', label: 'اليوم' }, { key: 'week', label: 'أسبوع' }, { key: 'all', label: 'الكل' }]}
                            value={filter}
                            onChange={onFilterChange}
                        />

                        {loading && !refreshing ? (
                            <View style={{ gap: 12 }}>
                                {[1, 2, 3, 4].map(i => <Skeleton key={i} height={72} radius={Radius.card} />)}
                            </View>
                        ) : failed ? (
                            <StateBlock icon="cloud-offline-outline" title="تعذّر تحميل المبيعات" message="تحقق من الاتصال ثم أعد المحاولة." actionLabel="إعادة المحاولة" onAction={onRefresh} />
                        ) : (
                            <>
                                <Surface style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 14 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: C.mutedForeground, fontSize: 13.5, textAlign: 'right' }}>إجمالي الفواتير · {filterLabel}</Text>
                                        <Text style={{ color: C.foreground, fontSize: 26, fontWeight: '900', textAlign: 'right' }}>
                                            {formatNumber(summaryTotal)} <Text style={{ fontSize: 14, color: C.mutedForeground }}>{CURRENCY}</Text>
                                        </Text>
                                    </View>
                                    <View style={{ backgroundColor: C.primaryMuted, borderRadius: Radius.control, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center' }}>
                                        <Text style={{ color: C.primary, fontSize: 22, fontWeight: '900' }}>{formatNumber(filtered.length)}</Text>
                                        <Text style={{ color: C.mutedForeground, fontSize: 12 }}>فاتورة</Text>
                                    </View>
                                </Surface>

                                {filtered.length === 0 ? (
                                    <StateBlock icon="receipt-outline" title="لا توجد مبيعات" message="لم يتم تسجيل أي فاتورة في هذه الفترة" />
                                ) : (
                                    <>
                                        {groups.map(([dayKey, daySales]) => (
                                            <View key={dayKey} style={{ gap: 10 }}>
                                                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right', marginTop: 4 }}>
                                                    {daySales[0]?.createdAt ? formatDate(daySales[0].createdAt, { weekday: 'long', day: 'numeric', month: 'long' }) : '—'}
                                                </Text>
                                                {daySales.map(sale => renderSaleCard(sale))}
                                            </View>
                                        ))}

                                        {filter === 'all' && lastPageFull && (
                                            <AppButton label="تحميل المزيد" icon="chevron-down" variant="outline" loading={loadingMore} onPress={onLoadMore} />
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </>
                )}
            </ScrollView>

            {/* ── Return review (same fields as the desktop return dialog) ─── */}
            <Modal visible={!!returnTarget} transparent animationType="fade" onRequestClose={() => !submittingReturn && setReturnTarget(null)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
                        <View style={{ backgroundColor: C.card, borderRadius: Radius.card, padding: 18, gap: 12, maxHeight: '90%' }}>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                                <View style={{ width: 40, height: 40, borderRadius: Radius.control, backgroundColor: C.dangerBg, alignItems: 'center', justifyContent: 'center' }}>
                                    <Ionicons name="return-down-back-outline" size={20} color={C.danger} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '800', textAlign: 'right' }}>إرجاع بضاعة</Text>
                                    <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 1 }}>
                                        {returnTarget ? `فاتورة ${formatInvoiceNumber(returnTarget)} · حدد الكميات المرجعة` : ''}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={returnAll} hitSlop={6} disabled={submittingReturn}>
                                    <Text style={{ color: C.primary, fontSize: 13, fontWeight: '800' }}>إرجاع الكل</Text>
                                </TouchableOpacity>
                            </View>

                            {returnTarget && (
                                <View style={{ backgroundColor: C.background, borderRadius: Radius.control, padding: 10, gap: 6 }}>
                                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ color: C.mutedForeground, fontSize: 13 }}>طريقة الدفع</Text>
                                        <StatusBadge label={paymentMethodLabel(returnMethod)} tone={methodTone(returnMethod)} />
                                    </View>
                                    <DetailRow label="إجمالي الفاتورة" value={formatIQD(returnTarget.total ?? 0)} />
                                    {previouslyReturned > 0 && (
                                        <>
                                            <DetailRow label="مرتجع سابقاً" value={formatIQD(previouslyReturned)} tone="danger" />
                                            <DetailRow label="الصافي" value={formatIQD((returnTarget.total ?? 0) - previouslyReturned)} />
                                        </>
                                    )}
                                </View>
                            )}

                            <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                <View style={{ gap: 8 }}>
                                    {modalItems.map(it => {
                                        const max = Math.max(0, maxByDrug[it.drugId] ?? 0);
                                        const qty = returnQty[it.drugId] ?? 0;
                                        const returned = returnTarget ? returnedQtyFor(returnTarget, it.drugId) : 0;
                                        const exhausted = max === 0;
                                        return (
                                            <View key={it.drugId} style={{
                                                flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                                                borderWidth: 1, borderColor: qty > 0 ? C.danger : C.border,
                                                borderRadius: Radius.control, padding: 10, opacity: exhausted ? 0.55 : 1,
                                            }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '700', textAlign: 'right' }} numberOfLines={1}>{it.drug?.tradeName ?? 'صنف'}</Text>
                                                    <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 1 }}>
                                                        {exhausted ? 'أُرجع بالكامل' : `المتاح ${formatNumber(max)} · ${formatIQD(it.price)}`}
                                                    </Text>
                                                    {returned > 0 && !exhausted && (
                                                        <Text style={{ color: C.warning, fontSize: 11.5, textAlign: 'right' }}>تم إرجاع {formatNumber(returned)} سابقاً</Text>
                                                    )}
                                                </View>
                                                {!exhausted && (
                                                    <Stepper value={qty} onMinus={() => stepQty(it.drugId, -1)} onPlus={() => stepQty(it.drugId, 1)} minusDisabled={qty <= 0} plusDisabled={qty >= max} />
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>
                            </ScrollView>

                            <FormField
                                label="سبب الإرجاع (اختياري)"
                                value={returnNotes}
                                onChangeText={setReturnNotes}
                                placeholder="مثال: خطأ في الصرف، أو رغبة العميل"
                                editable={!submittingReturn}
                                maxLength={200}
                            />

                            <InfoNote tone={returnMethod === 'CARD' ? 'warning' : 'primary'} text={refundNote} />

                            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 }}>
                                <Text style={{ color: C.mutedForeground, fontSize: 14, fontWeight: '700' }}>المبلغ المسترد</Text>
                                <Text style={{ color: C.danger, fontSize: 22, fontWeight: '900' }}>{formatIQD(returnTotal)}</Text>
                            </View>

                            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                                <AppButton label="تأكيد الإرجاع" icon="return-down-back-outline" variant="danger" compact loading={submittingReturn} disabled={returnTotal <= 0} style={{ flex: 2 }} onPress={submitReturn} />
                                <AppButton label="إلغاء" variant="outline" compact disabled={submittingReturn} style={{ flex: 1 }} onPress={() => setReturnTarget(null)} />
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const SWITCH_SEGMENT = 38;
const SWITCH_PAD = 3;

/**
 * Two-state switch inside the search field: invoice number ↔ drug name.
 * A blue thumb slides under the active icon (right = invoice, left = drug).
 */
function SearchModeSwitch({ mode, onToggle }: { mode: SearchMode; onToggle: () => void }) {
    const C = usePalette();
    const reduceMotion = useReduceMotion();
    const progress = useRef(new Animated.Value(mode === 'drug' ? 1 : 0)).current;

    useEffect(() => {
        const toValue = mode === 'drug' ? 1 : 0;
        if (reduceMotion) { progress.setValue(toValue); return; }
        Animated.spring(progress, { toValue, useNativeDriver: true, speed: 22, bounciness: 6 }).start();
    }, [mode, reduceMotion, progress]);

    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -SWITCH_SEGMENT] });
    const segment = (key: SearchMode, icon: React.ComponentProps<typeof Ionicons>['name']) => (
        <View style={{ width: SWITCH_SEGMENT, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={18} color={mode === key ? '#FFFFFF' : C.mutedForeground} />
        </View>
    );

    return (
        <Pressable
            onPress={onToggle}
            hitSlop={6}
            accessibilityRole="switch"
            accessibilityState={{ checked: mode === 'drug' }}
            accessibilityLabel={mode === 'invoice' ? 'البحث برقم الفاتورة، اضغط للبحث باسم الدواء' : 'البحث باسم الدواء، اضغط للبحث برقم الفاتورة'}
            style={({ pressed }) => ({
                width: SWITCH_SEGMENT * 2 + SWITCH_PAD * 2, height: 38,
                backgroundColor: C.input, borderRadius: Radius.control, opacity: pressed ? 0.85 : 1,
            })}
        >
            {/* Thumb and icons share the same absolute inset so they line up exactly. */}
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute', top: SWITCH_PAD, bottom: SWITCH_PAD, right: SWITCH_PAD, width: SWITCH_SEGMENT,
                    backgroundColor: C.primary, borderRadius: Radius.control - 1,
                    transform: [{ translateX }],
                }}
            />
            <View pointerEvents="none" style={{ position: 'absolute', top: SWITCH_PAD, bottom: SWITCH_PAD, right: SWITCH_PAD, left: SWITCH_PAD, flexDirection: 'row-reverse' }}>
                {segment('invoice', 'receipt-outline')}
                {segment('drug', 'medkit-outline')}
            </View>
        </Pressable>
    );
}

/**
 * Says what the search is for — returning medicines — and which mode is on.
 * On every mode change the text fades in and the return arrow nudges once.
 */
function ReturnHint({ mode }: { mode: SearchMode }) {
    const C = usePalette();
    const reduceMotion = useReduceMotion();
    const fade = useRef(new Animated.Value(1)).current;
    const nudge = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (reduceMotion) { fade.setValue(1); nudge.setValue(0); return; }
        fade.setValue(0.2);
        Animated.parallel([
            Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.sequence([
                Animated.timing(nudge, { toValue: -4, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.spring(nudge, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 10 }),
            ]),
        ]).start();
    }, [mode, reduceMotion, fade, nudge]);

    return (
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
            <Animated.View style={{
                width: 24, height: 24, borderRadius: Radius.badge, backgroundColor: C.dangerBg,
                alignItems: 'center', justifyContent: 'center', transform: [{ translateX: nudge }],
            }}>
                <Ionicons name="return-down-back-outline" size={15} color={C.danger} />
            </Animated.View>
            <Animated.Text style={{ flex: 1, color: C.mutedForeground, fontSize: 12.5, textAlign: 'right', opacity: fade }} numberOfLines={1}>
                <Text style={{ color: C.danger, fontWeight: '800' }}>إرجاع أدوية · </Text>
                {mode === 'invoice' ? 'ابحث برقم الفاتورة المطبوع على الإيصال' : 'ابحث باسم الدواء أو الباركود (آخر 30 يوماً)'}
            </Animated.Text>
        </View>
    );
}

function SearchResults({ mode, query, tooShort, searching, error, results, onRetry, renderSale }: {
    mode: SearchMode; query: string; tooShort: boolean; searching: boolean; error: SearchError;
    results: Sale[]; onRetry: () => void; renderSale: (sale: Sale) => React.ReactNode;
}) {
    const C = usePalette();

    if (tooShort) {
        return <InfoNote text={`اكتب ${DRUG_SEARCH_MIN} أحرف على الأقل للبحث باسم الدواء.`} />;
    }
    if (searching && results.length === 0) {
        return (
            <View style={{ gap: 12 }}>
                {[1, 2, 3].map(i => <Skeleton key={i} height={72} radius={Radius.card} />)}
            </View>
        );
    }
    if (error === 'failed') {
        return <StateBlock icon="cloud-offline-outline" title="تعذّر البحث" message="تحقق من الاتصال ثم أعد المحاولة." actionLabel="إعادة المحاولة" onAction={onRetry} />;
    }
    if (error === 'unsupported') {
        return <StateBlock icon="construct-outline" title="البحث غير متاح على الخادم الحالي" message="يحتاج الخادم إلى تحديث لتفعيل البحث عن الفواتير." />;
    }
    if (results.length === 0) {
        return mode === 'invoice'
            ? <StateBlock icon="receipt-outline" title="الفاتورة غير موجودة" message={`لا توجد فاتورة برقم «${query}». تأكد من الرقم المطبوع على الإيصال.`} />
            : <StateBlock icon="medkit-outline" title="لا توجد فواتير" message={`لا توجد فواتير تحتوي على «${query}» في آخر 30 يوماً.`} />;
    }

    return (
        <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }}>نتائج البحث</Text>
                <Text style={{ color: C.mutedForeground, fontSize: 12.5 }}>
                    {formatNumber(results.length)} فاتورة{mode === 'drug' ? ' · آخر 30 يوماً' : ''}
                </Text>
            </View>
            {results.map(renderSale)}
        </View>
    );
}

function SaleCard({ sale, detail, expanded, loadingDetail, detailFailed, canReturn, showDate, matchLine, onToggle, onReturn }: {
    sale: Sale; detail?: SaleDetail; expanded: boolean; loadingDetail: boolean; detailFailed: boolean;
    canReturn: boolean; showDate?: boolean; matchLine?: string;
    onToggle: () => void; onReturn: (d: SaleDetail) => void;
}) {
    const C = usePalette();
    const method = methodOf(sale, detail);
    const hasReturns = (detail?.returns?.length ?? 0) > 0;
    const totalReturned = (detail?.returns ?? []).reduce((s, r) => s + (r.total ?? 0), 0);
    const totalReturnable = detail ? Object.values(returnableByDrug(detail)).reduce((s, n) => s + Math.max(0, n), 0) : 0;
    const time = sale.createdAt ? formatTime(sale.createdAt, { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const when = showDate && sale.createdAt ? `${formatDate(sale.createdAt, { day: 'numeric', month: 'short' })} · ${time}` : time;
    const meta = [sale.patient?.name, sale.branch?.name].filter(Boolean).join(' · ');

    return (
        <Surface padded={false} style={{ overflow: 'hidden', borderColor: expanded ? C.primary : C.border }}>
            <TouchableOpacity onPress={onToggle} activeOpacity={0.8} accessibilityRole="button" accessibilityState={{ expanded }}
                style={{ padding: 14, gap: 6 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                    <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900' }}>
                        {formatNumber(sale.total ?? 0)} <Text style={{ fontSize: 12, color: C.mutedForeground }}>{CURRENCY}</Text>
                    </Text>
                    <StatusBadge label={paymentMethodLabel(method)} tone={methodTone(method)} />
                    <View style={{ flex: 1 }} />
                    <InvoiceNumberChip label={formatInvoiceNumber(sale)} />
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={C.mutedForeground} />
                </View>
                {/* Date/time on its own line so a full date can never run into
                    the invoice number (same card as the patient file). */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="time-outline" size={13} color={C.mutedForeground} />
                    <Text style={{ color: C.mutedForeground, fontSize: 12.5 }} numberOfLines={1}>{when}</Text>
                    {meta ? (
                        <Text style={{ flexShrink: 1, color: C.mutedForeground, fontSize: 12.5, textAlign: 'right' }} numberOfLines={1}>· {meta}</Text>
                    ) : null}
                </View>
                {matchLine ? (
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="medkit-outline" size={13} color={C.primary} />
                        <Text style={{ flexShrink: 1, color: C.primary, fontSize: 12.5, fontWeight: '700', textAlign: 'right' }} numberOfLines={1}>{matchLine}</Text>
                    </View>
                ) : null}
            </TouchableOpacity>

            {expanded && (
                <View style={{ borderTopWidth: 1, borderTopColor: C.border, padding: 14, gap: 10 }}>
                    {loadingDetail ? (
                        <ActivityIndicator size="small" color={C.primary} style={{ marginVertical: 10 }} />
                    ) : detail ? (
                        <>
                            <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '800', textAlign: 'right' }}>التفاصيل</Text>
                            <InvoiceItemsTable
                                items={detail.items}
                                total={sale.total ?? 0}
                                returnedByDrug={Object.fromEntries(detail.items.map(it => [it.drugId, returnedQtyFor(detail, it.drugId)]))}
                            />

                            {detail.patient && <DetailRow label="العميل" value={detail.patient.name} />}
                            {(sale.discount ?? 0) > 0 && <DetailRow label="الخصم" value={formatIQD(sale.discount)} tone="warning" />}
                            {hasReturns && <DetailRow label="مرتجعات سابقة" value={`${formatNumber(detail.returns.length)} — ${formatIQD(totalReturned)}`} tone="danger" />}

                            {totalReturnable > 0 && canReturn && (
                                <AppButton
                                    label="إرجاع أدوية من هذه الفاتورة"
                                    icon="return-down-back-outline"
                                    variant="dangerOutline"
                                    compact
                                    onPress={() => onReturn(detail)}
                                />
                            )}
                            {totalReturnable > 0 && !canReturn && (
                                <InfoNote tone="warning" text="الإرجاع متاح فقط من حساب مرتبط بفرع هذه الفاتورة." />
                            )}
                            {detail.items.length > 0 && totalReturnable === 0 && (
                                <InfoNote text="أُرجعت كل أدوية هذه الفاتورة." />
                            )}
                        </>
                    ) : (
                        <Text style={{ color: detailFailed ? C.danger : C.mutedForeground, fontSize: 13, textAlign: 'right' }}>
                            {detailFailed ? 'تعذّر تحميل تفاصيل الفاتورة — اسحب للتحديث وحاول مجدداً' : 'جاري تحميل التفاصيل...'}
                        </Text>
                    )}
                </View>
            )}
        </Surface>
    );
}

function DetailRow({ label, value, tone }: { label: string; value: string; tone?: 'warning' | 'danger' }) {
    const C = usePalette();
    return (
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: C.mutedForeground, fontSize: 13 }}>{label}</Text>
            <Text style={{ color: tone === 'warning' ? C.warning : tone === 'danger' ? C.danger : C.foreground, fontSize: 14, fontWeight: '700' }}>{value}</Text>
        </View>
    );
}
