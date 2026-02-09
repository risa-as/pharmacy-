import { useState, useEffect, useRef } from "react";
import { Search, ShoppingCart, Trash2, Plus, Minus, Database, Wifi, WifiOff, CheckCircle, Printer, X } from "lucide-react";
import InvoicePrint from "./InvoicePrint";

interface Product {
    id: string;
    name: string;
    price: number;
    stock: number;
    barcode: string;
}

interface CartItem extends Product {
    quantity: number;
}

// تنسيق الدينار العراقي
const formatIQD = (amount: number) => {
    return new Intl.NumberFormat('ar-IQ', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount) + ' د.ع';
};

// توليد رقم فاتورة
const generateInvoiceNumber = () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${dateStr}-${random}`;
};

export default function POSLayout() {
    const [searchTerm, setSearchTerm] = useState("");
    const [cart, setCart] = useState<CartItem[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOnline] = useState(false);

    // حالة الطباعة
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [lastSale, setLastSale] = useState<{
        items: { name: string; quantity: number; price: number }[];
        total: number;
        invoiceNumber: string;
        date: Date;
    } | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchProducts = async () => {
            if (window.ipcRenderer) {
                setLoading(true);
                try {
                    const data = await window.ipcRenderer.invoke('get-products', searchTerm);
                    setProducts(data);
                } catch (error) {
                    console.error("فشل في جلب المنتجات", error);
                } finally {
                    setLoading(false);
                }
            }
        };

        const debounce = setTimeout(fetchProducts, 300);
        return () => clearTimeout(debounce);
    }, [searchTerm]);

    // مسح الباركود السريع - إضافة تلقائية للسلة
    const handleBarcodeSearch = (barcode: string) => {
        const product = products.find(p => p.barcode === barcode);
        if (product && product.stock > 0) {
            addToCart(product);
            setSearchTerm("");
        }
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && searchTerm.trim()) {
            handleBarcodeSearch(searchTerm.trim());
        }
    };

    const addToCart = (product: Product) => {
        setCart((prev) => {
            const existing = prev.find((item) => item.id === product.id);
            if (existing) {
                if (existing.quantity >= product.stock) {
                    alert("الكمية غير متوفرة في المخزون!");
                    return prev;
                }
                return prev.map((item) =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, { ...product, quantity: 1 }];
        });
    };

    const removeFromCart = (id: string) => {
        setCart((prev) => prev.filter((item) => item.id !== id));
    };

    const updateQuantity = (id: string, delta: number) => {
        setCart((prev) =>
            prev.map((item) => {
                if (item.id === id) {
                    const newQty = Math.max(1, item.quantity + delta);
                    const product = products.find(p => p.id === id) || item;
                    if (newQty > product.stock) {
                        alert("الكمية غير متوفرة في المخزون!");
                        return item;
                    }
                    return { ...item, quantity: newQty };
                }
                return item;
            })
        );
    };

    const handlePrint = () => {
        window.print();
    };

    const handlePayment = async () => {
        if (!window.ipcRenderer) return;

        if (confirm(`هل تريد إتمام عملية الدفع بقيمة ${formatIQD(total)}؟`)) {
            const result = await window.ipcRenderer.invoke('process-sale', {
                items: cart,
                total: total
            });

            if (result.success) {
                // حفظ بيانات الفاتورة للطباعة
                const invoiceData = {
                    items: cart.map(item => ({
                        name: item.name,
                        quantity: item.quantity,
                        price: item.price
                    })),
                    total: total,
                    invoiceNumber: generateInvoiceNumber(),
                    date: new Date()
                };

                setLastSale(invoiceData);
                setShowPrintPreview(true);
                setCart([]);
                setSearchTerm("");

                const refreshed = await window.ipcRenderer.invoke('get-products', "");
                setProducts(refreshed);
            } else {
                alert("فشلت عملية البيع: " + result.error);
            }
        }
    };

    const handleSeed = async () => {
        if (window.ipcRenderer) {
            const res = await window.ipcRenderer.invoke('seed-products');
            alert(res === "Seeded" ? "تم إضافة بيانات تجريبية" : "البيانات موجودة مسبقاً");
            const refreshed = await window.ipcRenderer.invoke('get-products', "");
            setProducts(refreshed);
        }
    };

    const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

    return (
        <div dir="rtl" className="flex h-screen max-h-screen overflow-hidden bg-gray-100 text-gray-900 font-sans">
            {/* نافذة معاينة الطباعة */}
            {showPrintPreview && lastSale && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 print:bg-white">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 print:shadow-none print:rounded-none print:max-w-none">
                        {/* هيدر النافذة - يختفي عند الطباعة */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-200 print:hidden">
                            <h3 className="text-lg font-bold text-gray-800">معاينة الفاتورة</h3>
                            <button
                                onClick={() => setShowPrintPreview(false)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        {/* محتوى الفاتورة */}
                        <div className="p-4 max-h-[60vh] overflow-y-auto print:max-h-none print:overflow-visible">
                            <InvoicePrint
                                ref={printRef}
                                items={lastSale.items}
                                total={lastSale.total}
                                invoiceNumber={lastSale.invoiceNumber}
                                date={lastSale.date}
                            />
                        </div>

                        {/* أزرار الإجراءات - تختفي عند الطباعة */}
                        <div className="flex gap-3 p-4 border-t border-gray-200 print:hidden">
                            <button
                                onClick={handlePrint}
                                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-colors"
                            >
                                <Printer className="w-5 h-5" />
                                طباعة الفاتورة
                            </button>
                            <button
                                onClick={() => setShowPrintPreview(false)}
                                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-bold transition-colors"
                            >
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* اليمين: شبكة المنتجات */}
            <div className="flex w-[65%] flex-col border-l border-gray-200 bg-white print:hidden">
                {/* الهيدر */}
                <div className="bg-blue-600 p-4 flex justify-between items-center shadow-md">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                            <span className="text-xl">💊</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">فاراماس - نقطة البيع</h1>
                            <p className="text-blue-100 text-xs">نظام إدارة الصيدليات</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-white ${isOnline ? 'bg-green-500/80' : 'bg-orange-500/80'}`}>
                            {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                            <span className="text-sm">{isOnline ? 'متصل' : 'غير متصل'}</span>
                        </div>
                        <button onClick={handleSeed} className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all text-white" title="إضافة بيانات تجريبية">
                            <Database className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* البحث */}
                <div className="p-4 bg-gray-50 border-b border-gray-200">
                    <div className="relative">
                        <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="ابحث بالاسم أو الباركود... (اضغط Enter للإضافة)"
                            className="w-full rounded-lg border border-gray-300 bg-white py-3 pr-10 pl-4 text-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            autoFocus
                        />
                    </div>
                </div>

                {/* شبكة المنتجات */}
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                        {products.map((product) => (
                            <button
                                key={product.id}
                                onClick={() => addToCart(product)}
                                disabled={product.stock <= 0}
                                className={`flex flex-col items-start justify-between rounded-xl border p-4 transition-all active:scale-95 ${product.stock <= 0
                                    ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                                    : 'border-gray-200 bg-white hover:border-blue-500 hover:bg-blue-50 hover:shadow-md'
                                    }`}
                            >
                                <div className="mb-3 h-16 w-full rounded-lg bg-gray-100 flex items-center justify-center text-3xl">
                                    💊
                                </div>
                                <div className="w-full space-y-2">
                                    <h3 className="line-clamp-2 font-bold text-gray-800 text-right leading-tight">
                                        {product.name}
                                    </h3>
                                    <div className="flex w-full items-center justify-between">
                                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${product.stock > 10
                                            ? 'bg-green-100 text-green-700'
                                            : product.stock > 0
                                                ? 'bg-yellow-100 text-yellow-700'
                                                : 'bg-red-100 text-red-700'
                                            }`}>
                                            {product.stock > 0 ? `${product.stock} متوفر` : 'نفذ'}
                                        </span>
                                        <span className="font-bold text-blue-600">
                                            {formatIQD(product.price || 0)}
                                        </span>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {products.length === 0 && !loading && (
                        <div className="flex h-full flex-col items-center justify-center text-gray-400 py-20">
                            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <Search className="h-8 w-8 opacity-40" />
                            </div>
                            <p className="text-lg mb-2">لا توجد منتجات</p>
                            <button onClick={handleSeed} className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors">
                                إضافة بيانات تجريبية
                            </button>
                        </div>
                    )}

                    {loading && (
                        <div className="flex h-full flex-col items-center justify-center text-gray-400 py-20">
                            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p>جاري التحميل...</p>
                        </div>
                    )}
                </div>
            </div>

            {/* اليسار: السلة */}
            <div className="flex w-[35%] flex-col bg-gray-50 print:hidden">
                {/* هيدر السلة */}
                <div className="flex items-center justify-between bg-white p-4 border-b border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <ShoppingCart className="h-5 w-5 text-blue-600" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800">الفاتورة</h2>
                    </div>
                    <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                        {cart.length} عنصر
                    </span>
                </div>

                {/* عناصر السلة */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {cart.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center text-gray-400">
                            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-3">
                                <ShoppingCart className="h-6 w-6 opacity-40" />
                            </div>
                            <p className="text-lg">السلة فارغة</p>
                            <p className="text-sm text-gray-400 mt-1">اضغط على منتج لإضافته</p>
                        </div>
                    ) : (
                        cart.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
                            >
                                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-xl">
                                    💊
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-gray-800 truncate">{item.name}</h4>
                                    <div className="text-sm text-blue-600 font-medium">
                                        {formatIQD(item.price)}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <div className="flex items-center rounded-lg border border-gray-300 bg-gray-50 overflow-hidden">
                                        <button
                                            onClick={() => updateQuantity(item.id, -1)}
                                            className="p-2 hover:bg-red-100 hover:text-red-600 transition-colors"
                                        >
                                            <Minus className="h-4 w-4" />
                                        </button>
                                        <span className="w-10 text-center font-bold text-gray-800">
                                            {item.quantity}
                                        </span>
                                        <button
                                            onClick={() => updateQuantity(item.id, 1)}
                                            className="p-2 hover:bg-green-100 hover:text-green-600 transition-colors"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => removeFromCart(item.id)}
                                        className="p-2 rounded-lg text-gray-400 hover:bg-red-100 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* الفوتر / الإجماليات */}
                <div className="border-t border-gray-200 bg-white p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                    <div className="space-y-3 mb-4">
                        <div className="flex justify-between text-gray-500">
                            <span>المجموع</span>
                            <span className="font-medium">{formatIQD(total)}</span>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div className="flex justify-between items-center">
                            <span className="text-xl font-bold text-gray-800">الإجمالي</span>
                            <span className="text-2xl font-bold text-blue-600">{formatIQD(total)}</span>
                        </div>
                    </div>

                    <button
                        className="w-full rounded-xl bg-blue-600 py-4 text-lg font-bold text-white shadow-lg transition-all hover:bg-blue-700 active:scale-[0.98] disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                        disabled={cart.length === 0}
                        onClick={handlePayment}
                    >
                        <CheckCircle className="w-5 h-5" />
                        إتمام الدفع
                    </button>
                </div>
            </div>
        </div>
    );
}
