import { useState, useEffect, useRef, useMemo } from "react";
import { Package, AlertTriangle, CheckCircle, Plus, Edit2, Trash2, RefreshCcw, Scan, Loader2, Save, Upload, Search, X, TrendingUp, TrendingDown, DollarSign, BarChart3, ArrowUpDown } from "lucide-react";
import SyncHealthDashboard from "./SyncHealthDashboard";

interface InventoryItem {
    id: string;
    drugId: string;
    drug: {
        id: string;
        tradeName: string;
        scientificName: string;
        barcode: string;
        price: number;
    };
    quantity: number;
    costPrice: number;
    minStock: number;
    maxStock: number;
    branchId: string;
}

type UploadToast = {
    message: string;
    type: "success" | "error" | "info";
};

type SyncHealth = {
    pendingCount: number;
    failedCount: number;
    inProgress: boolean;
    oldestPendingAt: string | null;
    oldestPendingAgeSec: number;
    nextRetryAt: string | null;
    nextRetryInSec: number | null;
    byType: {
        "create-drug": number;
        "add-inventory": number;
        "delete-inventory": number;
    };
    topError: string | null;
    autoRetryIntervalSec: number;
};

type SortField = 'name' | 'quantity' | 'price' | 'costPrice' | 'profit';
type SortDir = 'asc' | 'desc';
type StockFilter = 'all' | 'low' | 'good' | 'over';

export default function InventoryPage({ user }: { user: any }) {
    const isAdmin = user?.role === 'ADMIN';
    const [barcode, setBarcode] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [isChecking, setIsChecking] = useState(false);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [isUploadingPending, setIsUploadingPending] = useState(false);
    const [uploadToast, setUploadToast] = useState<UploadToast | null>(null);
    const [syncHealth, setSyncHealth] = useState<SyncHealth | null>(null);
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [stockFilter, setStockFilter] = useState<StockFilter>('all');
    const barcodeInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Modal States
    const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
    const [showEditModal, setShowEditModal] = useState<InventoryItem | null>(null);
    const [showBatchModal, setShowBatchModal] = useState<InventoryItem | null>(null);
    const [showCreateDrugModal, setShowCreateDrugModal] = useState<string | null>(null);
    const [showAddToInventoryModal, setShowAddToInventoryModal] = useState<any | null>(null);

    // Form States for Add Batch
    const [batchData, setBatchData] = useState({
        quantity: 0,
        costPrice: 0,
        expiryDate: "",
        supplierId: "" as string,
    });

    // Local supplier cache for offline dropdown
    const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);

    useEffect(() => {
        window.ipcRenderer.invoke('get-local-suppliers')
            .then((result: any) => { if (Array.isArray(result)) setSuppliers(result); })
            .catch(() => {});
    }, []);

    const formatIQD = (amount: number) => {
        return new Intl.NumberFormat('ar-IQ', {
            style: 'decimal',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount) + ' د.ع';
    };

    const formatDuration = (totalSeconds: number | null | undefined) => {
        if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "—";
        const seconds = Math.max(0, Math.floor(totalSeconds));
        if (seconds < 60) return `${seconds}ث`;
        const minutes = Math.floor(seconds / 60);
        const remSeconds = seconds % 60;
        if (minutes < 60) return remSeconds === 0 ? `${minutes}د` : `${minutes}د ${remSeconds}ث`;
        const hours = Math.floor(minutes / 60);
        const remMinutes = minutes % 60;
        return remMinutes === 0 ? `${hours}س` : `${hours}س ${remMinutes}د`;
    };

    // === Stats ===
    const stats = useMemo(() => {
        const totalItems = items.length;
        const totalStock = items.reduce((a, b) => a + b.quantity, 0);
        const lowStockCount = items.filter(i => i.quantity <= i.minStock && i.quantity > 0).length;
        const outOfStockCount = items.filter(i => i.quantity <= 0).length;
        const overStockCount = items.filter(i => i.quantity >= i.maxStock).length;
        const totalCostValue = items.reduce((a, b) => a + (b.costPrice * b.quantity), 0);
        const totalRetailValue = items.reduce((a, b) => a + (b.drug.price * b.quantity), 0);
        const totalProfit = totalRetailValue - totalCostValue;
        return { totalItems, totalStock, lowStockCount, outOfStockCount, overStockCount, totalCostValue, totalRetailValue, totalProfit };
    }, [items]);

    // === Filtered & Sorted Items ===
    const filteredItems = useMemo(() => {
        let result = [...items];

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(i =>
                i.drug.tradeName.toLowerCase().includes(term) ||
                i.drug.barcode.includes(term) ||
                i.drug.scientificName?.toLowerCase().includes(term)
            );
        }

        // Stock filter
        if (stockFilter === 'low') result = result.filter(i => i.quantity <= i.minStock);
        else if (stockFilter === 'good') result = result.filter(i => i.quantity > i.minStock && i.quantity < i.maxStock);
        else if (stockFilter === 'over') result = result.filter(i => i.quantity >= i.maxStock);

        // Sort
        result.sort((a, b) => {
            let va: number | string = 0, vb: number | string = 0;
            switch (sortField) {
                case 'name': va = a.drug.tradeName; vb = b.drug.tradeName; break;
                case 'quantity': va = a.quantity; vb = b.quantity; break;
                case 'price': va = a.drug.price; vb = b.drug.price; break;
                case 'costPrice': va = a.costPrice; vb = b.costPrice; break;
                case 'profit': va = (a.drug.price - a.costPrice) * a.quantity; vb = (b.drug.price - b.costPrice) * b.quantity; break;
            }
            if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
            return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
        });

        return result;
    }, [items, searchTerm, stockFilter, sortField, sortDir]);

    const toggleSort = (field: SortField) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const checkBarcode = async (code: string) => {
        if (!window.ipcRenderer) return;
        setIsChecking(true);
        try {
            const data = await window.ipcRenderer.invoke('check-barcode-local', {
                barcode: code,
                branchId: user.branchId
            });

            if (data.exists) {
                if (data.inventory) {
                    setShowBatchModal(data.inventory);
                } else {
                    setShowAddToInventoryModal(data.drug);
                }
            } else {
                setShowCreateDrugModal(code);
            }
        } catch (error) {
            console.error("Barcode check error:", error);
        } finally {
            setIsChecking(false);
            setBarcode("");
        }
    };

    const handleBarcodeSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && barcode.trim()) {
            checkBarcode(barcode.trim());
        }
    };

    const fetchInventory = async () => {
        if (window.ipcRenderer) {
            setLoading(true);
            try {
                const [data, pending, health] = await Promise.all([
                    window.ipcRenderer.invoke('get-inventory-items', { searchTerm: "", user }),
                    window.ipcRenderer.invoke('get-pending-sync-count'),
                    window.ipcRenderer.invoke('get-sync-health')
                ]);
                setItems(data);
                const pendingCount = Number(health?.pendingCount ?? pending?.count ?? 0);
                setPendingSyncCount(Number.isFinite(pendingCount) ? pendingCount : 0);
                setSyncHealth(health ?? null);
            } catch (error) {
                console.error("Failed to fetch inventory", error);
            } finally {
                setLoading(false);
            }
        }
    };

    const handleUploadPending = async () => {
        if (!window.ipcRenderer) return;
        setIsUploadingPending(true);
        try {
            const res = await window.ipcRenderer.invoke('sync-pending-inventory');
            await fetchInventory();

            if (!res.success && res.failed > 0) {
                setUploadToast({ type: "error", message: `تم رفع ${res.processed || 0}، فشل ${res.failed || 0}، معلق ${res.pending || 0}` });
                return;
            }
            if ((res.processed || 0) === 0 && (res.pending || 0) === 0) {
                setUploadToast({ type: "info", message: "لا توجد بيانات معلقة للرفع." });
                return;
            }
            setUploadToast({ type: "success", message: `تم رفع ${res.processed || 0} عنصر. معلق ${res.pending || 0}` });
        } catch (error) {
            setUploadToast({ type: "error", message: "فشل رفع البيانات للسيرفر." });
        } finally {
            setIsUploadingPending(false);
        }
    };

    const handleSync = async () => {
        if (window.ipcRenderer) {
            setLoading(true);
            try {
                const res = await window.ipcRenderer.invoke('sync-inventory');
                if (res.success) {
                    await fetchInventory();
                    setUploadToast({ type: "success", message: "تمت المزامنة بنجاح ✓" });
                } else {
                    const errorMsg = res.error || "";
                    if (errorMsg.includes("database") || errorMsg.includes("Neon")) {
                        setUploadToast({ type: "error", message: "السيرفر مضغوط حالياً. يرجى المحاولة لاحقاً." });
                    } else if (errorMsg.includes("fetch") || errorMsg.includes("network")) {
                        setUploadToast({ type: "error", message: "خطأ في الاتصال بالانترنت." });
                    } else {
                        setUploadToast({ type: "error", message: "فشلت المزامنة: " + (res.error || "خطأ غير معروف") });
                    }
                }
            } catch (error) {
                setUploadToast({ type: "error", message: "تعذر الاتصال بالسيرفر." });
            } finally {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") { setBarcode(""); setSearchTerm(""); }
            if (e.key === "F2") { e.preventDefault(); barcodeInputRef.current?.focus(); }
            if (e.key === "/" && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); searchInputRef.current?.focus(); }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    useEffect(() => { fetchInventory(); }, []);

    useEffect(() => {
        if (!uploadToast) return;
        const timer = setTimeout(() => setUploadToast(null), 3200);
        return () => clearTimeout(timer);
    }, [uploadToast]);

    useEffect(() => {
        const onPendingSyncCount = (_event: unknown, count: number) => {
            setPendingSyncCount(Number.isFinite(count) ? count : 0);
        };
        window.ipcRenderer.on('pending-sync-count', onPendingSyncCount as any);
        return () => { window.ipcRenderer.off('pending-sync-count', onPendingSyncCount as any); };
    }, []);

    useEffect(() => {
        const onSyncHealthUpdated = (_event: unknown, health: SyncHealth) => {
            if (!health || typeof health !== 'object') return;
            setSyncHealth(health);
            const count = Number(health.pendingCount || 0);
            setPendingSyncCount(Number.isFinite(count) ? count : 0);
        };
        window.ipcRenderer.on('sync-health-updated', onSyncHealthUpdated as any);
        return () => { window.ipcRenderer.off('sync-health-updated', onSyncHealthUpdated as any); };
    }, []);

    const handleDelete = async () => {
        if (!showDeleteModal) return;
        try {
            await window.ipcRenderer.invoke('delete-inventory-item', showDeleteModal);
            setShowDeleteModal(null);
            fetchInventory();
        } catch (error) {
            setUploadToast({ type: "error", message: "فشل حذف العنصر" });
        }
    };

    const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!showEditModal) return;
        const formData = new FormData(e.currentTarget);
        try {
            await window.ipcRenderer.invoke('update-inventory-item', {
                id: showEditModal.id,
                drugId: showEditModal.drugId || showEditModal.drug?.id,
                price: formData.get('price'),
                costPrice: formData.get('costPrice'),
                minStock: formData.get('minStock'),
                maxStock: formData.get('maxStock'),
            });
            setShowEditModal(null);
            fetchInventory();
            setUploadToast({ type: "success", message: "تم تحديث البيانات بنجاح ✓" });
        } catch (error) {
            setUploadToast({ type: "error", message: "فشل تحديث البيانات" });
        }
    };

    const handleAddBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showBatchModal) return;
        try {
            await window.ipcRenderer.invoke('add-inventory-batch', {
                inventoryId: showBatchModal.id,
                ...batchData
            });
            setShowBatchModal(null);
            setBatchData({ quantity: 0, costPrice: 0, expiryDate: "", supplierId: "" });
            fetchInventory();
            setUploadToast({ type: "success", message: "تمت إضافة الدفعة بنجاح ✓" });
        } catch (error) {
            setUploadToast({ type: "error", message: "فشل إضافة الدفعة" });
        }
    };

    const handleCreateDrug = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!showCreateDrugModal) return;
        const formData = new FormData(e.currentTarget);
        const data = {
            barcode: showCreateDrugModal,
            tradeName: formData.get('tradeName'),
            scientificName: formData.get('scientificName'),
            price: formData.get('price'),
            costPrice: formData.get('costPrice'),
            quantity: formData.get('quantity'),
            minStock: formData.get('minStock'),
            maxStock: formData.get('maxStock'),
            origin: formData.get('origin'),
            expiryDate: formData.get('expiryDate'),
        };

        try {
            const res = await window.ipcRenderer.invoke('create-global-drug-local', data);
            if (res.success) {
                await window.ipcRenderer.invoke('add-to-inventory-local', {
                    drugId: res.drug.id,
                    branchId: user.branchId,
                    costPrice: formData.get('costPrice'),
                    price: formData.get('price'),
                    quantity: formData.get('quantity'),
                    minStock: formData.get('minStock'),
                    maxStock: formData.get('maxStock'),
                    expiryDate: formData.get('expiryDate'),
                    skipCloudPush: true,
                });
                setShowCreateDrugModal(null);
                fetchInventory();
                setUploadToast({ type: "success", message: "تم إضافة الدواء بنجاح ✓" });
            }
        } catch (error) {
            setUploadToast({ type: "error", message: "فشل إضافة الدواء" });
        }
    };

    const handleAddToInventory = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!showAddToInventoryModal) return;
        const formData = new FormData(e.currentTarget);
        try {
            await window.ipcRenderer.invoke('add-to-inventory-local', {
                drugId: showAddToInventoryModal.id,
                branchId: user.branchId,
                costPrice: formData.get('costPrice'),
                quantity: formData.get('quantity'),
                minStock: formData.get('minStock'),
                maxStock: formData.get('maxStock'),
                expiryDate: formData.get('expiryDate'),
            });
            setShowAddToInventoryModal(null);
            fetchInventory();
            setUploadToast({ type: "success", message: "تم الإضافة للمخزون ✓" });
        } catch (error) {
            setUploadToast({ type: "error", message: "فشل الإضافة للمخزن" });
        }
    };

    const syncHealthView = useMemo(() => {
        const pending = Number(syncHealth?.pendingCount ?? pendingSyncCount ?? 0);
        const failed = Number(syncHealth?.failedCount ?? 0);
        const inProgress = Boolean(syncHealth?.inProgress);
        const status = inProgress
            ? "جاري الرفع"
            : pending === 0
                ? "مستقر"
                : failed > 0
                    ? "بحاجة متابعة"
                    : "ينتظر المزامنة";
        const statusClass = inProgress
            ? "bg-primary/10 text-primary border-primary/30"
            : pending === 0
                ? "bg-success/10 text-success border-success/30"
                : failed > 0
                    ? "bg-warning/10 text-warning border-warning/30"
                    : "bg-muted text-muted-foreground border-border";

        return {
            pending,
            failed,
            inProgress,
            status,
            statusClass,
            oldestAge: formatDuration(syncHealth?.oldestPendingAgeSec),
            nextRetry: formatDuration(syncHealth?.nextRetryInSec),
            topError: syncHealth?.topError || null,
            autoRetryInterval: formatDuration(syncHealth?.autoRetryIntervalSec ?? null),
        };
    }, [syncHealth, pendingSyncCount]);

    const getStockPercent = (item: InventoryItem) => Math.min(100, Math.round((item.quantity / item.maxStock) * 100));

    return (
        <div dir="rtl" className="h-full flex flex-col bg-background">
            {/* ======= HEADER ======= */}
            <div className="bg-card/80 backdrop-blur-xl border-b border-border/60 px-6 py-4 shadow-sm relative z-10">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                            <Package className="w-6 h-6 text-primary-foreground" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-foreground tracking-tight">إدارة المخزون</h1>
                            <p className="text-xs text-muted-foreground">{stats.totalItems} صنف • {stats.totalStock} وحدة</p>
                        </div>
                        {user.role === 'ADMIN' && (
                            <span className="text-[9px] font-black text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">مدير ⚡</span>
                        )}
                    </div>

                    <div className="flex gap-2 mt-4 items-center">
                        <SyncHealthDashboard />
                        {pendingSyncCount > 0 && (
                            <button
                                onClick={handleUploadPending}
                                disabled={isUploadingPending}
                                className="flex items-center gap-2 bg-success/10 border border-success/30 text-success hover:bg-success/20 px-4 py-2.5 rounded-xl transition-all font-bold text-sm"
                            >
                                <Upload className={`w-4 h-4 ${isUploadingPending ? 'animate-pulse' : ''}`} />
                                <span>رفع للسيرفر</span>
                                <span className="min-w-5 h-5 px-1.5 rounded-full bg-success text-success-foreground text-[10px] flex items-center justify-center font-black">
                                    {pendingSyncCount}
                                </span>
                            </button>
                        )}
                        <button
                            onClick={handleSync}
                            disabled={loading}
                            className="flex items-center gap-2 bg-card border border-border text-muted-foreground hover:border-primary hover:text-primary px-4 py-2.5 rounded-xl transition-all font-bold text-sm"
                        >
                            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            <span>مزامنة</span>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                    <div className={`rounded-xl border px-3 py-2 ${syncHealthView.statusClass}`}>
                        <p className="text-[10px] font-bold opacity-75">حالة المزامنة</p>
                        <p className="text-sm font-black">{syncHealthView.status}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card px-3 py-2">
                        <p className="text-[10px] text-muted-foreground font-bold">المعلق</p>
                        <p className="text-sm font-black text-foreground">{syncHealthView.pending}</p>
                    </div>
                    <div className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2">
                        <p className="text-[10px] text-warning font-bold">فشل سابق</p>
                        <p className="text-sm font-black text-warning">{syncHealthView.failed}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card px-3 py-2">
                        <p className="text-[10px] text-muted-foreground font-bold">أقدم عملية</p>
                        <p className="text-sm font-black text-foreground">{syncHealthView.oldestAge}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card px-3 py-2">
                        <p className="text-[10px] text-muted-foreground font-bold">إعادة المحاولة</p>
                        <p className="text-sm font-black text-foreground">{syncHealthView.nextRetry}</p>
                    </div>
                </div>

                {syncHealthView.topError && (
                    <div className="mb-4 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2">
                        <p className="text-[10px] text-warning font-bold">آخر سبب فشل</p>
                        <p className="text-xs text-foreground truncate font-semibold">{syncHealthView.topError}</p>
                        <p className="text-[10px] text-warning/80 mt-1">التحديث التلقائي كل {syncHealthView.autoRetryInterval}</p>
                    </div>
                )}

                {/* Barcode Input */}
                <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-l from-primary via-primary/80 to-primary/60 rounded-2xl opacity-0 group-focus-within:opacity-20 blur transition-opacity duration-300"></div>
                    <div className="relative flex items-center bg-card border-2 border-border/80 rounded-2xl px-4 py-0.5 focus-within:border-ring focus-within:shadow-xl focus-within:shadow-ring/10 transition-all duration-300">
                        <div className="flex items-center justify-center pl-3 text-muted-foreground group-focus-within:text-primary transition-colors duration-300">
                            {isChecking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Scan className="w-5 h-5 stroke-[2.5]" />}
                        </div>
                        <input
                            ref={barcodeInputRef}
                            type="text"
                            placeholder="امسح الباركود للبحث أو الإضافة..."
                            value={barcode}
                            onChange={(e) => setBarcode(e.target.value)}
                            onKeyDown={handleBarcodeSubmit}
                            className="w-full bg-transparent border-none py-3 px-3 text-base focus:ring-0 outline-none placeholder-muted-foreground font-bold text-foreground font-mono tracking-wide"
                        />
                        <kbd className="hidden group-focus-within:flex shrink-0 items-center gap-1 bg-muted text-muted-foreground text-[10px] font-bold px-2 py-1 rounded-lg border border-border">F2</kbd>
                    </div>
                </div>
            </div>

            {/* ======= STATS CARDS ======= */}
            <div className="px-6 pt-5 pb-2">
                <div className={`grid gap-3 ${isAdmin ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'}`}>
                    {/* Total Value — ADMIN only */}
                    {isAdmin && (
                        <div className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-muted-foreground font-bold">قيمة المخزون</span>
                                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                                    <DollarSign className="w-4 h-4 text-primary" />
                                </div>
                            </div>
                            <p className="text-lg font-black text-foreground tabular-nums">{formatIQD(stats.totalRetailValue)}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">تكلفة: {formatIQD(stats.totalCostValue)}</p>
                        </div>
                    )}

                    {/* Profit — ADMIN only */}
                    {isAdmin && (
                        <div className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-muted-foreground font-bold">الربح المتوقع</span>
                                <div className="w-8 h-8 bg-success/10 rounded-lg flex items-center justify-center">
                                    <TrendingUp className="w-4 h-4 text-success" />
                                </div>
                            </div>
                            <p className="text-lg font-black text-success tabular-nums">{formatIQD(stats.totalProfit)}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">هامش {stats.totalRetailValue > 0 ? Math.round((stats.totalProfit / stats.totalRetailValue) * 100) : 0}%</p>
                        </div>
                    )}

                    {/* Low Stock */}
                    <div className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground font-bold">نقص المخزون</span>
                            <div className="w-8 h-8 bg-destructive/10 rounded-lg flex items-center justify-center">
                                <TrendingDown className="w-4 h-4 text-destructive" />
                            </div>
                        </div>
                        <p className="text-lg font-black text-destructive tabular-nums">{stats.lowStockCount}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">نفد: {stats.outOfStockCount} صنف</p>
                    </div>

                    {/* Total Items */}
                    <div className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground font-bold">إجمالي الأصناف</span>
                            <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                                <BarChart3 className="w-4 h-4 text-purple-600" />
                            </div>
                        </div>
                        <p className="text-lg font-black text-foreground tabular-nums">{stats.totalItems}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">فائض: {stats.overStockCount} صنف</p>
                    </div>
                </div>
            </div>

            {/* ======= SEARCH & FILTER BAR ======= */}
            <div className="px-6 py-3 flex items-center gap-3">
                <div className="flex-1 relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="بحث بالاسم أو الباركود..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-card border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/10 transition-all placeholder:text-muted-foreground"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl p-1">
                    {([
                        { key: 'all' as StockFilter, label: 'الكل', count: items.length },
                        { key: 'low' as StockFilter, label: 'نقص', count: items.filter(i => i.quantity <= i.minStock).length },
                        { key: 'good' as StockFilter, label: 'جيد', count: items.filter(i => i.quantity > i.minStock && i.quantity < i.maxStock).length },
                        { key: 'over' as StockFilter, label: 'فائض', count: items.filter(i => i.quantity >= i.maxStock).length },
                    ]).map(f => (
                        <button
                            key={f.key}
                            onClick={() => setStockFilter(f.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${stockFilter === f.key
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:bg-muted'
                                }`}
                        >
                            {f.label} <span className="opacity-60">({f.count})</span>
                        </button>
                    ))}
                </div>

                <span className="text-xs text-muted-foreground font-medium">{filteredItems.length} نتيجة</span>
            </div>

            {/* ======= TABLE ======= */}
            <div className="flex-1 overflow-auto px-6 pb-6">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-muted-foreground font-bold text-sm">جاري تحميل البيانات...</p>
                    </div>
                ) : (
                    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                        <table className="w-full text-right border-collapse">
                            <thead>
                                <tr className="bg-muted/50 text-muted-foreground text-xs font-bold border-b border-border">
                                    <th className="px-4 py-3.5 cursor-pointer hover:text-primary transition-colors" onClick={() => toggleSort('name')}>
                                        <div className="flex items-center gap-1">
                                            اسم الدواء
                                            {sortField === 'name' && <ArrowUpDown className="w-3 h-3" />}
                                        </div>
                                    </th>
                                    <th className="px-4 py-3.5 cursor-pointer hover:text-primary transition-colors" onClick={() => toggleSort('quantity')}>
                                        <div className="flex items-center gap-1">
                                            المخزون
                                            {sortField === 'quantity' && <ArrowUpDown className="w-3 h-3" />}
                                        </div>
                                    </th>
                                    <th className="px-4 py-3.5">الحالة</th>
                                    {isAdmin && (
                                        <th className="px-4 py-3.5 cursor-pointer hover:text-primary transition-colors" onClick={() => toggleSort('costPrice')}>
                                            <div className="flex items-center gap-1">
                                                التكلفة
                                                {sortField === 'costPrice' && <ArrowUpDown className="w-3 h-3" />}
                                            </div>
                                        </th>
                                    )}
                                    <th className="px-4 py-3.5 cursor-pointer hover:text-primary transition-colors" onClick={() => toggleSort('price')}>
                                        <div className="flex items-center gap-1">
                                            البيع
                                            {sortField === 'price' && <ArrowUpDown className="w-3 h-3" />}
                                        </div>
                                    </th>
                                    {isAdmin && (
                                        <th className="px-4 py-3.5 cursor-pointer hover:text-primary transition-colors" onClick={() => toggleSort('profit')}>
                                            <div className="flex items-center gap-1">
                                                الربح
                                                {sortField === 'profit' && <ArrowUpDown className="w-3 h-3" />}
                                            </div>
                                        </th>
                                    )}
                                    <th className="px-4 py-3.5 text-center">إجراءات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {filteredItems.map((item) => {
                                    const stockPct = getStockPercent(item);
                                    const isLow = item.quantity <= item.minStock;
                                    const isOver = item.quantity >= item.maxStock;
                                    const isOut = item.quantity <= 0;
                                    const profit = (item.drug.price - item.costPrice) * item.quantity;
                                    const profitPerUnit = item.drug.price - item.costPrice;
                                    const profitMargin = item.drug.price > 0 ? Math.round((profitPerUnit / item.drug.price) * 100) : 0;

                                    return (
                                        <tr key={item.id} className="hover:bg-primary/5 transition-colors group">
                                            {/* Drug Name */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 ${isOut ? 'bg-destructive/10' : isLow ? 'bg-warning/10' : 'bg-primary/10'
                                                        }`}>
                                                        💊
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-foreground text-sm truncate">{item.drug.tradeName}</p>
                                                        <p className="text-[10px] text-muted-foreground font-mono">{item.drug.barcode}</p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Stock with Progress Bar */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex flex-col gap-1.5 w-32">
                                                    <div className="flex items-baseline justify-between">
                                                        <span className={`text-base font-black tabular-nums ${isOut ? 'text-destructive' : isLow ? 'text-warning' : 'text-foreground'}`}>
                                                            {item.quantity}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {item.minStock} - {item.maxStock}
                                                        </span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${isOut ? 'bg-destructive' : isLow ? 'bg-warning' : isOver ? 'bg-purple-500' : 'bg-success'
                                                                }`}
                                                            style={{ width: `${stockPct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Status Badge */}
                                            <td className="px-4 py-3.5">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${isOut ? 'bg-destructive/10 text-destructive' :
                                                    isLow ? 'bg-warning/10 text-warning' :
                                                        isOver ? 'bg-purple-100 text-purple-700' :
                                                            'bg-success/10 text-success'
                                                    }`}>
                                                    {isOut ? <AlertTriangle className="w-3 h-3" /> : isLow ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                                                    {isOut ? 'نفد' : isLow ? 'نقص' : isOver ? 'فائض' : 'جيد'}
                                                </span>
                                            </td>

                                            {/* Cost Price — ADMIN only */}
                                            {isAdmin && (
                                                <td className="px-4 py-3.5">
                                                    <span className="text-sm font-bold text-muted-foreground tabular-nums">{formatIQD(item.costPrice || 0)}</span>
                                                </td>
                                            )}

                                            {/* Retail Price */}
                                            <td className="px-4 py-3.5">
                                                <span className="text-sm font-bold text-primary tabular-nums">{formatIQD(item.drug.price)}</span>
                                            </td>

                                            {/* Profit — ADMIN only */}
                                            {isAdmin && (
                                                <td className="px-4 py-3.5">
                                                    <div className="flex flex-col">
                                                        <span className={`text-sm font-black tabular-nums ${profit > 0 ? 'text-success' : 'text-destructive'}`}>
                                                            {formatIQD(profit)}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground">{profitMargin}% هامش</span>
                                                    </div>
                                                </td>
                                            )}

                                            {/* Actions */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => setShowBatchModal(item)}
                                                        title="إضافة دفعة"
                                                        className="flex items-center gap-1 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground px-2.5 py-1.5 rounded-lg transition-all font-bold text-[11px]"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                        دفعة
                                                    </button>
                                                    {isAdmin && (
                                                        <>
                                                            <button
                                                                onClick={() => setShowEditModal(item)}
                                                                title="تعديل"
                                                                className="p-1.5 text-muted-foreground hover:text-warning hover:bg-warning/10 rounded-lg transition-all"
                                                            >
                                                                <Edit2 className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => setShowDeleteModal(item.id)}
                                                                title="حذف"
                                                                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredItems.length === 0 && (
                                    <tr>
                                        <td colSpan={isAdmin ? 7 : 5} className="px-6 py-16 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                                                    <Package className="w-8 h-8 text-muted-foreground/30" />
                                                </div>
                                                <p className="text-muted-foreground text-sm font-bold">
                                                    {searchTerm ? `لا توجد نتائج لـ "${searchTerm}"` : 'لم يتم العثور على أدوية في المخزن'}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ======= TOAST ======= */}
            {
                uploadToast && (
                    <div
                        className={`fixed bottom-5 left-5 z-[70] max-w-sm rounded-xl border px-4 py-3 shadow-xl backdrop-blur-md animate-slideUp ${uploadToast.type === "success"
                            ? "bg-success/10 border-success/30 text-success"
                            : uploadToast.type === "error"
                                ? "bg-destructive/10 border-destructive/30 text-destructive"
                                : "bg-primary/10 border-primary/30 text-primary"
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            {uploadToast.type === "success" && <CheckCircle className="w-4 h-4 shrink-0" />}
                            {uploadToast.type === "error" && <AlertTriangle className="w-4 h-4 shrink-0" />}
                            {uploadToast.type === "info" && <Package className="w-4 h-4 shrink-0" />}
                            <p className="text-sm font-bold">{uploadToast.message}</p>
                        </div>
                    </div>
                )
            }

            {/* ======= DELETE MODAL ======= */}
            {
                showDeleteModal && (
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-card rounded-2xl max-w-md w-full p-6 shadow-2xl border border-border">
                            <div className="w-14 h-14 bg-destructive/10 text-destructive rounded-xl flex items-center justify-center mx-auto mb-4">
                                <Trash2 className="w-7 h-7" />
                            </div>
                            <h2 className="text-xl font-bold text-center mb-2">تأكيد الحذف</h2>
                            <p className="text-muted-foreground text-center text-sm mb-6">هل أنت متأكد؟ لا يمكن التراجع عن هذه الخطوة.</p>
                            <div className="flex gap-3">
                                <button onClick={handleDelete} className="flex-1 bg-destructive text-destructive-foreground py-2.5 rounded-xl font-bold hover:bg-destructive/90 transition-colors text-sm">تأكيد الحذف</button>
                                <button onClick={() => setShowDeleteModal(null)} className="flex-1 bg-muted text-foreground py-2.5 rounded-xl font-bold hover:bg-muted/80 transition-colors text-sm">إلغاء</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* ======= EDIT MODAL ======= */}
            {
                showEditModal && (
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-card rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-border overflow-y-auto max-h-[90vh]">
                            <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
                                <Edit2 className="w-5 h-5 text-warning" />
                                تعديل بيانات الدواء
                            </h2>
                            <form onSubmit={handleEdit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">الدواء</label>
                                    <input type="text" defaultValue={showEditModal.drug.tradeName} disabled className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-muted-foreground text-sm" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground mb-1.5">سعر الجمهور</label>
                                        <input name="price" type="number" defaultValue={showEditModal.drug.price} className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground mb-1.5">سعر التكلفة</label>
                                        <input name="costPrice" type="number" defaultValue={showEditModal.costPrice} className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground mb-1.5">الحد الأدنى</label>
                                        <input name="minStock" type="number" defaultValue={showEditModal.minStock} className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground mb-1.5">الحد الأقصى</label>
                                        <input name="maxStock" type="number" defaultValue={showEditModal.maxStock} className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                    </div>
                                </div>
                                <div className="flex gap-3 pt-3">
                                    <button type="submit" className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-bold hover:bg-primary/90 transition-colors text-sm shadow-lg shadow-primary/20">حفظ التغييرات</button>
                                    <button type="button" onClick={() => setShowEditModal(null)} className="flex-1 bg-muted text-foreground py-2.5 rounded-xl font-bold hover:bg-muted/80 transition-colors text-sm">إلغاء</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* ======= ADD BATCH MODAL ======= */}
            {
                showBatchModal && (
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-card rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-border overflow-y-auto max-h-[90vh]">
                            <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                                <Plus className="w-5 h-5 text-success" />
                                إضافة دفعة جديدة
                            </h2>
                            <p className="text-muted-foreground text-sm mb-5">للدواء: <span className="text-primary font-black">{showBatchModal.drug?.tradeName}</span></p>

                            <form onSubmit={handleAddBatch} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">الكمية</label>
                                    <input type="number" placeholder="0" value={batchData.quantity || ""} onChange={(e) => setBatchData({ ...batchData, quantity: parseInt(e.target.value) || 0 })} required className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">سعر شراء الدفعة (التكلفة للعلبة)</label>
                                    <input type="number" step="0.01" placeholder="0" value={batchData.costPrice || ""} onChange={(e) => setBatchData({ ...batchData, costPrice: parseFloat(e.target.value) || 0 })} required className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">تاريخ انتهاء الصلاحية</label>
                                    <input type="date" value={batchData.expiryDate} onChange={(e) => setBatchData({ ...batchData, expiryDate: e.target.value })} required className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">المورد (اختياري)</label>
                                    <select value={batchData.supplierId} onChange={(e) => setBatchData({ ...batchData, supplierId: e.target.value })} className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring">
                                        <option value="">اختر مورداً...</option>
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex gap-3 pt-3">
                                    <button type="submit" className="flex-1 bg-success text-success-foreground py-2.5 rounded-xl font-bold hover:bg-success/90 transition-colors text-sm shadow-lg shadow-success/20">إضافة الدفعة</button>
                                    <button type="button" onClick={() => setShowBatchModal(null)} className="flex-1 bg-muted text-foreground py-2.5 rounded-xl font-bold hover:bg-muted/80 transition-colors text-sm">إلغاء</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* ======= CREATE DRUG MODAL ======= */}
            {
                showCreateDrugModal && (
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-card rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-border overflow-y-auto max-h-[90vh]">
                            <h2 className="text-xl font-bold mb-1">دواء جديد</h2>
                            <p className="text-muted-foreground text-sm mb-5">الباركود: <span className="text-primary font-bold font-mono">{showCreateDrugModal}</span> غير موجود.</p>

                            <form onSubmit={handleCreateDrug} className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">الاسم التجاري</label>
                                    <input type="text" name="tradeName" required className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">الاسم العلمي</label>
                                    <input type="text" name="scientificName" required className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">المنشأ</label>
                                    <input type="text" name="origin" placeholder="المانيا" className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">سعر الجمهور</label>
                                    <input type="number" step="0.01" name="price" required className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">سعر التكلفة</label>
                                    <input type="number" step="0.01" name="costPrice" required className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">الكمية الافتتاحية</label>
                                    <input type="number" name="quantity" defaultValue="0" required className="w-full bg-primary/10 border border-primary/30 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring font-bold text-primary" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground mb-1.5">الحد الأدنى</label>
                                        <input type="number" name="minStock" defaultValue="10" className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground mb-1.5">الحد الأعلى</label>
                                        <input type="number" name="maxStock" defaultValue="100" className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">تاريخ انتهاء الصلاحية</label>
                                    <input type="date" name="expiryDate" defaultValue={new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString().split('T')[0]} className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                </div>
                                <div className="col-span-2 flex gap-3 pt-4">
                                    <button type="submit" className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-bold hover:bg-primary/90 transition-all text-sm shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
                                        <Save className="w-4 h-4" />
                                        حفظ وإضافة للمخزون
                                    </button>
                                    <button type="button" onClick={() => setShowCreateDrugModal(null)} className="flex-1 bg-muted text-foreground py-3 rounded-xl font-bold hover:bg-muted/80 transition-all text-sm">إلغاء</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* ======= ADD TO INVENTORY MODAL ======= */}
            {
                showAddToInventoryModal && (
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-card rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-border overflow-y-auto max-h-[90vh]">
                            <h2 className="text-xl font-bold mb-1">إضافة للمخزن</h2>
                            <p className="text-muted-foreground text-sm mb-5">الدواء <span className="text-primary font-bold">{showAddToInventoryModal.tradeName}</span> موجود في النظام.</p>

                            <form onSubmit={handleAddToInventory} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">سعر التكلفة</label>
                                    <input type="number" step="0.01" name="costPrice" required className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">الكمية الحالية</label>
                                    <input type="number" name="quantity" defaultValue="0" required className="w-full bg-primary/10 border border-primary/30 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring font-bold text-primary" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground mb-1.5">الحد الأدنى</label>
                                        <input type="number" name="minStock" defaultValue="10" className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground mb-1.5">الحد الأعلى</label>
                                        <input type="number" name="maxStock" defaultValue="100" className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring" />
                                    </div>
                                </div>
                                <div className="flex gap-3 pt-3">
                                    <button type="submit" className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-bold hover:bg-primary/90 transition-colors text-sm shadow-lg shadow-primary/20">إضافة للمخزون</button>
                                    <button type="button" onClick={() => setShowAddToInventoryModal(null)} className="flex-1 bg-muted text-foreground py-2.5 rounded-xl font-bold hover:bg-muted/80 transition-colors text-sm">إلغاء</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
        </div>
    );
}
