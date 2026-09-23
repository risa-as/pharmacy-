import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    RefreshControl, ActivityIndicator, Alert, Modal, ScrollView,
    InteractionManager, StyleSheet, Animated, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { apiService } from '../../services/api';
import { dbService } from '../../services/db';
import { syncService } from '../../services/sync';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { managerPalette, Radius } from '../../constants/colors';
import { EmptyState } from '../../components/ui/EmptyState';
import { ScreenHeader, HeaderIconButton } from '../../components/ui/ScreenHeader';
import { StatusBadge, SegmentedTabs, FormField, AppButton } from '../../components/ui/Kit';
import { formatNumber, CURRENCY } from '../../utils/format';
import { consumeManualEntry } from '../../utils/manual-entry';
import { Skeleton } from '../../components/ui/Skeleton';
import { BranchSelector } from '../../components/BranchSelector';
import { useSyncStatus } from '../../context/SyncContext';

type TabKey = 'all' | 'low-stock' | 'out' | 'near-expiry' | 'expired';
type SortKey = 'name' | 'quantity' | 'expiry';

/**
 * Auto-format a typed expiry date into YYYY-MM-DD as the user types digits, so
 * they never have to enter the dashes manually. Strips non-digits, then inserts
 * the separators after the year and month segments.
 */
function formatExpiry(raw: string): string {
    const d = raw.replace(/\D/g, '').slice(0, 8); // YYYYMMDD
    let out = d.slice(0, 4);
    if (d.length > 4) out += '-' + d.slice(4, 6);
    if (d.length > 6) out += '-' + d.slice(6, 8);
    return out;
}

// Normalizes a typed expiry date and flags suspicious values. Employees
// frequently type "27" for the year instead of "2027" — mirrors the web/desktop
// checkExpiry guard.
function checkExpiry(raw: string): { value: string; warning: string | null } {
    const value = (raw ?? '').trim();
    if (!value) return { value: '', warning: null };
    const m = value.match(/^(\d{1,4})-(\d{2})-(\d{2})$/);
    if (!m) {
        return { value, warning: 'التاريخ غير مكتمل أو غير صحيح — المطلوب: سنة-شهر-يوم (مثال: 2027-05-01).' };
    }
    let year = parseInt(m[1], 10);
    if (year >= 1 && year < 100) year = 2000 + year;
    else if (year >= 100 && year < 1000) year = 2000 + (year % 100);
    const fixed = `${year}-${m[2]}-${m[3]}`;
    const parsed = new Date(`${fixed}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let warning: string | null = null;
    if (isNaN(parsed.getTime())) {
        warning = 'التاريخ غير صحيح — تأكد من الشهر واليوم.';
    } else if (parsed < today) {
        warning = `تاريخ الانتهاء (${fixed}) منتهي بالفعل! تأكد من السنة — هل تقصد ${today.getFullYear() + 1} بدلاً من ${year}؟`;
    } else if (year > today.getFullYear() + 15) {
        warning = `تاريخ الانتهاء (${fixed}) بعيد جداً (أكثر من 15 سنة) — تأكد من صحة السنة.`;
    }
    return { value: fixed, warning };
}

/**
 * فارق التكلفة فوق سعر البيع الذي يُعتبر خطأ إدخال شبه مؤكد (دينار).
 * تجاوزه يعني غالباً أن سعر الباكيت أُدخل دون قسمته على عدد الأشرطة.
 */
const COST_OVER_PRICE_GAP = 500;

interface InventoryItem {
    id: string;
    drugId?: string;
    barcode?: string;
    drugName: string;
    quantity: number;
    price: number;
    reorderLevel: number;
    expiryDate?: string;
    isQuickSale?: boolean;
    scientificName?: string;
    /** Branch of this inventory row; the quick-sale flag is per branch. */
    branchId?: string;
}

const TABS: { key: TabKey; label: string }[] = [
    { key: 'all',          label: 'الكل' },
    { key: 'low-stock',    label: 'نواقص' },
    { key: 'out',          label: 'نافد' },
    { key: 'near-expiry',  label: 'قارب الانتهاء' },
    { key: 'expired',      label: 'منتهية' },
];

const TAB_KEYS = TABS.map(t => t.key);
const isTabKey = (v: unknown): v is TabKey => typeof v === 'string' && (TAB_KEYS as string[]).includes(v);

const SORTS: { key: SortKey; label: string; icon: any }[] = [
    { key: 'name',     label: 'الاسم',     icon: 'text-outline' },
    { key: 'quantity', label: 'الكمية',    icon: 'layers-outline' },
    { key: 'expiry',   label: 'الصلاحية',  icon: 'calendar-outline' },
];

function getDaysToExpiry(expiryDate?: string): number | null {
    if (!expiryDate) return null;
    const diff = new Date(expiryDate).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function InventoryScreen() {
    const { isDarkMode } = useTheme();
    const { isAdmin, branchId: authBranchId } = useAuth();
    const { triggerSync } = useSyncStatus();
    const C = managerPalette(isDarkMode);

    const [items, setItems]               = useState<InventoryItem[]>([]);
    const [search, setSearch]             = useState('');
    const searchRef                       = useRef<TextInput>(null);
    const [activeTab, setActiveTab]       = useState<TabKey>('all');
    const [sortKey, setSortKey]           = useState<SortKey>('name');
    const [sortAsc, setSortAsc]           = useState(true);
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [isSorting, setIsSorting]       = useState(false);
    const [sorted, setSorted]             = useState<InventoryItem[]>([]);
    const [refreshing, setRefreshing]     = useState(false);
    const [loading, setLoading]           = useState(true);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
    const [isOnline, setIsOnline]         = useState(true);
    // Only the most recent load may update the screen. This prevents an older
    // branch/pre-save request from replacing the result of a newer refresh.
    const inventoryRequestSequence = useRef(0);
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [serverSummary, setServerSummary] = useState<{ totalValue: number; counts: Record<TabKey, number> } | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadMoreError, setLoadMoreError] = useState(false);
    const pageRef = useRef(1);
    const loadMoreLock = useRef(false);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 250);
        return () => clearTimeout(timer);
    }, [search]);

    // Modal states (preserved)
    const [showBatchModal, setShowBatchModal]   = useState<any | null>(null);
    const [showBranchModal, setShowBranchModal] = useState<any | null>(null);
    const [showCreateModal, setShowCreateModal] = useState<string | null>(null);
    const [modalLoading, setModalLoading]       = useState(false);
    // Packet → strip cost calculator (cost per strip = packet price ÷ strips)
    const [packetPrice, setPacketPrice]         = useState('');
    /**
     * ميزة وحدة التسعير: يبدأ فارغاً لا بـ '1'. القيمة 1 مشروعة وشائعة،
     * لكن وضعها افتراضياً يجعل «العلبة فيها شريط واحد» و«لم ينتبه الصيدلاني
     * للخانة» رقماً واحداً، فيُحفظ سعر الباكيت كاملاً في حقل سعر الشريط.
     */
    const [stripsPerPacket, setStripsPerPacket] = useState('');
    const [formData, setFormData] = useState({
        tradeName: '', scientificName: '', price: '', costPrice: '',
        minStock: '5', maxStock: '100', quantity: '', expiryDate: '', batchNumber: '',
    });
    const [isQuickSale, setIsQuickSale]           = useState(false);
    const [quickSaleState, setQuickSaleState]     = useState<Record<string, boolean>>({});
    const [togglingQuickSale, setTogglingQuickSale] = useState<string | null>(null);
    const [showAddChooser, setShowAddChooser]     = useState(false);
    const [manualBarcode, setManualBarcode]       = useState('');

    // Supplier picker state (shared across all modals)
    const [suppliers, setSuppliers]               = useState<Array<{ id: string; name: string }>>([]);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
    const [showSupplierPicker, setShowSupplierPicker] = useState(false);
    const [supplierSearch, setSupplierSearch]     = useState('');
    const [supplierPickerContext, setSupplierPickerContext] = useState<'batch' | 'branch' | 'create'>('create');

    const params = useLocalSearchParams();

    // Drag-to-dismiss for the sort bottom sheet.
    const sortSheetY = useRef(new Animated.Value(0)).current;
    const closeSortSheet = () => {
        // Slide fully off-screen, THEN unmount. Don't reset the value to 0 here —
        // doing so would render one visible frame at the resting position (a flash).
        // The next open resets the value before showing the sheet.
        Animated.timing(sortSheetY, { toValue: 600, duration: 200, useNativeDriver: false }).start(({ finished }) => {
            if (finished) setShowSortMenu(false);
        });
    };
    const sortPan = useRef(
        PanResponder.create({
            // Don't claim on touch-start (so option buttons stay tappable);
            // claim only when the user drags vertically downward.
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, g) => g.dy > 5 && g.dy > Math.abs(g.dx),
            onPanResponderMove: (_, g) => { if (g.dy > 0) sortSheetY.setValue(g.dy); },
            onPanResponderRelease: (_, g) => {
                if (g.dy > 70 || g.vy > 0.5) {
                    closeSortSheet();
                } else {
                    Animated.spring(sortSheetY, { toValue: 0, useNativeDriver: false, bounciness: 4 }).start();
                }
            },
            onPanResponderTerminationRequest: () => false,
        }),
    ).current;

    useEffect(() => {
        if (!isAdmin && authBranchId) setSelectedBranch(authBranchId);
    }, [isAdmin, authBranchId]);

    const fetchInventory = useCallback(async (forceRefresh = false, page = 1) => {
        const effectiveBranchId = (!isAdmin ? authBranchId : selectedBranch) || undefined;
        const append = page > 1;
        if (append && loadMoreLock.current) return;
        const requestSequence = append ? inventoryRequestSequence.current : ++inventoryRequestSequence.current;
        if (append) {
            loadMoreLock.current = true;
            setLoadingMore(true);
        } else {
            loadMoreLock.current = false;
            setLoadingMore(false);
            setLoading(true);
            setHasMore(false);
        }
        setLoadMoreError(false);
        try {
            const online = await syncService.isOnline();
            if (requestSequence !== inventoryRequestSequence.current) return;
            setIsOnline(online);
            if (online) {
                const result = await apiService.getInventoryPage({
                    branchId: effectiveBranchId || undefined, page, search: debouncedSearch,
                    status: activeTab, sort: sortKey, direction: sortAsc ? 'asc' : 'desc',
                }, forceRefresh);
                if (requestSequence !== inventoryRequestSequence.current) return;
                const data = result.items;
                setItems(previous => append
                    ? Array.from(new Map([...previous, ...data].map(item => [item.id, item])).values())
                    : data);
                setServerSummary({ totalValue: result.totalValue, counts: result.counts });
                setHasMore(result.hasMore);
                pageRef.current = page;
                if (Array.isArray(data)) {
                    const quickSale = Object.fromEntries(
                        data.filter((i: any) => i.drugId).map((i: any) => [i.drugId, i.isQuickSale ?? false])
                    );
                    setQuickSaleState(previous => append ? { ...previous, ...quickSale } : quickSale);
                }
            } else {
                if (append) { setLoadMoreError(true); return; }
                setServerSummary(null);
                const products = await dbService.searchProducts('', effectiveBranchId);
                if (requestSequence !== inventoryRequestSequence.current) return;
                setItems(products.map((p: any) => ({
                    id: p.id, drugName: p.drugName, price: p.price,
                    quantity: p.quantity, reorderLevel: p.reorderLevel,
                })));
            }
        } catch {
            if (requestSequence !== inventoryRequestSequence.current) return;
            if (append) { setLoadMoreError(true); return; }
            setServerSummary(null);
            setIsOnline(false);
            try {
                const products = await dbService.searchProducts('', effectiveBranchId);
                if (requestSequence !== inventoryRequestSequence.current) return;
                setItems(products.map((p: any) => ({
                    id: p.id, drugName: p.drugName, price: p.price,
                    quantity: p.quantity, reorderLevel: p.reorderLevel,
                })));
            } catch { /* silent fallback */ }
        } finally {
            if (requestSequence === inventoryRequestSequence.current) {
                setLoading(false);
                setRefreshing(false);
                setLoadingMore(false);
                loadMoreLock.current = false;
            }
        }
    }, [selectedBranch, isAdmin, authBranchId, debouncedSearch, activeTab, sortKey, sortAsc]);

    useEffect(() => {
        void fetchInventory();
        return () => { inventoryRequestSequence.current++; };
    }, [fetchInventory]);

    // "إدخال يدوي" in the scanner hands the search field back to this screen;
    // focus only sticks once the screen transition has finished.
    useFocusEffect(useCallback(() => {
        let task: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
        let active = true;
        consumeManualEntry('inventory').then(wanted => {
            if (wanted && active) task = InteractionManager.runAfterInteractions(() => searchRef.current?.focus());
        });
        return () => { active = false; task?.cancel(); };
    }, []));

    const handleQuickSaleToggle = async (drugId: string, itemBranchId?: string) => {
        if (togglingQuickSale === drugId) return;
        setTogglingQuickSale(drugId);
        const newValue = !quickSaleState[drugId];
        setQuickSaleState(prev => ({ ...prev, [drugId]: newValue }));
        try {
            const res = await apiService.toggleQuickSale(drugId, newValue, itemBranchId);
            if (!res?.success) setQuickSaleState(prev => ({ ...prev, [drugId]: !newValue }));
        } catch {
            setQuickSaleState(prev => ({ ...prev, [drugId]: !newValue }));
        } finally {
            setTogglingQuickSale(null);
        }
    };

    useEffect(() => {
        if (showBatchModal || showBranchModal || showCreateModal) {
            apiService.getSuppliers().then(setSuppliers).catch(() => {});
        }
    }, [!!showBatchModal, !!showBranchModal, !!showCreateModal]);

    useEffect(() => {
        if (!showBatchModal && !showBranchModal && !showCreateModal) {
            setSelectedSupplierId(null);
            setSupplierSearch('');
            setPacketPrice(''); setStripsPerPacket('');
        }
    }, [showBatchModal, showBranchModal, showCreateModal]);

    const handleScannedProduct = async (code: string) => {
        if (!isOnline) { Alert.alert('تنبيه', 'يجب أن تكون متصلاً بالإنترنت لإضافة عناصر جديدة.'); return; }
        setLoading(true);
        try {
            const res = await apiService.checkBarcodeExact(code, selectedBranch || undefined);
            if (res.success && res.exists) {
                if (res.inventory) setShowBatchModal(res.inventory);
                else if (res.drug) setShowBranchModal(res.drug);
            } else {
                setShowCreateModal(code);
            }
        } catch { Alert.alert('خطأ', 'فشل التحقق من المنتج'); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        if (params.scannedBarcode) {
            handleScannedProduct(params.scannedBarcode as string);
            router.setParams({ scannedBarcode: '' });
        }
    }, [params.scannedBarcode]);

    useEffect(() => {
        if (isTabKey(params.tab)) setActiveTab(params.tab);
    }, [params.tab]);

    useEffect(() => {
        const initialSearch = typeof params.search === 'string' ? params.search : '';
        if (initialSearch && initialSearch !== search) setSearch(initialSearch);
    }, [params.search]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        triggerSync('inventory');
        // Refresh the visible inventory immediately. The broader offline sync
        // may take longer and should not make this user-initiated refresh wait.
        void syncService.syncData().catch(() => {});
        await fetchInventory(true);
    }, [fetchInventory, triggerSync]);

    // Runs soft-warning confirms one after another; any "إلغاء" aborts the save.
    const runConfirmChain = (checks: Array<{ title: string; message: string }>, done: () => void) => {
        if (checks.length === 0) { done(); return; }
        const [first, ...rest] = checks;
        Alert.alert(first.title, first.message, [
            { text: 'إلغاء وتصحيح', style: 'cancel' },
            { text: 'متابعة على أي حال', onPress: () => runConfirmChain(rest, done) },
        ]);
    };

    // Shared save guard: blocks a zero quantity, then chains soft confirms for
    // suspicious entries (cheap packet, strips-count typo, strip/packet price
    // confusion, wrong expiry year) before running the actual save callback.
    // `proceed` receives the year-corrected expiry date ("27" → "2027").
    const guardAndSave = (
        proceed: (fixedExpiry: string) => void,
        opts?: { sellPrice?: number | null; currentPrice?: number | null },
    ) => {
        const qty = parseInt(formData.quantity) || 0;
        if (qty <= 0) {
            Alert.alert('لا يمكن الحفظ', 'الكمية يجب أن تكون أكبر من صفر.');
            return;
        }
        // عدد الأشرطة شرط للحفظ: هو المقسوم عليه، ولا يُفترض 1 صامتاً.
        const strips = parseInt(stripsPerPacket, 10);
        if (!Number.isInteger(strips) || strips <= 0) {
            Alert.alert('لا يمكن الحفظ', 'اكتب عدد الأشرطة في الباكيت الواحد (اعدُدها من العلبة).');
            return;
        }
        const pkt = Number(packetPrice);
        if (!Number.isFinite(pkt) || pkt <= 0) {
            Alert.alert('لا يمكن الحفظ', 'أدخل تكلفة شراء صحيحة أكبر من صفر؛ لا يمكن تجاوز هذا التحقق.');
            return;
        }
        const stripCost = pkt > 0 ? pkt / strips : 0;
        const checks: Array<{ title: string; message: string }> = [];

        // سعر الباكيت أقل من 125 دينار = غالباً خطأ إدخال
        if (pkt < 125) {
            checks.push({
                title: 'تحذير: سعر الباكيت منخفض',
                message: `سعر الباكيت (${pkt.toLocaleString('en-US')} د.ع) أقل من 125 دينار — تأكد أنه سعر الباكيت الصحيح.`,
            });
        }
        // عدد الأشرطة في الباكيت يساوي الكمية الكلية أو مرتفع جداً = غالباً أُدخل الإجمالي بالخطأ
        if (pkt > 0 && (strips > 20 || (qty > 10 && strips >= qty))) {
            checks.push({
                title: 'تنبيه: عدد الأشرطة في الباكيت',
                message:
                    `عدد الأشرطة في الباكيت (${strips}) يبدو غير صحيح — هذا الحقل يعني عدد الأشرطة داخل الباكيت الواحد، وليس إجمالي الأشرطة المستلمة (الكمية المدخلة: ${qty}).\n` +
                    `سعر التكلفة للشريط سيُحسب: ${pkt} ÷ ${strips} = ${stripCost.toLocaleString('en', { maximumFractionDigits: 2 })} د.ع.`,
            });
        }
        // البيع أقل من أو يساوي الشراء = غالباً خطأ إدخال
        const sell = opts?.sellPrice ?? null;
        if (sell != null && sell > 0 && stripCost > 0 && sell <= stripCost) {
            checks.push({
                title: 'سعر البيع أقل من التكلفة',
                message: `سعر بيع الشريط (${sell.toLocaleString('en', { maximumFractionDigits: 2 })} د.ع) أقل من أو يساوي تكلفته (${stripCost.toLocaleString('en', { maximumFractionDigits: 2 })} د.ع).`,
            });
        }
        // البيع أكثر من ضعف الشراء = ربما أُدخل سعر الباكيت بدلاً من الشريط
        if (sell != null && stripCost > 0 && sell > 2 * stripCost) {
            checks.push({
                title: 'سعر البيع مرتفع جداً',
                message:
                    `سعر بيع الشريط (${sell.toLocaleString('en', { maximumFractionDigits: 2 })} د.ع) أكثر من ضعف تكلفته (${stripCost.toLocaleString('en', { maximumFractionDigits: 2 })} د.ع).\n` +
                    `تأكد أنك أدخلت سعر الشريط وليس سعر الباكيت.`,
            });
        }
        // التكلفة للشريط أعلى من سعر البيع الحالي = غالباً أُدخل سعر الباكيت بدون قسمة
        const cur = opts?.currentPrice ?? null;
        if (cur != null && cur > 0 && stripCost > 0 && stripCost >= cur) {
            const gap = stripCost - cur;
            const bigGap = gap >= COST_OVER_PRICE_GAP;
            const fmtCost = stripCost.toLocaleString('en', { maximumFractionDigits: 2 });
            const fmtPrice = cur.toLocaleString('en');
            const fmtGap = gap.toLocaleString('en', { maximumFractionDigits: 2 });
            checks.push({
                title: bigGap
                    ? `التكلفة أعلى من سعر البيع بأكثر من ${COST_OVER_PRICE_GAP} دينار`
                    : 'التكلفة أعلى من سعر البيع',
                message:
                    (bigGap
                        ? `سعر التكلفة للشريط (${fmtCost} د.ع) أعلى من سعر البيع الحالي للشريط (${fmtPrice} د.ع) بفارق ${fmtGap} د.ع.\n`
                        : `سعر التكلفة للشريط (${fmtCost} د.ع) أعلى من أو يساوي سعر البيع الحالي للشريط (${fmtPrice} د.ع).\n`) +
                    `غالباً أُدخل سعر الباكيت دون تحديد عدد الأشرطة الصحيح.`,
            });
        }
        // تصحيح سنة الصلاحية (27 → 2027) والتحذير من التواريخ المنتهية/البعيدة
        const expiryFix = checkExpiry(formData.expiryDate);
        if (expiryFix.value && expiryFix.value !== formData.expiryDate) {
            setFormData(f => ({ ...f, expiryDate: expiryFix.value }));
        }
        if (expiryFix.warning) {
            checks.push({ title: 'تحقق من تاريخ الانتهاء', message: expiryFix.warning });
        }

        runConfirmChain(checks, () => proceed(expiryFix.value || formData.expiryDate));
    };

    // Modal handlers (preserved)
    const handleAddBatch = () => {
        if (!formData.quantity || !formData.expiryDate) {
            Alert.alert('تنبيه', 'يرجى ملء كافة الحقول الأساسية'); return;
        }
        guardAndSave(async (fixedExpiry) => {
            setModalLoading(true);
            try {
                const result = await apiService.addBatch({
                    inventoryId: showBatchModal.id,
                    quantity: parseInt(formData.quantity) || 0,
                    costPrice: computedStripCost,
                    expiryDate: fixedExpiry + 'T00:00:00.000Z',
                    supplierId: selectedSupplierId || null,
                    // يُحفظ على الدواء فلا يُسأل عنه مجدداً — مشترك بين كل الصيدليات.
                    unitsPerPack: _strips,
                });
                if (!result?.success) {
                    Alert.alert('خطأ', result?.message || 'فشل إضافة الجرعة');
                    return;
                }
                setShowBatchModal(null);
                setFormData(f => ({ ...f, quantity: '', expiryDate: '', costPrice: '' }));
                setPacketPrice(''); setStripsPerPacket('');
                await fetchInventory(true);
            } catch { Alert.alert('خطأ', 'فشل إضافة الجرعة'); }
            finally { setModalLoading(false); }
        }, { currentPrice: Number(showBatchModal?.price) || null });
    };

    const handleAddToBranch = () => {
        if (!formData.price || !formData.quantity || !formData.expiryDate) {
            Alert.alert('تنبيه', 'يرجى ملء كافة الحقول الأساسية'); return;
        }
        guardAndSave(async (fixedExpiry) => {
            setModalLoading(true);
            try {
                const result = await apiService.addToBranch({
                    drugId: showBranchModal.id, branchId: selectedBranch!,
                    price: parseFloat(formData.price) || 0,
                    cost: computedStripCost,
                    minStock: parseInt(formData.minStock) || 5,
                    maxStock: parseInt(formData.maxStock) || 100,
                    quantity: parseInt(formData.quantity) || 0,
                    expiryDate: fixedExpiry + 'T00:00:00.000Z',
                    supplierId: selectedSupplierId || null,
                    unitsPerPack: _strips,
                });
                if (!result?.success) {
                    Alert.alert('خطأ', result?.message || 'فشل إضافة الدواء للفرع');
                    return;
                }
                setShowBranchModal(null);
                setFormData({ tradeName: '', scientificName: '', price: '', costPrice: '', minStock: '5', maxStock: '100', quantity: '', expiryDate: '', batchNumber: '' });
                setPacketPrice(''); setStripsPerPacket('');
                await fetchInventory(true);
            } catch { Alert.alert('خطأ', 'فشل إضافة الدواء للفرع'); }
            finally { setModalLoading(false); }
        }, { sellPrice: parseFloat(formData.price) || 0 });
    };

    const handleCreateDrug = () => {
        if (!formData.tradeName || !formData.price || !formData.quantity || !formData.expiryDate) {
            Alert.alert('تنبيه', 'يرجى ملء الحقول الأساسية'); return;
        }
        guardAndSave(async (fixedExpiry) => {
            setModalLoading(true);
            try {
                const result = await apiService.createQuickDrug({
                    barcode: showCreateModal!, tradeName: formData.tradeName,
                    scientificName: formData.scientificName, drugType: 'Tablet', dosage: 'Custom',
                    unit: 'Box', category: 'General', manufacturer: 'Unknown', country: 'Unknown',
                    branchId: selectedBranch!, price: parseFloat(formData.price) || 0,
                    costPrice: computedStripCost,
                    minStock: parseInt(formData.minStock) || 5, maxStock: parseInt(formData.maxStock) || 100,
                    batchNumber: formData.batchNumber || '',
                    quantity: parseInt(formData.quantity) || 0,
                    expiryDate: fixedExpiry + 'T00:00:00.000Z',
                    supplierId: selectedSupplierId || null,
                    isQuickSale,
                    unitsPerPack: _strips,
                });
                if (!result?.success) {
                    Alert.alert('خطأ', result?.message || 'فشل تسجيل الدواء الجديد');
                    return;
                }
                setShowCreateModal(null);
                setIsQuickSale(false);
                setFormData({ tradeName: '', scientificName: '', price: '', costPrice: '', minStock: '5', maxStock: '100', quantity: '', expiryDate: '', batchNumber: '' });
                setPacketPrice(''); setStripsPerPacket('');
                await fetchInventory(true);
            } catch { Alert.alert('خطأ', 'فشل تسجيل الدواء الجديد'); }
            finally { setModalLoading(false); }
        }, { sellPrice: parseFloat(formData.price) || 0 });
    };

    // Total inventory value at sale price (Σ quantity × price).
    const totalValue = useMemo(() => serverSummary?.totalValue ?? items.reduce((s, i) => s + i.quantity * i.price, 0), [items, serverSummary]);

    // ── Counts for tab badges ──────────────────────────────────────────────────
    const counts = useMemo(() => serverSummary?.counts ?? ({
        all:            items.length,
        'low-stock':    items.filter(i => i.quantity > 0 && i.quantity <= i.reorderLevel).length,
        out:            items.filter(i => i.quantity <= 0).length,
        'near-expiry':  items.filter(i => { const d = getDaysToExpiry(i.expiryDate); return d !== null && d >= 0 && d < 120; }).length,
        expired:        items.filter(i => { const d = getDaysToExpiry(i.expiryDate); return d !== null && d < 0; }).length,
    }), [items, serverSummary]);

    // ── Collator instance — created once, 10-100× faster than localeCompare('ar') ──
    const collator = useMemo(() => new Intl.Collator('ar', { sensitivity: 'base' }), []);

    // ── Expiry cache — avoids recomputing Date math in every sort comparison ──
    const expiryCache = useMemo(() =>
        new Map(items.map(i => [i.id, getDaysToExpiry(i.expiryDate) ?? 9999])),
    [items]);

    // ── Fast filter (no sort) — runs synchronously, cheap ─────────────────────
    const filtered = useMemo(() => {
        if (serverSummary) return items;
        const q = search.toLowerCase();
        return items.filter(i => {
            if (q && !i.drugName.toLowerCase().includes(q) && !(i.barcode?.includes(search) ?? false)) return false;
            if (activeTab === 'low-stock')   return i.quantity > 0 && i.quantity <= i.reorderLevel;
            if (activeTab === 'out')         return i.quantity <= 0;
            if (activeTab === 'near-expiry') { const d = expiryCache.get(i.id)!; return d !== 9999 && d >= 0 && d < 120; }
            if (activeTab === 'expired')     { const d = expiryCache.get(i.id)!; return d !== 9999 && d < 0; }
            return true;
        });
    }, [items, search, activeTab, expiryCache, serverSummary]);

    // ── Async sort — shows loading state immediately, then sorts off the render cycle
    useEffect(() => {
        if (serverSummary) { setSorted(items); setIsSorting(false); return; }
        setIsSorting(true);
        const task = InteractionManager.runAfterInteractions(() => {
            const result = [...filtered].sort((a, b) => {
                let diff = 0;
                if (sortKey === 'name')          diff = collator.compare(a.drugName, b.drugName);
                else if (sortKey === 'quantity') diff = a.quantity - b.quantity;
                else                             diff = (expiryCache.get(a.id) ?? 9999) - (expiryCache.get(b.id) ?? 9999);
                return sortAsc ? diff : -diff;
            });
            setSorted(result);
            setIsSorting(false);
        });
        return () => task.cancel();
    }, [filtered, sortKey, sortAsc, collator, expiryCache, serverSummary, items]);

    // ── Item card (shared by both shells — navigation-map §7) ──────────────────
    const renderItem = ({ item }: { item: InventoryItem }) => {
        const days        = getDaysToExpiry(item.expiryDate);
        const isOut       = item.quantity === 0;
        const isLow       = !isOut && item.quantity <= item.reorderLevel;
        // Status colours: red = out, orange = low, green = healthy.
        const stockColor  = isOut ? C.danger : isLow ? C.warning : C.success;
        const stockTone: 'danger' | 'warning' | 'success' = isOut ? 'danger' : isLow ? 'warning' : 'success';
        const stockLabel  = isOut ? 'نفاد' : isLow ? 'منخفض' : 'جيد';

        const maxVisual   = Math.max(item.reorderLevel * 3, item.quantity, 1);
        const progress    = Math.min(item.quantity / maxVisual, 1);

        const isToggling  = togglingQuickSale === item.drugId;
        const isQuick     = item.drugId ? (quickSaleState[item.drugId] ?? false) : false;

        return (
            <View style={{ backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, marginBottom: 12, padding: 16, gap: 12 }}>
                {/* Name / scientific name / barcode + status */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 16.5, textAlign: 'right' }} numberOfLines={2}>
                            {item.drugName}
                        </Text>
                        {item.scientificName ? (
                            <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>{item.scientificName}</Text>
                        ) : null}
                        {item.barcode ? (
                            <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right', marginTop: 2, writingDirection: 'ltr' }}>{item.barcode}</Text>
                        ) : null}
                    </View>
                    <StatusBadge label={stockLabel} tone={stockTone} />
                </View>

                {/* Stock bar + quantity vs reorder level */}
                <View style={{ gap: 6 }}>
                    <View style={{ height: 6, backgroundColor: C.input, borderRadius: 3, overflow: 'hidden', flexDirection: 'row-reverse' }}>
                        <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: stockColor, borderRadius: 3 }} />
                    </View>
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                        <Text style={{ color: stockColor, fontSize: 14, fontWeight: '800' }}>{formatNumber(item.quantity)} وحدة</Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 13 }}>حد الطلب: {formatNumber(item.reorderLevel)}</Text>
                    </View>
                </View>

                {/* Price + expiry + quick-sale action (matches the inventory design) */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 }}>
                    <View style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: C.primary, fontWeight: '900', fontSize: 19 }}>
                            {formatNumber(item.price)} <Text style={{ fontSize: 12, fontWeight: '600', color: C.mutedForeground }}>{CURRENCY}</Text>
                        </Text>
                        {days !== null && days <= 30 && (
                            <StatusBadge
                                label={days < 0 ? 'منتهي' : `${days} يوم`}
                                tone={days <= 7 ? 'danger' : 'warning'}
                                icon="time-outline"
                            />
                        )}
                    </View>

                    {item.drugId && (
                        <>
                            <View style={{ width: 1, height: 30, backgroundColor: C.border, marginHorizontal: 12 }} />
                            <TouchableOpacity
                                onPress={() => handleQuickSaleToggle(item.drugId!, item.branchId)}
                                disabled={isToggling}
                                activeOpacity={0.75}
                                accessibilityRole="switch"
                                accessibilityState={{ checked: isQuick, busy: isToggling }}
                                accessibilityLabel="البيع السريع"
                                style={{
                                    // On = solid blue, off = plain outline: the two states must not look alike.
                                    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    minWidth: 124, opacity: isToggling ? 0.6 : 1,
                                    borderWidth: 1, borderColor: isQuick ? C.primary : C.border,
                                    borderRadius: Radius.control,
                                    paddingHorizontal: 11, paddingVertical: 8,
                                    backgroundColor: isQuick ? C.primary : C.card,
                                }}
                            >
                                {isToggling ? (
                                    <ActivityIndicator size="small" color={isQuick ? '#FFFFFF' : C.mutedForeground} />
                                ) : (
                                    <>
                                        <Text style={{ color: isQuick ? '#FFFFFF' : C.mutedForeground, fontSize: 13, fontWeight: isQuick ? '800' : '600' }}>
                                            {isQuick ? 'في البيع السريع' : 'بيع سريع'}
                                        </Text>
                                        <Ionicons
                                            name={isQuick ? 'checkmark-circle' : 'cart-outline'}
                                            size={17}
                                            color={isQuick ? '#FFFFFF' : C.mutedForeground}
                                        />
                                    </>
                                )}
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>
        );
    };

    const inputStyle = {
        backgroundColor: C.input, borderRadius: Radius.control, borderWidth: 1, borderColor: C.border,
        paddingHorizontal: 16, height: 50, marginBottom: 12, fontSize: 16,
        textAlign: 'right' as const, color: C.foreground,
    };

    const sectionLabelStyle = {
        color: C.mutedForeground, fontSize: 11, fontWeight: '700' as const,
        textAlign: 'right' as const, letterSpacing: 0.4, marginBottom: 8, marginTop: 6,
    };

    // Cost-per-strip derived from the packet calculator.
    const _pkt = parseFloat(packetPrice) || 0;
    const _strips = parseInt(stripsPerPacket, 10) > 0 ? parseInt(stripsPerPacket, 10) : 0;
    const computedStripCost = _pkt > 0 && _strips > 0 ? _pkt / _strips : 0;
    // سعر البيع الحالي للشريط — متاح فقط في نموذج «إضافة دفعة»؛ النماذج الأخرى
    // فيها حقل سعر بيع خاص بها فتغطّيها فحوصات البيع/التكلفة.
    const _batchSellPrice = showBatchModal ? Number(showBatchModal.price) || 0 : 0;
    const _costOverPrice =
        _batchSellPrice > 0 && computedStripCost >= _batchSellPrice
            ? computedStripCost - _batchSellPrice
            : null;

    // Inline hint under the quantity field: turns red and blocks the save when 0.
    const renderQtyHint = () => {
        const q = parseInt(formData.quantity) || 0;
        const bad = formData.quantity.trim().length > 0 && q <= 0;
        return (
            <Text style={{
                fontSize: 11, fontWeight: '600', textAlign: 'right', marginTop: -2, marginBottom: 8,
                color: bad ? C.danger : C.mutedForeground,
            }}>
                {bad ? '⚠ لا يُقبل الحفظ والكمية صفر' : '* الكمية مطلوبة ويجب أن تكون أكبر من صفر'}
            </Text>
        );
    };

    // Packet → strip cost calculator (mirrors the web inventory form).
    const renderCostCalculator = () => (
        <View>
            <Text style={sectionLabelStyle}>سعر التكلفة (من الباكيت)</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                <TextInput
                    style={[inputStyle, { flex: 1, marginBottom: 8 }]}
                    placeholder="سعر الباكيت" keyboardType="numeric" placeholderTextColor={C.mutedForeground}
                    value={packetPrice} onChangeText={setPacketPrice}
                />
                <TextInput
                    style={[inputStyle, { flex: 1, marginBottom: 8 }]}
                    placeholder="اعدُدها من العلبة" keyboardType="numeric" placeholderTextColor={C.mutedForeground}
                    value={stripsPerPacket} onChangeText={setStripsPerPacket}
                />
            </View>
            <View style={{
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: C.primaryMuted, borderRadius: Radius.control, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12,
            }}>
                <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '600' }}>سعر التكلفة للشريط</Text>
                <Text style={{ color: C.primary, fontSize: 14, fontWeight: '800' }}>
                    {_pkt > 0 ? `${_pkt} ÷ ${_strips} = ${computedStripCost.toLocaleString('en', { maximumFractionDigits: 2 })}` : '—'}
                </Text>
            </View>
            {_pkt > 0 && _pkt < 125 ? (
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
                    backgroundColor: C.warningBg, borderRadius: Radius.control, paddingHorizontal: 12, paddingVertical: 9, marginTop: -4, marginBottom: 12,
                }}>
                    <Ionicons name="warning-outline" size={14} color={C.warning} />
                    <Text style={{ color: C.warning, fontSize: 11, fontWeight: '700', flex: 1, textAlign: 'right' }}>
                        سعر الباكيت أقل من 125 دينار — سيظهر تأكيد عند الحفظ
                    </Text>
                </View>
            ) : null}
            {_strips > 20 ? (
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
                    backgroundColor: C.warningBg, borderRadius: Radius.control, paddingHorizontal: 12, paddingVertical: 9, marginTop: -4, marginBottom: 12,
                }}>
                    <Ionicons name="warning-outline" size={14} color={C.warning} />
                    <Text style={{ color: C.warning, fontSize: 11, fontWeight: '700', flex: 1, textAlign: 'right' }}>
                        هذا الحقل هو عدد الأشرطة داخل الباكيت الواحد وليس إجمالي الأشرطة — سيظهر تأكيد عند الحفظ
                    </Text>
                </View>
            ) : null}
            {_costOverPrice != null ? (
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
                    backgroundColor: C.dangerBg, borderRadius: Radius.control, paddingHorizontal: 12, paddingVertical: 9, marginTop: -4, marginBottom: 12,
                }}>
                    <Ionicons name="warning-outline" size={14} color={C.danger} />
                    <Text style={{ color: C.danger, fontSize: 11, fontWeight: '700', flex: 1, textAlign: 'right' }}>
                        {_costOverPrice >= COST_OVER_PRICE_GAP
                            ? `التكلفة أعلى من سعر البيع (${_batchSellPrice.toLocaleString('en')} د.ع) بفارق ${_costOverPrice.toLocaleString('en', { maximumFractionDigits: 2 })} د.ع — سيظهر تأكيد عند الحفظ`
                            : `التكلفة أعلى من أو تساوي سعر البيع (${_batchSellPrice.toLocaleString('en')} د.ع) — سيظهر تأكيد عند الحفظ`}
                    </Text>
                </View>
            ) : null}
        </View>
    );

    // Branded modal action row: prominent primary save + outline cancel (radius 5).
    const renderModalActions = (
        saveLabel: string,
        saveIcon: keyof typeof Ionicons.glyphMap,
        onSave: () => void,
        onCancel: () => void,
    ) => (
        <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 8, paddingBottom: 24 }}>
            <TouchableOpacity
                onPress={onSave}
                disabled={modalLoading}
                activeOpacity={0.85}
                style={{
                    flex: 2, height: 50, borderRadius: Radius.control, backgroundColor: C.primary,
                    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: modalLoading ? 0.6 : 1,
                }}
            >
                {modalLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                ) : (
                    <>
                        <Ionicons name={saveIcon} size={18} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>{saveLabel}</Text>
                    </>
                )}
            </TouchableOpacity>
            <TouchableOpacity
                onPress={onCancel}
                disabled={modalLoading}
                activeOpacity={0.7}
                style={{
                    flex: 1, height: 50, borderRadius: Radius.control,
                    borderWidth: 1.5, borderColor: C.border,
                    alignItems: 'center', justifyContent: 'center',
                }}
            >
                <Text style={{ color: C.mutedForeground, fontSize: 15, fontWeight: '700' }}>إلغاء</Text>
            </TouchableOpacity>
        </View>
    );

    // Offline banner scrolls with the list.
    const listHeaderEl = !isOnline ? (
        <View style={{
            flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
            backgroundColor: C.warningBg, borderRadius: Radius.card,
            paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
        }}>
            <Ionicons name="cloud-offline-outline" size={18} color={C.warning} />
            <Text style={{ color: C.foreground, fontSize: 13, flex: 1, textAlign: 'right' }}>وضع عدم الاتصال — تُعرض آخر نسخة محفوظة، والإضافة غير متاحة.</Text>
        </View>
    ) : null;

    const openManualAdd = () => {
        if (!isOnline) { Alert.alert('تنبيه', 'يجب أن تكون متصلاً بالإنترنت لإضافة عناصر جديدة.'); return; }
        if (isAdmin && !selectedBranch) { Alert.alert('اختر الفرع', 'حدد الفرع الذي ستُضاف إليه الكمية قبل إضافة صنف أو دفعة.'); return; }
        setManualBarcode('');
        setShowAddChooser(true);
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <ScreenHeader
                title="المخزون"
                hideBack
                action={<HeaderIconButton icon="refresh" onPress={onRefresh} accessibilityLabel="تحديث المخزون" />}
            />

            {/* ── Pinned controls ────────────────────────────────────────────── */}
            <View style={{ backgroundColor: C.background, paddingHorizontal: 16, paddingBottom: 6, gap: 10 }}>

                {/* Value / count summary */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, paddingVertical: 12, paddingHorizontal: 16 }}>
                    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 13 }}>قيمة المخزون</Text>
                        <Text style={{ color: C.foreground, fontSize: 19, fontWeight: '900' }}>
                            {formatNumber(Math.round(totalValue))} <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '600' }}>{CURRENCY}</Text>
                        </Text>
                    </View>
                    <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border }} />
                    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 13 }}>الأصناف</Text>
                        <Text style={{ color: C.foreground, fontSize: 19, fontWeight: '900' }}>{formatNumber(counts.all)}</Text>
                    </View>
                </View>

                {/* Search + scan */}
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
                    backgroundColor: C.card, borderRadius: Radius.control, borderWidth: 1, borderColor: C.border,
                    paddingRight: 12, paddingLeft: 6,
                }}>
                    <Ionicons name="search-outline" size={20} color={C.mutedForeground} />
                    <TextInput
                        ref={searchRef}
                        style={{ flex: 1, color: C.foreground, paddingVertical: 12, textAlign: 'right', fontSize: 15 }}
                        placeholder="ابحث عن دواء أو باركود"
                        placeholderTextColor={C.mutedForeground}
                        value={search}
                        onChangeText={setSearch}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="مسح البحث">
                            <Ionicons name="close-circle" size={18} color={C.mutedForeground} />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        onPress={() => router.push({ pathname: '/scan', params: { from: 'inventory' } })}
                        accessibilityLabel="مسح باركود"
                        style={{ backgroundColor: C.primaryMuted, borderRadius: Radius.control, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Ionicons name="scan-outline" size={21} color={C.primary} />
                    </TouchableOpacity>
                </View>

                {/* Branch + sort + status tabs */}
                <View style={{ backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 10 }}>
                        {isAdmin ? (
                            <BranchSelector selectedBranchId={selectedBranch} onSelectBranch={setSelectedBranch} inline />
                        ) : (
                            <Text style={{ flex: 1, color: C.mutedForeground, fontSize: 13.5, textAlign: 'right' }}>فرعك الحالي</Text>
                        )}
                        <TouchableOpacity
                            onPress={() => {
                                setShowSortMenu(true);
                                sortSheetY.setValue(400);
                                Animated.spring(sortSheetY, { toValue: 0, useNativeDriver: false, bounciness: 2 }).start();
                            }}
                            activeOpacity={0.8}
                            accessibilityLabel="ترتيب"
                            style={{ width: 44, height: 44, borderRadius: Radius.control, backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center' }}
                        >
                            <Ionicons name="swap-vertical" size={20} color={C.primary} />
                        </TouchableOpacity>
                    </View>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}
                        style={{ borderTopWidth: 1, borderTopColor: C.border }}
                    >
                        {TABS.map(t => {
                            const active = t.key === activeTab;
                            const count = counts[t.key];
                            return (
                                <TouchableOpacity
                                    key={t.key}
                                    onPress={() => setActiveTab(t.key)}
                                    activeOpacity={0.8}
                                    accessibilityRole="tab"
                                    accessibilityState={{ selected: active }}
                                    accessibilityLabel={`${t.label}: ${count}`}
                                    style={{
                                        flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
                                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.control,
                                        backgroundColor: active ? C.primary : C.card,
                                        borderWidth: 1, borderColor: active ? C.primary : C.border,
                                    }}
                                >
                                    <Text style={{ color: active ? '#FFFFFF' : C.foreground, fontSize: 13.5, fontWeight: active ? '800' : '600' }}>
                                        {t.label}
                                    </Text>
                                    {!loading && count > 0 && (
                                        <View style={{
                                            minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10,
                                            backgroundColor: active ? 'rgba(255,255,255,0.22)' : C.input,
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <Text style={{ color: active ? '#FFFFFF' : C.mutedForeground, fontSize: 11, fontWeight: '800' }}>
                                                {formatNumber(count)}
                                            </Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>

            {/* ── Drug list ───────────────────────────────────────────────────── */}
            {loading && !refreshing ? (
                <View style={{ padding: 16, gap: 10 }}>
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} height={150} radius={Radius.card} />)}
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    <FlatList
                        data={sorted}
                        onEndReached={() => {
                            if (hasMore && !loading && !loadMoreError) void fetchInventory(false, pageRef.current + 1);
                        }}
                        onEndReachedThreshold={0.4}
                        ListFooterComponent={loadingMore ? <ActivityIndicator color={C.primary} /> : loadMoreError ? (
                            <TouchableOpacity onPress={() => void fetchInventory(false, pageRef.current + 1)} style={{ padding: 16 }}>
                                <Text style={{ color: C.primary, textAlign: 'center' }}>تعذر تحميل المزيد — اضغط لإعادة المحاولة</Text>
                            </TouchableOpacity>
                        ) : null}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        ListHeaderComponent={listHeaderEl}
                        // With no rows there is nothing to scroll past the floating
                        // button, and the 96pt reserve would push the empty state
                        // off the bottom of a short list area.
                        contentContainerStyle={{ flexGrow: sorted.length === 0 ? 1 : 0, padding: 16, paddingTop: 10, paddingBottom: sorted.length === 0 ? 16 : 96 }}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                        removeClippedSubviews
                        maxToRenderPerBatch={12}
                        windowSize={8}
                        initialNumToRender={12}
                        ListEmptyComponent={
                            !isSorting ? (
                                <EmptyState
                                    icon="cube-outline"
                                    title="لا توجد عناصر"
                                    // Centres in whatever room the list has; its
                                    // 300pt floor would overflow and clip here.
                                    style={{ minHeight: 0, paddingVertical: 16 }}
                                    subtitle={
                                        search ? 'لا توجد نتائج للبحث' :
                                        activeTab === 'low-stock'   ? 'المخزون بمستويات جيدة' :
                                        activeTab === 'near-expiry' ? 'لا توجد أدوية تقترب من انتهاء الصلاحية' :
                                        activeTab === 'expired'     ? 'لا توجد أصناف منتهية الصلاحية في المخزون' :
                                        activeTab === 'out'         ? 'لا توجد أصناف نفد مخزونها' :
                                        'لا توجد أصناف في هذا الفرع'
                                    }
                                />
                            ) : null
                        }
                    />
                    {isSorting && (
                        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: `${C.background}AA`, justifyContent: 'center', alignItems: 'center' }}>
                            <View style={{ backgroundColor: C.card, borderRadius: Radius.card, paddingHorizontal: 28, paddingVertical: 18, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.border }}>
                                <ActivityIndicator size="large" color={C.primary} />
                                <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '700' }}>جاري الترتيب...</Text>
                            </View>
                        </View>
                    )}

                    {/* Add item / batch — opens the existing add flow via barcode */}
                    <TouchableOpacity
                        onPress={openManualAdd}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel="إضافة صنف أو دفعة"
                        style={{
                            position: 'absolute', left: 16, bottom: 16,
                            flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
                            backgroundColor: C.primary, borderRadius: Radius.control, paddingHorizontal: 16, paddingVertical: 13,
                        }}
                    >
                        <Ionicons name="add" size={20} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 14.5, fontWeight: '800' }}>إضافة صنف أو دفعة</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Add chooser: scan or type the barcode, then the existing batch/branch/create flow */}
            <Modal visible={showAddChooser} transparent animationType="fade" onRequestClose={() => setShowAddChooser(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
                    <View style={{ backgroundColor: C.card, borderRadius: Radius.card, padding: 20, gap: 14 }}>
                        <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '800', textAlign: 'right' }}>إضافة صنف أو دفعة</Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 13.5, textAlign: 'right', lineHeight: 20 }}>
                            امسح باركود العلبة أو أدخله. إن كان الصنف موجوداً تُضاف دفعة جديدة، وإلا يُفتح نموذج تسجيل الصنف.
                        </Text>
                        <FormField
                            label="الباركود"
                            value={manualBarcode}
                            onChangeText={setManualBarcode}
                            keyboardType="number-pad"
                            placeholder="أدخل الباركود"
                            style={{ writingDirection: 'ltr' }}
                        />
                        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                            <AppButton
                                label="متابعة"
                                style={{ flex: 1 }}
                                disabled={!manualBarcode.trim()}
                                onPress={() => { setShowAddChooser(false); handleScannedProduct(manualBarcode.trim()); }}
                            />
                            <AppButton
                                label="مسح بالكاميرا"
                                icon="scan-outline"
                                variant="outline"
                                style={{ flex: 1 }}
                                onPress={() => { setShowAddChooser(false); router.push({ pathname: '/scan', params: { from: 'inventory' } }); }}
                            />
                        </View>
                        <TouchableOpacity onPress={() => setShowAddChooser(false)} style={{ alignSelf: 'center', padding: 6 }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 14, fontWeight: '700' }}>إلغاء</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ══════════════════════════════════════════════════════════════════
                MODALS — untouched logic, preserved exactly
            ══════════════════════════════════════════════════════════════════ */}

            {/* Add Batch Modal */}
            <Modal visible={!!showBatchModal} transparent animationType="slide" onRequestClose={() => setShowBatchModal(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <ScrollView style={{ backgroundColor: C.card, borderTopLeftRadius: Radius.card, borderTopRightRadius: Radius.card, maxHeight: '90%' }} contentContainerStyle={{ padding: 20 }}>
                        <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 5, alignSelf: 'center', marginBottom: 16 }} />
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                            <View style={{ width: 44, height: 44, borderRadius: Radius.control, backgroundColor: C.primaryMuted, justifyContent: 'center', alignItems: 'center' }}>
                                <Ionicons name="layers-outline" size={22} color={C.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '800', textAlign: 'right' }}>إضافة دفعة جديدة</Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>{showBatchModal?.drug?.tradeName}</Text>
                            </View>
                        </View>
                        <Text style={sectionLabelStyle}>تفاصيل الدفعة</Text>
                        <TextInput style={inputStyle} placeholder="الكمية *" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.quantity} onChangeText={t => setFormData(f => ({ ...f, quantity: t }))} />
                        {renderQtyHint()}
                        {renderCostCalculator()}
                        <TextInput style={inputStyle} placeholder="تاريخ الصلاحية (YYYY-MM-DD) *" keyboardType="numeric" maxLength={10} placeholderTextColor={C.mutedForeground} value={formData.expiryDate} onChangeText={t => setFormData(f => ({ ...f, expiryDate: formatExpiry(t) }))} onBlur={() => setFormData(f => ({ ...f, expiryDate: checkExpiry(f.expiryDate).value }))} />
                        <TouchableOpacity
                            onPress={() => { setSupplierPickerContext('batch'); setShowSupplierPicker(true); }}
                            style={[inputStyle, { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }]}
                        >
                            <Text style={{ color: selectedSupplierId ? C.foreground : C.mutedForeground, fontSize: 14 }}>
                                {selectedSupplierId ? (suppliers.find(s => s.id === selectedSupplierId)?.name ?? 'مورد محدد') : 'المورد (اختياري)'}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color={C.mutedForeground} />
                        </TouchableOpacity>
                        {renderModalActions('حفظ', 'save-outline', handleAddBatch, () => setShowBatchModal(null))}
                    </ScrollView>
                </View>
            </Modal>

            {/* Add to Branch Modal */}
            <Modal visible={!!showBranchModal} transparent animationType="slide" onRequestClose={() => setShowBranchModal(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <ScrollView style={{ backgroundColor: C.card, borderTopLeftRadius: Radius.card, borderTopRightRadius: Radius.card, maxHeight: '90%' }} contentContainerStyle={{ padding: 20 }}>
                        <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 5, alignSelf: 'center', marginBottom: 16 }} />
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                            <View style={{ width: 44, height: 44, borderRadius: Radius.control, backgroundColor: C.primaryMuted, justifyContent: 'center', alignItems: 'center' }}>
                                <Ionicons name="cube-outline" size={22} color={C.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '800', textAlign: 'right' }}>إضافة الدواء للمخزون</Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>{showBranchModal?.tradeName}</Text>
                            </View>
                        </View>
                        <Text style={sectionLabelStyle}>التسعير والحدود</Text>
                        <TextInput style={inputStyle} placeholder="سعر بيع الشريط" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.price} onChangeText={t => setFormData(f => ({ ...f, price: t }))} />
                        <Text style={{ fontSize: 11, fontWeight: '600', textAlign: 'right', marginTop: -8, marginBottom: 10, color: C.mutedForeground }}>
                            سعر الشريط الواحد — وليس الباكيت
                        </Text>
                        <TextInput style={inputStyle} placeholder="حد النواقص" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.minStock} onChangeText={t => setFormData(f => ({ ...f, minStock: t }))} />
                        {renderCostCalculator()}
                        <Text style={sectionLabelStyle}>المخزون الأولي</Text>
                        <TextInput style={inputStyle} placeholder="الكمية" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.quantity} onChangeText={t => setFormData(f => ({ ...f, quantity: t }))} />
                        {renderQtyHint()}
                        <TextInput style={inputStyle} placeholder="تاريخ الصلاحية (YYYY-MM-DD)" keyboardType="numeric" maxLength={10} placeholderTextColor={C.mutedForeground} value={formData.expiryDate} onChangeText={t => setFormData(f => ({ ...f, expiryDate: formatExpiry(t) }))} onBlur={() => setFormData(f => ({ ...f, expiryDate: checkExpiry(f.expiryDate).value }))} />
                        <TouchableOpacity
                            onPress={() => { setSupplierPickerContext('branch'); setShowSupplierPicker(true); }}
                            style={[inputStyle, { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }]}
                        >
                            <Text style={{ color: selectedSupplierId ? C.foreground : C.mutedForeground, fontSize: 14 }}>
                                {selectedSupplierId ? (suppliers.find(s => s.id === selectedSupplierId)?.name ?? 'مورد محدد') : 'المورد (اختياري)'}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color={C.mutedForeground} />
                        </TouchableOpacity>
                        {renderModalActions('تنشيط وحفظ', 'checkmark-circle-outline', handleAddToBranch, () => setShowBranchModal(null))}
                    </ScrollView>
                </View>
            </Modal>

            {/* Create Drug Modal */}
            <Modal visible={!!showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <ScrollView style={{ backgroundColor: C.card, borderTopLeftRadius: Radius.card, borderTopRightRadius: Radius.card, maxHeight: '90%' }} contentContainerStyle={{ padding: 20 }}>
                        <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 5, alignSelf: 'center', marginBottom: 16 }} />
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                            <View style={{ width: 44, height: 44, borderRadius: Radius.control, backgroundColor: C.primaryMuted, justifyContent: 'center', alignItems: 'center' }}>
                                <Ionicons name="medkit-outline" size={22} color={C.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontSize: 17, fontWeight: '800', textAlign: 'right' }}>تسجيل دواء جديد</Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>الباركود: {showCreateModal}</Text>
                            </View>
                        </View>
                        <Text style={sectionLabelStyle}>معلومات الدواء</Text>
                        <TextInput style={inputStyle} placeholder="الاسم التجاري *" placeholderTextColor={C.mutedForeground} value={formData.tradeName} onChangeText={t => setFormData(f => ({ ...f, tradeName: t }))} />
                        <TextInput style={inputStyle} placeholder="الاسم العلمي" placeholderTextColor={C.mutedForeground} value={formData.scientificName} onChangeText={t => setFormData(f => ({ ...f, scientificName: t }))} />
                        <Text style={sectionLabelStyle}>التسعير والحدود</Text>
                        <TextInput style={inputStyle} placeholder="سعر بيع الشريط *" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.price} onChangeText={t => setFormData(f => ({ ...f, price: t }))} />
                        <Text style={{ fontSize: 11, fontWeight: '600', textAlign: 'right', marginTop: -8, marginBottom: 10, color: C.mutedForeground }}>
                            سعر الشريط الواحد — وليس الباكيت
                        </Text>
                        <TextInput style={inputStyle} placeholder="حد النواقص" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.minStock} onChangeText={t => setFormData(f => ({ ...f, minStock: t }))} />
                        {renderCostCalculator()}
                        <TouchableOpacity
                            onPress={() => { setSupplierPickerContext('create'); setShowSupplierPicker(true); }}
                            style={[inputStyle, { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }]}
                        >
                            <Text style={{ color: selectedSupplierId ? C.foreground : C.mutedForeground, fontSize: 14 }}>
                                {selectedSupplierId ? (suppliers.find(s => s.id === selectedSupplierId)?.name ?? 'مورد محدد') : 'المورد (اختياري)'}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color={C.mutedForeground} />
                        </TouchableOpacity>
                        <Text style={sectionLabelStyle}>المخزون الأولي</Text>
                        <TextInput style={inputStyle} placeholder="الكمية *" keyboardType="numeric" placeholderTextColor={C.mutedForeground} value={formData.quantity} onChangeText={t => setFormData(f => ({ ...f, quantity: t }))} />
                        {renderQtyHint()}
                        <TextInput style={inputStyle} placeholder="تاريخ الصلاحية (YYYY-MM-DD) *" keyboardType="numeric" maxLength={10} placeholderTextColor={C.mutedForeground} value={formData.expiryDate} onChangeText={t => setFormData(f => ({ ...f, expiryDate: formatExpiry(t) }))} onBlur={() => setFormData(f => ({ ...f, expiryDate: checkExpiry(f.expiryDate).value }))} />
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, marginVertical: 4 }}>
                            <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '600' }}>البيع السريع</Text>
                            <TouchableOpacity
                                onPress={() => setIsQuickSale(v => !v)}
                                style={{
                                    width: 36, height: 20, borderRadius: 10,
                                    backgroundColor: isQuickSale ? C.primary : C.border,
                                    justifyContent: 'center', paddingHorizontal: 2,
                                }}
                                activeOpacity={0.8}
                            >
                                <View style={{
                                    width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff',
                                    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
                                    alignSelf: isQuickSale ? 'flex-end' : 'flex-start',
                                }} />
                            </TouchableOpacity>
                        </View>
                        {renderModalActions('حفظ', 'save-outline', handleCreateDrug, () => setShowCreateModal(null))}
                    </ScrollView>
                </View>
            </Modal>

            {/* Supplier picker modal */}
            <Modal visible={showSupplierPicker} transparent animationType="slide" onRequestClose={() => setShowSupplierPicker(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: C.card, borderTopLeftRadius: Radius.card, borderTopRightRadius: Radius.card, padding: 20, maxHeight: '70%' }}>
                        <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
                        <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '700', textAlign: 'right', marginBottom: 12 }}>اختر مورداً</Text>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.card, borderRadius: Radius.control, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, marginBottom: 12, gap: 8 }}>
                            <Ionicons name="search" size={16} color={C.mutedForeground} />
                            <TextInput
                                style={{ flex: 1, color: C.foreground, paddingVertical: 8, textAlign: 'right', fontSize: 14 }}
                                placeholder="بحث..."
                                placeholderTextColor={C.mutedForeground}
                                value={supplierSearch}
                                onChangeText={setSupplierSearch}
                            />
                        </View>
                        <TouchableOpacity
                            onPress={() => { setSelectedSupplierId(null); setShowSupplierPicker(false); setSupplierSearch(''); }}
                            style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}
                        >
                            <Text style={{ color: C.mutedForeground, textAlign: 'right', fontSize: 14 }}>بدون مورد</Text>
                        </TouchableOpacity>
                        <FlatList
                            data={suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))}
                            keyExtractor={s => s.id}
                            renderItem={({ item: s }) => (
                                <TouchableOpacity
                                    onPress={() => { setSelectedSupplierId(s.id); setShowSupplierPicker(false); setSupplierSearch(''); }}
                                    style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}
                                >
                                    <Text style={{ color: C.foreground, fontWeight: '600', textAlign: 'right' }}>{s.name}</Text>
                                    {selectedSupplierId === s.id && <Ionicons name="checkmark" size={18} color={C.primary} />}
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={<Text style={{ color: C.mutedForeground, textAlign: 'center', paddingVertical: 20 }}>لا يوجد موردون</Text>}
                        />
                    </View>
                </View>
            </Modal>

            {/* ── Sort menu ──────────────────────────────────────────────────── */}
            {showSortMenu && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000 }}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} activeOpacity={1} onPress={() => setShowSortMenu(false)} />
                <Animated.View
                    {...sortPan.panHandlers}
                    style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        backgroundColor: C.card, borderTopLeftRadius: Radius.md, borderTopRightRadius: Radius.md,
                        paddingHorizontal: 20, paddingBottom: 32,
                        borderTopWidth: 1, borderColor: C.border,
                        transform: [{ translateY: sortSheetY }],
                    }}
                >
                    {/* Drag the sheet down to dismiss */}
                    <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 14 }}>
                        <View style={{ width: 44, height: 5, backgroundColor: C.border, borderRadius: 3 }} />
                    </View>
                    <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right', marginBottom: 12 }}>ترتيب حسب</Text>
                    {SORTS.map(s => {
                        const active = sortKey === s.key;
                        return (
                            <TouchableOpacity
                                key={s.key}
                                onPress={() => {
                                    if (sortKey === s.key) setSortAsc(v => !v);
                                    else { setSortKey(s.key); setSortAsc(true); }
                                    setShowSortMenu(false);
                                }}
                                activeOpacity={0.7}
                                style={{
                                    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                                    paddingVertical: 13, paddingHorizontal: 14, borderRadius: Radius.xs, marginBottom: 8,
                                    backgroundColor: active ? C.primaryMuted : 'transparent',
                                    borderWidth: 1, borderColor: active ? C.primary : C.border,
                                }}
                            >
                                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                                    <Ionicons name={s.icon} size={18} color={active ? C.primary : C.mutedForeground} />
                                    <Text style={{ color: active ? C.primary : C.foreground, fontSize: 14, fontWeight: active ? '800' : '500' }}>{s.label}</Text>
                                </View>
                                {active && (
                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
                                        <Ionicons name={sortAsc ? 'arrow-up' : 'arrow-down'} size={15} color={C.primary} />
                                        <Text style={{ color: C.primary, fontSize: 11, fontWeight: '700' }}>{sortAsc ? 'تصاعدي' : 'تنازلي'}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </Animated.View>
              </View>
            )}
        </View>
    );
}
