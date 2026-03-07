'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Search, Plus, Minus, Trash2, Banknote, CreditCard, BadgePercent, CheckCircle, Smartphone, AlertTriangle, X, LayoutGrid } from 'lucide-react';
import { getWebProducts, getWebPatients, processWebSale } from '@/app/lib/actions/pos-actions';

// Helpers
const formatIQD = (amount: number) => {
    return new Intl.NumberFormat('ar-IQ', {
        style: 'currency',
        currency: 'IQD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

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

    // Initial Data Fetch
    useEffect(() => {
        const loadInitialData = async () => {
            setLoading(true);
            const prods = await getWebProducts();
            setProducts(prods || []);
            setLoading(false);
        };
        loadInitialData();
    }, []);

    // Search Effects
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            setLoading(true);
            const prods = await getWebProducts(searchTerm);
            setProducts(prods || []);
            setLoading(false);
        }, 300);
        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm]);

    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (showPatientModal) {
                const pats = await getWebPatients(patientQuery);
                setPatients(pats || []);
            }
        }, 300);
        return () => clearTimeout(delayDebounceFn);
    }, [patientQuery, showPatientModal]);


    // Cart Handlers
    const addToCart = (product: any) => {
        if (product.stock <= 0) return;
        setCart(prev => {
            const existing = prev.find((p: any) => p.id === product.id);
            if (existing) {
                if (existing.quantity >= product.stock) return prev;
                return prev.map((p: any) => p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p);
            }
            return [...prev, { ...product, quantity: 1 }];
        });
    };

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

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter((item: any) => item.id !== id));
    };

    // Derived State
    const subTotal = cart.reduce((total: any, item: any) => total + (item.price * item.quantity), 0);
    const finalTotal = Math.max(0, subTotal - manualDiscount);

    // Checkout
    const handlePayment = async (method: 'CASH' | 'CREDIT') => {
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
            paymentMethod: method
        });

        setIsProcessing(false);

        if (result.success) {
            setShowSuccess(true);
            setCart([]);
            setManualDiscount(0);
            setSelectedPatient(null);

            // Re-fetch products to update stock
            const prods = await getWebProducts(searchTerm);
            setProducts(prods || []);

            setTimeout(() => {
                setShowSuccess(false);
            }, 2000);
        } else {
            alert(result.error || 'فشل في إتمام العملية');
        }
    };


    return (
        <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden" dir="rtl">

            {showSuccess && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
                    <div className="flex flex-col items-center gap-4 animate-successBounce">
                        <div className="w-28 h-28 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center shadow-2xl shadow-green-600/40">
                            <CheckCircle className="w-16 h-16 text-white" strokeWidth={2.5} />
                        </div>
                        <span className="text-2xl font-black text-white drop-shadow-lg">تم البيع بنجاح (ويب) ✓</span>
                    </div>
                </div>
            )}

            {/* ==== Patient Modal ==== */}
            {showPatientModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn">
                    <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full p-6 mx-4 animate-slideUp">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <span>👤</span> اختيار العميل
                            </h3>
                            <button onClick={() => setShowPatientModal(false)} className="bg-muted p-2 rounded-full hover:bg-muted/80 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="mb-6">
                            <div className="relative">
                                <Search className="absolute right-3 top-3 w-5 h-5 text-muted-foreground" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="ابحث بالاسم أو الهاتف..."
                                    className="w-full pr-10 pl-4 py-3 rounded-xl border border-border focus:ring-2 focus:ring-ring outline-none transition-all"
                                    value={patientQuery}
                                    onChange={(e) => setPatientQuery(e.target.value)}
                                />
                            </div>
                            <div className="mt-2 bg-card border border-border shadow-lg rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                                {patients.map((p: any) => (
                                    <button
                                        key={p.id}
                                        onClick={() => { setSelectedPatient(p); setShowPatientModal(false); }}
                                        className="w-full text-right px-4 py-3 hover:bg-primary/10 flex justify-between items-center border-b last:border-0 transition-colors"
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

            {/* ===== Right: Products Grid ===== */}
            <div className="flex w-[65%] flex-col border-l border-border/50 bg-muted/20 relative">
                {/* Header */}
                <div className="bg-card/90 backdrop-blur-md p-4 flex justify-between items-center shadow-sm border-b border-border z-10">
                    <div className="flex items-center gap-4">
                        <div className="w-11 h-11 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                            <LayoutGrid className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black text-foreground tracking-tight">نقطة البيع (نسخة الويب المجردة)</h1>
                            <p className="text-muted-foreground text-xs">{products.length} منتج متوفر</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowPatientModal(true)}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold transition-all border ${selectedPatient
                                ? 'bg-primary/10 text-primary border-primary/30 shadow-sm'
                                : 'bg-background text-muted-foreground border-border hover:bg-muted hover:border-border'
                                }`}
                        >
                            <span>👤</span>
                            <div>
                                <div className="text-xs">{selectedPatient ? selectedPatient.name : "تحديد عميل"}</div>
                                {selectedPatient && <span className="text-[10px] opacity-80">{selectedPatient.phone}</span>}
                            </div>
                            {selectedPatient && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedPatient(null); }}
                                    className="p-0.5 hover:bg-primary/10 rounded-full transition-colors mr-2"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="px-5 pt-4 pb-2 relative z-0">
                    <div className="relative group">
                        <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="ابحث عن دواء بالاسم أو الباركود..."
                            className="w-full rounded-xl border border-border bg-background py-3.5 pr-12 pl-4 text-base shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => { setSearchTerm(""); searchInputRef.current?.focus(); }}
                                className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto px-5 pb-5">
                    <div className="grid grid-cols-2 gap-3 pt-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                        {products.map((product: any) => {
                            const cartItem = cart.find((c: any) => c.id === product.id);
                            const isOutOfStock = product.stock <= 0;

                            return (
                                <button
                                    key={product.id}
                                    onClick={() => addToCart(product)}
                                    disabled={isOutOfStock}
                                    className={`group relative flex flex-col rounded-2xl p-3 transition-all duration-200 text-right ${isOutOfStock
                                        ? 'bg-muted opacity-50 cursor-not-allowed border border-transparent'
                                        : 'bg-card border border-border hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1'
                                        }`}
                                >
                                    {cartItem && (
                                        <div className="absolute -top-2.5 -left-2.5 w-7 h-7 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-xs font-black rounded-full flex items-center justify-center shadow-lg shadow-primary/40 z-10 animate-scaleIn ring-2 ring-background">
                                            {cartItem.quantity}
                                        </div>
                                    )}
                                    <div className="mb-2 h-12 w-full rounded-xl flex items-center justify-center text-xl bg-gradient-to-br from-primary/5 to-primary/10 transition-colors group-hover:from-primary/10 group-hover:to-primary/15">
                                        💊
                                    </div>
                                    <h3 className="line-clamp-1 font-bold text-foreground text-[13px] leading-snug">
                                        {product.name}
                                    </h3>
                                    <div className="flex w-full items-end justify-between mt-auto pt-2">
                                        <span className="font-black text-primary text-sm tabular-nums">
                                            {formatIQD(product.price)}
                                        </span>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${isOutOfStock ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
                                            {isOutOfStock ? 'نفد' : product.stock}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    {loading && (
                        <div className="flex h-full flex-col items-center justify-center text-muted-foreground py-20">
                            <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                        </div>
                    )}
                </div>
            </div>

            {/* ===== Left: Cart ===== */}
            <div className="flex w-[35%] flex-col bg-card border-r border-border shadow-xl z-20 h-full">
                <div className="flex items-center justify-between p-5 pb-3 bg-card">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-primary to-primary/80 p-2.5 rounded-xl shadow-lg shadow-primary/20">
                            <ShoppingCart className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-foreground">سلة المشتريات</h2>
                        </div>
                    </div>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mx-5 mb-1"></div>

                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
                    {cart.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                            <ShoppingCart className="h-10 w-10 opacity-20 mb-3" />
                            <p className="text-sm">السلة فارغة</p>
                        </div>
                    ) : (
                        cart.map((item: any) => (
                            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-foreground text-[13px] truncate">{item.name}</h4>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] text-muted-foreground">{formatIQD(item.price)} × {item.quantity}</span>
                                        <span className="text-[11px] text-primary font-black">{formatIQD(item.price * item.quantity)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <div className="flex items-center bg-muted rounded-lg p-0.5 border border-border">
                                        <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 flex items-center justify-center rounded-md bg-background text-success"><Plus className="h-3.5 w-3.5" /></button>
                                        <span className="w-8 text-center font-black text-sm tabular-nums">{item.quantity}</span>
                                        <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 flex items-center justify-center rounded-md bg-background text-destructive"><Minus className="h-3.5 w-3.5" /></button>
                                    </div>
                                    <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Totals & Payments */}
                <div className="bg-gradient-to-t from-muted/80 to-muted/30 p-4 border-t border-border">
                    <div className="bg-card rounded-xl p-3.5 shadow-sm border border-border mb-3 space-y-2">
                        <div className="flex justify-between text-muted-foreground text-sm">
                            <span>المجموع الفرعي</span>
                            <span className="font-bold tabular-nums">{formatIQD(subTotal)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <button onClick={() => setShowDiscountInput(!showDiscountInput)} className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium">
                                <BadgePercent className="w-4 h-4" />
                                <span>خصم مباشر</span>
                            </button>
                            {showDiscountInput ? (
                                <input
                                    type="number"
                                    className="w-20 px-2 py-0.5 rounded border border-border text-sm outline-none focus:border-primary"
                                    value={manualDiscount || ''}
                                    onChange={(e) => setManualDiscount(Number(e.target.value) || 0)}
                                    placeholder="0"
                                />
                            ) : (
                                <span className="text-muted-foreground text-xs">{manualDiscount > 0 ? `-${formatIQD(manualDiscount)}` : formatIQD(0)}</span>
                            )}
                        </div>
                        <div className="bg-gradient-to-l from-primary to-primary/80 rounded-xl p-3 flex justify-between items-center mt-2">
                            <span className="text-sm font-bold text-primary-foreground/80">الإجمالي النهائي</span>
                            <span className="text-xl font-black text-primary-foreground tracking-tight tabular-nums">{formatIQD(finalTotal)}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <button
                            disabled={cart.length === 0 || isProcessing}
                            onClick={() => handlePayment("CASH")}
                            className="bg-gradient-to-b from-success to-success/90 py-4 rounded-xl font-bold text-white shadow-lg shadow-success/20 disabled:opacity-40 flex flex-col items-center justify-center gap-1.5"
                        >
                            <Banknote className="w-6 h-6" />
                            <span>دفع نقدي</span>
                        </button>
                        <button
                            disabled={cart.length === 0 || isProcessing}
                            onClick={() => handlePayment("CREDIT")}
                            className="bg-gradient-to-b from-warning to-warning/90 py-4 rounded-xl font-bold text-white shadow-lg shadow-warning/20 disabled:opacity-40 flex flex-col items-center justify-center gap-1.5"
                        >
                            <CreditCard className="w-6 h-6" />
                            <span>بيع بالآجل</span>
                        </button>
                    </div>
                </div>

            </div>

        </div>
    );
}
