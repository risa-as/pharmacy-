import { useState, useEffect } from "react";
import { ShoppingBag, AlertTriangle, Clock, RefreshCw, DollarSign, Package, ArrowUpRight } from "lucide-react";
import { formatCurrency } from "../utils/currency";

interface DashboardStats {
    todaySales: number;
    todayCount: number;
    todayItems: number;
    lowStockCount: number;
    recentSales: any[];
    lowStockProducts: any[];
}



export default function DashboardPage({ user }: { user: any }) {
    const [stats, setStats] = useState<DashboardStats>({
        todaySales: 0,
        todayCount: 0,
        todayItems: 0,
        lowStockCount: 0,
        recentSales: [],
        lowStockProducts: []
    });
    const [_loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isOnline, setIsOnline] = useState(false);

    const fetchStats = async () => {
        if (!window.ipcRenderer) return;
        setLoading(true);
        try {
            const [salesData, productsData, connectionStatus] = await Promise.all([
                window.ipcRenderer.invoke('get-today-sales', user?.id).catch(() => ({ sales: [], total: 0, count: 0, items: 0 })),
                window.ipcRenderer.invoke('get-products', '').catch(() => []),
                window.ipcRenderer.invoke('get-connection-status').catch(() => false),
            ]);

            const lowStock = (productsData || []).filter((p: any) => p.stock > 0 && p.stock < p.minStock);

            setStats({
                todaySales: salesData?.total || 0,
                todayCount: salesData?.count || 0,
                todayItems: salesData?.items || 0,
                lowStockCount: lowStock.length,
                recentSales: (salesData?.sales || []).slice(0, 5),
                lowStockProducts: lowStock.slice(0, 6)
            });
            setIsOnline(connectionStatus);
        } catch (e) {
            console.error("Failed to fetch dashboard stats", e);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchStats();
        // Keep spin for a minimum of 600ms so user sees it
        setTimeout(() => setRefreshing(false), 600);
    };

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, []);

    const greeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "صباح الخير";
        if (hour < 17) return "مساء الخير";
        return "مساء الخير";
    };

    return (
        <div dir="rtl" className="h-full overflow-y-auto bg-background p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-black text-foreground">{greeting()}، {user.name} 👋</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        {new Date().toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted hover:border-border transition-all active:scale-[0.97] disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 transition-transform duration-500 ${refreshing ? 'animate-spin' : ''}`} />
                    <span>{refreshing ? 'جاري التحديث...' : 'تحديث'}</span>
                </button>
            </div>

            {/* Stats Cards */}
            <div className={`grid gap-4 mb-6 ${user?.role === 'CASHIER' ? 'grid-cols-3' : 'grid-cols-4'}`}>
                <div className="bg-card rounded-xl p-5 border border-border shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                            <DollarSign className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <div className="flex items-center gap-1 text-success text-xs font-bold bg-success/10 px-2 py-0.5 rounded-full">
                            <ArrowUpRight className="w-3 h-3" />
                            اليوم
                        </div>
                    </div>
                    <p className="text-2xl font-black text-foreground tabular-nums">{formatCurrency(stats.todaySales)}</p>
                    <p className="text-xs text-muted-foreground mt-1">إجمالي المبيعات</p>
                </div>

                <div className="bg-card rounded-xl p-5 border border-border shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-success to-success/80 rounded-xl flex items-center justify-center shadow-lg shadow-success/20">
                            <ShoppingBag className="w-5 h-5 text-success-foreground" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-foreground tabular-nums">{stats.todayCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">عدد الفواتير</p>
                </div>

                <div className="bg-card rounded-xl p-5 border border-border shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-600/20">
                            <Package className="w-5 h-5 text-white" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-foreground tabular-nums">{stats.todayItems}</p>
                    <p className="text-xs text-muted-foreground mt-1">منتجات مباعة</p>
                </div>

                {user?.role !== 'CASHIER' && (
                    <div className={`bg-card rounded-xl p-5 border shadow-sm hover:shadow-md transition-shadow ${stats.lowStockCount > 0 ? 'border-warning/40 bg-warning/5' : 'border-border'}`}>
                        <div className="flex items-center justify-between mb-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${stats.lowStockCount > 0
                                ? 'bg-gradient-to-br from-warning to-warning/80 shadow-warning/20'
                                : 'bg-gradient-to-br from-muted-foreground to-muted-foreground/80 shadow-muted/20'
                                }`}>
                                <AlertTriangle className="w-5 h-5 text-white" />
                            </div>
                            {stats.lowStockCount > 0 && (
                                <span className="text-warning text-xs font-bold bg-warning/20 px-2 py-0.5 rounded-full animate-pulse">
                                    تنبيه
                                </span>
                            )}
                        </div>
                        <p className="text-2xl font-black text-foreground tabular-nums">{stats.lowStockCount}</p>
                        <p className="text-xs text-muted-foreground mt-1">مخزون منخفض</p>
                    </div>
                )}
            </div>

            {/* Bottom Grid */}
            <div className={`grid gap-4 ${user?.role === 'CASHIER' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {/* Recent Sales */}
                <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-foreground flex items-center gap-2">
                            <Clock className="w-4 h-4 text-primary" />
                            آخر المبيعات
                        </h3>
                    </div>
                    {stats.recentSales.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">لا توجد مبيعات اليوم بعد</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {stats.recentSales.map((sale: any, i: number) => (
                                <div key={sale.id || i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary font-bold text-xs">
                                            #{i + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-foreground">
                                                {formatCurrency(sale.total || 0)}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground">
                                                {sale.createdAt ? new Date(sale.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1 items-end">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sale.paymentMethod === 'CREDIT'
                                            ? 'bg-warning/10 text-warning'
                                            : sale.paymentMethod === 'ZAIN_CASH'
                                                ? 'bg-purple-50 text-purple-600'
                                                : 'bg-success/10 text-success'
                                            }`}>
                                            {sale.paymentMethod === 'CREDIT' ? 'آجل' : sale.paymentMethod === 'ZAIN_CASH' ? 'زين كاش' : 'نقدي'}
                                        </span>
                                        {sale.returnsTotal > 0 && (
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sale.returnsTotal >= sale.total ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
                                                {sale.returnsTotal >= sale.total ? 'مرتجع كلي' : 'مرتجع جزئي'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {user?.role !== 'CASHIER' && (
                    <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-foreground flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-warning" />
                                تنبيهات المخزون
                            </h3>
                        </div>
                        {stats.lowStockProducts.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">جميع المنتجات بكميات كافية 👍</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {stats.lowStockProducts.map((product: any, i: number) => (
                                    <div key={product.id || i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-warning/10 rounded-lg flex items-center justify-center text-lg">
                                                💊
                                            </div>
                                            <p className="text-sm font-bold text-foreground truncate max-w-[200px]">{product.name}</p>
                                        </div>
                                        <span className={`text-xs font-black px-2.5 py-1 rounded-full ${product.stock <= 2 ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
                                            {product.stock} فقط
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Connection Status */}
            <div className={`mt-4 flex items-center justify-center gap-2 p-2 rounded-lg text-xs font-medium ${isOnline ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success' : 'bg-warning'} animate-pulse`}></span>
                {isOnline ? 'متصل بالخادم — المزامنة نشطة' : 'غير متصل — البيانات محفوظة محلياً'}
            </div>
        </div>
    );
}
