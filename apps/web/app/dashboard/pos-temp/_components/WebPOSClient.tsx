'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import Link from 'next/link';
import {
    ShoppingCart, Search, Plus, Minus, Trash2, Banknote, CreditCard, Building2,
    BadgePercent, CheckCircle, X, LayoutGrid, Clock, Globe, Eraser, ArrowRight,
} from 'lucide-react';
import { getWebProducts, getWebPatients, processWebSale } from '@/app/lib/actions/pos-actions';

// ─── Helpers (mirror desktop pos-utils) ──────────────────────────────────────
const formatIQD = (amount: number) =>
    new Intl.NumberFormat('en-US', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount || 0) + ' د.ع';

/**
 * Controlled number input that tolerates intermediate empty states while typing.
 * Mirrors the desktop POSCart QuantityInput.
 */
function QuantityInput({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
    const [display, setDisplay] = useState(String(value));
    useEffect(() => { setDisplay(String(value)); }, [value]);
    return (
        <input
            type="number"
            min="1"
            max={max}
            value={display}
            onChange={(e) => {
                setDisplay(e.target.value);
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= max) onChange(val);
            }}
            onBlur={() => {
                const val = parseInt(display, 10);
                if (isNaN(val) || val < 1 || val > max) setDisplay(String(value));
            }}
            className="w-10 text-center font-black text-foreground text-sm tabular-nums bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
    );
}

/**
 * Self-contained clock — keeps its 1s tick local so the heavy product grid
 * and cart do NOT re-render every second.
 */
function LiveClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    return (
        <div className="flex items-center gap-1.5 bg-white/15 text-white px-2.5 py-1 rounded-md font-bold">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono tabular-nums">
                {now.toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
            </span>
        </div>
    );
}

/**
 * Memoised product card. Only re-renders when its own `quantity` (in cart)
 * changes — so adding one item doesn't re-render the whole catalogue.
 */
const ProductCard = memo(function ProductCard({
    product,
    quantity,
    onAdd,
}: {
    product: any;
    quantity: number;
    onAdd: (p: any) => void;
}) {
    const stockLevel =
        product.stock > 20 ? 'high'
            : product.stock > 5 ? 'mid'
                : product.stock > 0 ? 'low'
                    : 'out';
    const isOutOfStock = product.stock <= 0;

    return (
        <button
            onClick={() => onAdd(product)}
            disabled={isOutOfStock}
            className={`group relative flex flex-col rounded-2xl p-3 transition-all duration-200 text-right ${isOutOfStock
                ? 'bg-muted opacity-50 cursor-not-allowed border border-transparent'
                : 'bg-card border border-border hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1 active:scale-[0.97]'
                }`}
        >
            {quantity > 0 && (
                <div className="absolute -top-2.5 -left-2.5 w-7 h-7 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-xs font-black rounded-full flex items-center justify-center shadow-lg shadow-primary/40 z-10 animate-scaleIn ring-2 ring-background">
                    {quantity}
                </div>
            )}
            <div
                className={`mb-2 h-12 w-full rounded-xl flex items-center justify-center text-xl transition-colors ${stockLevel === 'out'
                    ? 'bg-muted'
                    : stockLevel === 'low'
                        ? 'bg-gradient-to-br from-destructive/5 to-warning/5 group-hover:from-destructive/10 group-hover:to-warning/10'
                        : 'bg-gradient-to-br from-primary/5 to-primary/10 group-hover:from-primary/10 group-hover:to-primary/15'
                    }`}
            >
                💊
            </div>
            <h3 className="line-clamp-1 font-bold text-foreground text-[13px] leading-snug">
                {product.name}
            </h3>
            <div className="flex w-full items-end justify-between mt-auto pt-2">
                <span className="font-black text-primary text-sm tabular-nums">
                    {formatIQD(product.price)}
                </span>
                <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${stockLevel === 'high'
                        ? 'bg-success/10 text-success'
                        : stockLevel === 'mid'
                            ? 'bg-primary/10 text-primary'
                            : stockLevel === 'low'
                                ? 'bg-warning/10 text-warning'
                                : 'bg-destructive/10 text-destructive'
                        }`}
                >
                    {product.stock > 0 ? product.stock : 'نفد'}
                </span>
            </div>
        </button>
    );
});

export default function WebPOSClient() {
    const [products, setProducts] = useState<any[]>([]);
    const [patients, setPatients] = useState<any[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
    const [cart, setCart] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [patientQuery, setPatientQuery] = useState('');
    const [loading, setLoading] = useState(true);

    // UI State
    const [showPatientModal, setShowPatientModal] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [manualDiscount, setManualDiscount] = useState(0);
    const [showDiscountInput, setShowDiscountInput] = useState(false);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const didMountRef = useRef(false);

    // Initial Data Fetch — runs once immediately on mount.
    useEffect(() => {
        const loadInitialData = async () => {
            setLoading(true);
            const prods = await getWebProducts();
            setProducts(prods || []);
            setLoading(false);
        };
        loadInitialData();
    }, []);

    // Product search (debounced) — skips the initial mount so we don't refetch
    // the whole catalogue twice on first load.
    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true;
            return;
        }
        const delayDebounceFn = setTimeout(async () => {
            setLoading(true);
            const prods = await getWebProducts(searchTerm);
            setProducts(prods || []);
            setLoading(false);
        }, 300);
        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm]);

    // Patient search (debounced)
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (showPatientModal) {
                const pats = await getWebPatients(patientQuery);
                setPatients(pats || []);
            }
        }, 300);
        return () => clearTimeout(delayDebounceFn);
    }, [patientQuery, showPatientModal]);

    // ─── Cart Handlers ───────────────────────────────────────────────────────
    // Stable identity (functional updates only) so memoised ProductCards
    // never re-render just because this function was recreated.
    const addToCart = useCallback((product: any) => {
        if (product.stock <= 0) return;
        setCart(prev => {
            const existing = prev.find((p: any) => p.id === product.id);
            if (existing) {
                if (existing.quantity >= product.stock) return prev;
                return prev.map((p: any) => p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p);
            }
            return [...prev, { ...product, quantity: 1 }];
        });
    }, []);

    const updateQuantity = (id: string, delta: number) => {
        setCart(prev => prev.map((item: any) => {
            if (item.id === id) {
                const newQuantity = item.quantity + delta;
                if (newQuantity > 0 && newQuantity <= item.stock) {
                    return { ...item, quantity: newQuantity };
                }
            }
            return item;
        }));
    };

    const setItemQuantity = (id: string, qty: number) => {
        setCart(prev => prev.map((item: any) => item.id === id ? { ...item, quantity: qty } : item));
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter((item: any) => item.id !== id));
    };

    const clearCart = () => {
        setCart([]);
        setManualDiscount(0);
        setShowDiscountInput(false);
    };

    // ─── Derived State ─────────────────────────────────────────────────────────
    const subTotal = cart.reduce((total: any, item: any) => total + (item.price * item.quantity), 0);
    const cartCount = cart.reduce((a: number, c: any) => a + c.quantity, 0);
    const maxDiscount = subTotal;
    const finalTotal = Math.max(0, subTotal - manualDiscount);

    // O(1) quantity lookup per card — avoids a cart.find() inside every card render.
    const cartQtyById = useMemo(() => {
        const map = new Map<string, number>();
        cart.forEach((c: any) => map.set(c.id, c.quantity));
        return map;
    }, [cart]);

    // ─── Checkout ──────────────────────────────────────────────────────────────
    const handlePayment = async (method: 'CASH' | 'CARD' | 'CREDIT') => {
        if (cart.length === 0) return;
        if (method === 'CREDIT' && !selectedPatient) {
            alert('يجب اختيار مريض للبيع بالآجل');
            setShowPatientModal(true);
            return;
        }

        setIsProcessing(true);

        const result = await processWebSale({
            items: cart,
            total: finalTotal,
            patientId: selectedPatient?.id,
            discount: manualDiscount,
            pointsRedeemed: 0,
            paymentMethod: method,
        });

        setIsProcessing(false);

        if (result.success) {
            setShowSuccess(true);
            setCart([]);
            setManualDiscount(0);
            setShowDiscountInput(false);
            setSelectedPatient(null);

            // Re-fetch products to update stock
            const prods = await getWebProducts(searchTerm);
            setProducts(prods || []);

            setTimeout(() => setShowSuccess(false), 1800);
        } else {
            alert(result.error || 'فشل في إتمام العملية');
        }
    };

    return (
        <div
            dir="rtl"
            className="fixed inset-0 z-[60] flex bg-background text-foreground font-sans overflow-hidden"
        >
            {/* ===== نجاح البيع ===== */}
            {showSuccess && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
                    <div className="flex flex-col items-center gap-4 animate-successBounce">
                        <div className="w-28 h-28 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center shadow-2xl shadow-green-600/40">
                            <CheckCircle className="w-16 h-16 text-white" strokeWidth={2.5} />
                        </div>
                        <span className="text-2xl font-black text-white drop-shadow-lg">تم البيع بنجاح ✓</span>
                    </div>
                </div>
            )}

            {/* ===== مودال اختيار العميل ===== */}
            {showPatientModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn">
                    <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full p-6 mx-4 animate-slideUp">
                        <div className="flex justify-between items-center mb-6 border-b border-border pb-4">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <span>👤</span> اختيار العميل
                            </h3>
                            <button onClick={() => setShowPatientModal(false)} className="bg-muted p-2 rounded-full hover:bg-muted/80 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <div>
                            <div className="relative">
                                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="ابحث بالاسم أو الهاتف..."
                                    className="w-full pr-10 pl-4 py-3 rounded-xl border border-border bg-background outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                    value={patientQuery}
                                    onChange={(e) => setPatientQuery(e.target.value)}
                                />
                            </div>
                            <div className="mt-2 bg-card border border-border shadow-lg rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                                {patients.length === 0 ? (
                                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">لا يوجد عملاء</div>
                                ) : patients.map((p: any) => (
                                    <button
                                        key={p.id}
                                        onClick={() => { setSelectedPatient(p); setShowPatientModal(false); }}
                                        className="w-full text-right px-4 py-3 hover:bg-primary/10 flex justify-between items-center border-b border-border last:border-0 transition-colors"
                                    >
                                        <span className="font-bold">{p.name}</span>
                                        <span className="text-sm text-muted-foreground">{p.phone}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════ يمين: شبكة المنتجات (68%) ════════════ */}
            <div className="flex w-[68%] flex-col border-l border-border/50 bg-muted/20 relative">
                {/* شريط الحالة الذكي */}
                <div className="bg-primary text-white h-10 flex items-center justify-between px-3 text-xs font-medium shrink-0">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/dashboard"
                            className="group flex items-center gap-2 bg-white text-primary hover:bg-white/90 px-3 py-1.5 rounded-lg font-bold shadow-sm transition-all active:scale-[0.97]"
                        >
                            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                            <span>العودة إلى لوحة التحكم</span>
                        </Link>
                        <div className="w-px h-5 bg-white/25" />
                        <div className="flex items-center gap-1.5 bg-white/15 text-white px-2.5 py-1 rounded-md font-bold">
                            <Globe className="w-3.5 h-3.5" />
                            <span>نسخة الويب</span>
                        </div>
                    </div>
                    <LiveClock />
                </div>

                {/* الهيدر */}
                <div className="bg-card/90 backdrop-blur-md px-3 py-2 flex justify-between items-center shadow-sm border-b border-border z-10">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center shadow-md shadow-primary/20">
                            <LayoutGrid className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h1 className="text-sm font-black text-foreground tracking-tight leading-tight">نقطة البيع</h1>
                            <p className="text-muted-foreground text-[10px]">
                                {products.length} منتج • {cartCount} في السلة
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setShowPatientModal(true)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${selectedPatient
                                ? 'bg-primary/10 text-primary border-primary/30 shadow-sm'
                                : 'bg-background text-muted-foreground border-border hover:bg-muted hover:border-border'
                                }`}
                        >
                            <span className="text-sm">👤</span>
                            <div className="text-right">
                                <div className="text-[10px]">{selectedPatient ? selectedPatient.name : 'تحديد عميل'}</div>
                                {selectedPatient && (
                                    <div className="text-[9px] font-normal opacity-80 mt-0.5">{selectedPatient.phone}</div>
                                )}
                            </div>
                            {selectedPatient && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedPatient(null); }}
                                    className="p-0.5 hover:bg-primary/10 rounded-full transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </button>
                    </div>
                </div>

                {/* البحث */}
                <div className="px-5 pt-4 pb-2 relative z-0">
                    <div className="relative group">
                        <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            autoFocus
                            placeholder="ابحث عن دواء بالاسم أو الباركود..."
                            className="w-full rounded-xl border border-border bg-background py-3.5 pr-12 pl-4 text-base shadow-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-muted-foreground"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => { setSearchTerm(''); searchInputRef.current?.focus(); }}
                                className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {searchTerm && products.length > 0 && (
                    <div className="px-5 pb-1">
                        <span className="text-xs text-muted-foreground font-medium">
                            {products.length} نتيجة لـ "{searchTerm}"
                        </span>
                    </div>
                )}

                {/* شبكة المنتجات */}
                <div className="flex-1 overflow-y-auto px-5 pb-5">
                    <div className="grid grid-cols-2 gap-3 pt-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                        {products.map((product: any) => (
                            <ProductCard
                                key={product.id}
                                product={product}
                                quantity={cartQtyById.get(product.id) || 0}
                                onAdd={addToCart}
                            />
                        ))}
                    </div>

                    {products.length === 0 && !loading && (
                        <div className="flex h-full flex-col items-center justify-center text-muted-foreground py-20 animate-fadeIn">
                            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-5">
                                <Search className="h-8 w-8 opacity-25" />
                            </div>
                            <h3 className="text-lg font-bold text-muted-foreground mb-1">لا توجد نتائج</h3>
                            <p className="text-muted-foreground max-w-xs text-center text-sm">جرب كلمات مفتاحية أخرى</p>
                        </div>
                    )}

                    {loading && (
                        <div className="flex h-full flex-col items-center justify-center text-muted-foreground py-20">
                            <div className="w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="font-medium animate-pulse text-sm">جاري جلب البيانات...</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ════════════ يسار: السلة (32%) ════════════ */}
            <div className="flex w-[32%] flex-col bg-card border-r border-border shadow-xl z-20 h-full">
                {/* هيدر السلة */}
                <div className="flex items-center justify-between p-5 pb-3 bg-card">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-primary to-primary/80 p-2.5 rounded-xl shadow-lg shadow-primary/20">
                            <ShoppingCart className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-foreground">سلة المشتريات</h2>
                            <p className="text-[10px] text-muted-foreground font-medium">{new Date().toLocaleDateString('ar-IQ-u-nu-latn')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {cart.length > 0 && (
                            <button
                                onClick={clearCart}
                                className="p-1.5 rounded-lg bg-destructive/10 text-destructive/60 hover:bg-destructive/20 hover:text-destructive transition-all"
                                title="مسح السلة"
                            >
                                <Eraser className="w-3.5 h-3.5" />
                            </button>
                        )}
                        <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-black border border-primary/20">
                            {cart.length} عنصر
                        </span>
                    </div>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mx-5 mb-1"></div>

                {/* عناصر السلة */}
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
                    {cart.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                            <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-3 border-2 border-dashed border-border">
                                <ShoppingCart className="h-7 w-7 opacity-20" />
                            </div>
                            <p className="text-sm font-medium text-muted-foreground">السلة فارغة</p>
                            <p className="text-xs text-muted-foreground/60 mt-1 text-center max-w-[180px]">اضغط على المنتجات لإضافتها</p>
                        </div>
                    ) : (
                        cart.map((item: any, index: number) => (
                            <div
                                key={item.id}
                                className="group flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 transition-all animate-slideUp hover:border-primary/40"
                                style={{ animationDelay: `${index * 30}ms` }}
                            >
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 bg-gradient-to-br from-primary/5 to-primary/10">
                                    💊
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-foreground text-[13px] truncate">{item.name}</h4>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[11px] font-bold text-muted-foreground">{formatIQD(item.price)}</span>
                                        <span className="text-[11px] text-muted-foreground">× {item.quantity}</span>
                                        <span className="text-[11px] font-black text-primary">{formatIQD(item.price * item.quantity)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <div className="flex items-center bg-muted rounded-lg p-0.5 border border-border">
                                        <button
                                            onClick={() => updateQuantity(item.id, 1)}
                                            className="w-7 h-7 flex items-center justify-center rounded-md bg-background text-success shadow-sm hover:bg-success/10 transition-colors"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                        </button>
                                        <QuantityInput
                                            value={item.quantity}
                                            max={item.stock}
                                            onChange={(val) => setItemQuantity(item.id, val)}
                                        />
                                        <button
                                            onClick={() => updateQuantity(item.id, -1)}
                                            className="w-7 h-7 flex items-center justify-center rounded-md bg-background text-destructive shadow-sm hover:bg-destructive/10 transition-colors"
                                        >
                                            <Minus className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => removeFromCart(item.id)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* الفوتر / الإجماليات */}
                <div className="bg-gradient-to-t from-muted/80 to-muted/30 p-4 border-t border-border">
                    <div className="bg-card rounded-xl p-3.5 shadow-sm border border-border mb-3 space-y-2">
                        <div className="flex justify-between text-muted-foreground text-sm">
                            <span>عدد المواد</span>
                            <span className="font-bold tabular-nums">{cartCount}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground text-sm">
                            <span>المجموع الفرعي</span>
                            <span className="font-bold tabular-nums">{formatIQD(subTotal)}</span>
                        </div>

                        {/* الخصم */}
                        <div className="bg-muted/50 rounded-lg p-2 border border-border">
                            <div className="flex justify-between items-center text-sm">
                                <button
                                    onClick={() => setShowDiscountInput(v => !v)}
                                    className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors"
                                >
                                    <BadgePercent className="w-4 h-4" />
                                    <span>خصم إضافي</span>
                                </button>
                                {showDiscountInput ? (
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            min="0"
                                            autoFocus
                                            className="w-20 px-2 py-0.5 rounded border border-border bg-background text-foreground text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                            value={manualDiscount || ''}
                                            onChange={(e) => setManualDiscount(Math.min(Number(e.target.value) || 0, maxDiscount))}
                                            placeholder="0"
                                        />
                                        <span className="text-[10px] text-muted-foreground">د.ع</span>
                                        <button
                                            onClick={() => { setManualDiscount(0); setShowDiscountInput(false); }}
                                            className="text-muted-foreground hover:text-destructive"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-muted-foreground text-xs">{manualDiscount > 0 ? `-${formatIQD(manualDiscount)}` : formatIQD(0)}</span>
                                )}
                            </div>
                        </div>

                        {/* الإجمالي */}
                        <div className="bg-gradient-to-l from-primary to-primary/80 rounded-xl p-3 flex justify-between items-center">
                            <span className="text-sm font-bold text-primary-foreground/80">الإجمالي النهائي</span>
                            <span className="text-xl font-black text-primary-foreground tracking-tight tabular-nums">{formatIQD(finalTotal)}</span>
                        </div>
                    </div>

                    {/* أزرار الدفع — نقدي | بطاقة | آجل */}
                    <div className="flex gap-2">
                        <button
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-success py-2.5 px-3 font-bold text-white text-sm shadow-md shadow-success/25 transition-all hover:bg-success/90 hover:shadow-success/40 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={cart.length === 0 || isProcessing}
                            onClick={() => handlePayment('CASH')}
                            title="دفع نقدي"
                        >
                            <Banknote className="w-4 h-4 shrink-0" />
                            <span>نقدي</span>
                        </button>
                        <button
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 px-3 font-bold text-white text-sm shadow-md shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={cart.length === 0 || isProcessing}
                            onClick={() => handlePayment('CARD')}
                            title="دفع بالبطاقة"
                        >
                            <Building2 className="w-4 h-4 shrink-0" />
                            <span>بطاقة</span>
                        </button>
                        <button
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-warning py-2.5 px-3 font-bold text-white text-sm shadow-md shadow-warning/25 transition-all hover:bg-warning/90 hover:shadow-warning/40 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={cart.length === 0 || isProcessing}
                            onClick={() => handlePayment('CREDIT')}
                            title="بيع بالآجل"
                        >
                            <CreditCard className="w-4 h-4 shrink-0" />
                            <span>آجل</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
