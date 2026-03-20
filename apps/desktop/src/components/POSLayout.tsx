import { useState, useEffect, useRef, useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { CheckCircle } from "lucide-react";
import HotkeyHelpPanel from "./HotkeyHelpPanel";
import SaleReturnModal from "./SaleReturnModal";
import { generateInvoiceMessage, openWhatsApp } from "../utils/whatsapp";

import POSProductGrid from "./pos/POSProductGrid";
import POSCart from "./pos/POSCart";
import AlternativesModal from "./pos/AlternativesModal";
import PatientModal from "./pos/PatientModal";
import PrintPreviewModal from "./pos/PrintPreviewModal";
import ShiftModals from "./pos/ShiftModals";
import ZainCashModal from "./pos/ZainCashModal";
import { ipcInvoke, generateInvoiceNumber } from "./pos/pos-utils";
import type { Product, CartItem, Patient, ShiftSummary, DrugInteraction, SaleData } from "./pos/pos-types";

export default function POSLayout({ user }: { user: any }) {
    // ─── Product & Search ───────────────────────────────────────────────────
    const [searchTerm, setSearchTerm] = useState("");
    const [products, setProducts] = useState<Product[]>([]);
    const [quickSaleProducts, setQuickSaleProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // ─── Cart ────────────────────────────────────────────────────────────────
    const [cart, setCart] = useState<CartItem[]>([]);

    // ─── Patient & Pharmacovigilance ─────────────────────────────────────────
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [interactions, setInteractions] = useState<DrugInteraction[]>([]);
    const [allergyWarnings, setAllergyWarnings] = useState<string[]>([]);

    // ─── Discounts ───────────────────────────────────────────────────────────
    const [manualDiscount, setManualDiscount] = useState<number>(0);
    const [isRedeemingLoyalty, setIsRedeemingLoyalty] = useState(false);
    const [showDiscountInput, setShowDiscountInput] = useState(false);

    // ─── Shift ───────────────────────────────────────────────────────────────
    const [isShiftOpen, setIsShiftOpen] = useState(false);
    const [shiftStartTime, setShiftStartTime] = useState<Date | null>(null);
    const [shiftDuration, setShiftDuration] = useState("00:00:00");
    const [shiftSafeName, setShiftSafeName] = useState<string>("");
    const [showShiftOpenModal, setShowShiftOpenModal] = useState(false);
    const [showShiftCloseModal, setShowShiftCloseModal] = useState(false);
    const [startingCashAmount, setStartingCashAmount] = useState("");
    const [actualCashAmount, setActualCashAmount] = useState("");
    const [shiftSummary, setShiftSummary] = useState<ShiftSummary | null>(null);

    // ─── Cash Drop ───────────────────────────────────────────────────────────
    const [showCashDropModal, setShowCashDropModal] = useState(false);
    const [cashDropType, setCashDropType] = useState<"IN" | "OUT">("OUT");
    const [cashDropAmount, setCashDropAmount] = useState("");
    const [cashDropNote, setCashDropNote] = useState("");

    // ─── UI State ────────────────────────────────────────────────────────────
    const [isOnline, setIsOnline] = useState(false);
    const [isZainCashProcessing, setIsZainCashProcessing] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showHelpPanel, setShowHelpPanel] = useState(false);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [showPatientModal, setShowPatientModal] = useState(false);
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [lastSale, setLastSale] = useState<SaleData | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [companySettings, setCompanySettings] = useState<any>(null);

    // ─── Alternatives Modal ──────────────────────────────────────────────────
    const [showAlternativesModal, setShowAlternativesModal] = useState(false);
    const [alternatives, setAlternatives] = useState<Product[]>([]);
    const [outOfStockProduct, setOutOfStockProduct] = useState<Product | null>(null);

    // ─── Computed Discount Values ────────────────────────────────────────────
    const subTotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const loyaltyRedemptionValue = companySettings?.loyaltyRedemptionValue || 2.5;
    const loyaltyMinRedemption = companySettings?.loyaltyMinRedemption || 500;
    const maxLoyaltyAmount = Math.max(0, subTotal - manualDiscount);
    const patientPoints = selectedPatient?.loyaltyAccount?.totalPoints || 0;
    const maxPointsForBill = Math.floor(maxLoyaltyAmount / loyaltyRedemptionValue);
    const step = 100;
    const steppedPointsToRedeem = Math.floor(Math.min(patientPoints, maxPointsForBill) / step) * step;
    const pointsToRedeem = isRedeemingLoyalty ? steppedPointsToRedeem : 0;
    const loyaltyDiscountVal = Math.floor(pointsToRedeem * loyaltyRedemptionValue);
    const totalDiscount = manualDiscount + loyaltyDiscountVal;
    const finalTotal = Math.max(0, subTotal - totalDiscount);

    // ─── Effects ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isShiftOpen && shiftStartTime) {
            interval = setInterval(() => {
                const diff = new Date().getTime() - new Date(shiftStartTime).getTime();
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                setShiftDuration(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isShiftOpen, shiftStartTime]);

    useEffect(() => {
        setIsRedeemingLoyalty(false);
        if (cart.length === 0) setManualDiscount(0);
    }, [cart.length, selectedPatient?.id]);

    const checkShiftStatus = useCallback(async () => {
        if (window.ipcRenderer && user?.id) {
            try {
                const status = await ipcInvoke('get-shift-status', { userId: user.id });
                if (status.isWorking) {
                    setIsShiftOpen(true);
                    setShiftStartTime(status.startTime);
                    setShiftSafeName(status.safeName || "");
                } else {
                    setIsShiftOpen(false);
                    setShiftStartTime(null);
                    setShiftDuration("00:00:00");
                    setShiftSafeName("");
                }
            } catch (error) {
                console.error("Shift check failed", error);
            }
        }
    }, [user?.id]);

    useEffect(() => { checkShiftStatus(); }, [checkShiftStatus]);

    useEffect(() => {
        const checkConnection = async () => {
            if (window.ipcRenderer) {
                try {
                    const status = await ipcInvoke('get-connection-status');
                    setIsOnline(status);
                } catch { }
            }
        };
        const connectionInterval = setInterval(checkConnection, 10000);
        checkConnection();

        const fetchProducts = async () => {
            if (window.ipcRenderer) {
                setLoading(true);
                try {
                    const data = await ipcInvoke('get-products', { searchTerm, branchId: user?.branchId });
                    setProducts(data);
                } catch (error) {
                    console.error("فشل في جلب المنتجات", error);
                } finally {
                    setLoading(false);
                }
            }
        };
        const debounce = setTimeout(fetchProducts, 300);
        return () => { clearTimeout(debounce); clearInterval(connectionInterval); };
    }, [searchTerm]);

    useEffect(() => {
        if (window.ipcRenderer) {
            ipcInvoke('get-quick-sale-products', { branchId: user?.branchId })
                .then((data: any) => setQuickSaleProducts(data || []))
                .catch(console.error);
        }
    }, []);

    useEffect(() => {
        if (window.ipcRenderer) {
            ipcInvoke('get-settings')
                .then(setCompanySettings)
                .catch(console.error);
        }
    }, []);

    useEffect(() => {
        const check = async () => {
            if (!window.ipcRenderer || cart.length === 0) {
                setInteractions([]);
                setAllergyWarnings([]);
                return;
            }
            const scientificNames = cart.map(c => c.scientificName?.trim()).filter(Boolean) as string[];
            if (scientificNames.length === 0) return;
            try {
                if (scientificNames.length >= 2) {
                    const inters = await ipcInvoke('pos:check-interactions', scientificNames);
                    setInteractions(inters || []);
                } else {
                    setInteractions([]);
                }
                if (selectedPatient?.id) {
                    const allergies = await ipcInvoke('pos:check-allergies', { scientificNames, patientId: selectedPatient.id });
                    setAllergyWarnings(allergies || []);
                } else {
                    setAllergyWarnings([]);
                }
            } catch (error) {
                console.error("Pharmacovigilance check failed:", error);
            }
        };
        const t = setTimeout(check, 500);
        return () => clearTimeout(t);
    }, [cart, selectedPatient?.id]);

    // ─── Cart Handlers ───────────────────────────────────────────────────────
    const addToCart = async (product: Product, skipStockCheck = false) => {
        if (!skipStockCheck && product.stock <= 0) {
            if (window.ipcRenderer) {
                setLoading(true);
                try {
                    const alts = await ipcInvoke('get-alternatives', { drugId: product.id, branchId: user?.branchId });
                    if (alts && alts.length > 0) {
                        setAlternatives(alts);
                        setOutOfStockProduct(product);
                        setShowAlternativesModal(true);
                    } else {
                        alert("هذا المنتج غير متوفر ولا توجد بدائل متاحة حالياً.");
                    }
                } catch {
                    alert("هذا المنتج نفد من المخزون!");
                } finally {
                    setLoading(false);
                }
            } else {
                alert("هذا المنتج نفد من المخزون!");
            }
            return;
        }
        setCart((prev) => {
            const existing = prev.find((item) => item.id === product.id);
            if (existing) {
                if (existing.quantity >= product.stock) {
                    alert("لا يمكن إضافة المزيد، الكمية المطلوبة تتجاوز الرصيد المتوفر");
                    return prev;
                }
                return prev.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, { ...product, quantity: 1 }];
        });
    };

    const removeFromCart = (id: string) => setCart((prev) => prev.filter((item) => item.id !== id));

    const updateQuantity = (id: string, delta: number) => {
        setCart((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item;
                const newQty = Math.max(1, item.quantity + delta);
                const product = products.find(p => p.id === id) || item;
                if (newQty > product.stock) return item;
                return { ...item, quantity: newQty };
            })
        );
    };

    const setItemQuantity = (id: string, qty: number) => {
        setCart(prev => prev.map(c => c.id === id ? { ...c, quantity: qty } : c));
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && searchTerm.trim()) {
            const product = products.find(p => p.barcode === searchTerm.trim());
            if (product && product.stock > 0) {
                addToCart(product);
                setSearchTerm("");
            }
        }
    };

    // ─── Shift Handlers ──────────────────────────────────────────────────────
    const handleToggleShift = async () => {
        if (!window.ipcRenderer) return;
        if (isShiftOpen) {
            setLoading(true);
            try {
                const res = await ipcInvoke('get-shift-summary', { userId: user.id });
                if (res.success) {
                    setShiftSummary(res.summary);
                    setActualCashAmount("");
                    setShowShiftCloseModal(true);
                } else {
                    alert("فشل في جلب ملخص الوردية: " + res.message);
                }
            } catch (error: any) {
                alert("حدث خطأ: " + error.message);
            } finally {
                setLoading(false);
            }
        } else {
            setStartingCashAmount("");
            setShowShiftOpenModal(true);
        }
    };

    const confirmStartShift = async () => {
        setLoading(true);
        try {
            const res = await ipcInvoke('clock-in', { userId: user.id, branchId: user.branchId, startingCash: parseFloat(startingCashAmount || "0") });
            if (res.success) { setShowShiftOpenModal(false); checkShiftStatus(); }
            else alert("فشل بدء الوردية: " + res.message);
        } catch (error: any) {
            alert("حدث خطأ: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const confirmCloseShift = async () => {
        if (!actualCashAmount) { alert("يرجى إدخال النقد الفعلي في الصندوق"); return; }
        setLoading(true);
        try {
            const res = await ipcInvoke('clock-out', { userId: user.id, actualCash: parseFloat(actualCashAmount) });
            if (res.success) { setShowShiftCloseModal(false); checkShiftStatus(); alert("تم إنهاء الوردية بنجاح"); }
            else alert("فشل إنهاء الوردية: " + res.message);
        } catch (error: any) {
            alert("حدث خطأ: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const confirmCashDrop = async () => {
        if (!cashDropAmount || parseFloat(cashDropAmount) <= 0) { alert("يرجى إدخال مبلغ صحيح"); return; }
        if (!window.ipcRenderer) return;
        setLoading(true);
        try {
            const res = await ipcInvoke('process-cash-drop', { userId: user.id, amount: parseFloat(cashDropAmount), type: cashDropType, note: cashDropNote });
            if (res.success) {
                alert("تم تسجيل العملية بنجاح");
                setShowCashDropModal(false);
                setCashDropAmount("");
                setCashDropNote("");
            } else {
                alert("فشل تسجيل العملية: " + res.message);
            }
        } catch (error: any) {
            alert("حدث خطأ: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    // ─── Payment Handlers ────────────────────────────────────────────────────
    const handlePayment = async (paymentMethod: string = "CASH") => {
        if (!window.ipcRenderer) return;
        if (!isShiftOpen) { alert("يجب فتح وردية عمل أولاً قبل إجراء أي عملية بيع."); return; }

        const isCredit = paymentMethod === "CREDIT";
        if (isCredit && !selectedPatient) { setShowPatientModal(true); return; }

        const confirmMsg = isCredit
            ? `هل تريد بيع بالآجل بقيمة ${finalTotal}؟\n(العميل: ${selectedPatient?.name})\nسيضاف المبلغ إلى دفتر الديون`
            : `هل تريد إتمام عملية الدفع بقيمة ${finalTotal}؟${selectedPatient ? `\n(العميل: ${selectedPatient.name})` : ''}`;

        const hasHighInteraction = interactions.some(i => i.severity?.toUpperCase() === 'HIGH');
        if (hasHighInteraction) {
            const acknowledged = confirm(
                '⚠️ تحذير: يوجد تفاعل دوائي خطير بين الأدوية المحددة!\n\n' +
                interactions.filter(i => i.severity?.toUpperCase() === 'HIGH')
                    .map(i => `• ${i.drug1} + ${i.drug2}: ${i.description}`)
                    .join('\n') +
                '\n\nهل أنت متأكد من المتابعة رغم الخطر؟ (يجب الحصول على موافقة المريض)'
            );
            if (!acknowledged) return;
        }

        if (!confirm(confirmMsg)) return;

        const result = await ipcInvoke('process-sale', {
            items: cart, total: finalTotal, userId: user.id,
            patientId: selectedPatient?.id, discount: totalDiscount,
            pointsRedeemed: pointsToRedeem, paymentMethod
        });

        if (result.success) {
            const pointsEarned = (!isCredit && companySettings?.loyaltyEnabled && selectedPatient)
                ? Math.floor(finalTotal * (companySettings.loyaltyPointsPerDinar || 0.01))
                : 0;

            const invoiceData: SaleData = {
                items: cart.map(item => ({ name: item.name, quantity: item.quantity, price: item.price })),
                total: finalTotal,
                invoiceNumber: result.invoiceNumber || generateInvoiceNumber(),
                date: new Date(),
                patientName: selectedPatient?.name,
                patientPhone: selectedPatient?.phone,
                settings: companySettings,
                pointsEarned,
                discount: totalDiscount,
                pointsRedeemed: pointsToRedeem,
                isCredit,
            };

            setShowSuccess(true);
            setTimeout(() => { setShowSuccess(false); setLastSale(invoiceData); setShowPrintPreview(true); }, 1200);
            setCart([]); setSearchTerm(""); setSelectedPatient(null); setManualDiscount(0); setIsRedeemingLoyalty(false);
            const refreshed = await ipcInvoke('get-products', { searchTerm: "", branchId: user?.branchId });
            setProducts(refreshed);
        } else {
            alert("فشلت عملية البيع: " + result.error);
        }
    };

    const handleZainCashPayment = async () => {
        if (cart.length === 0) return;
        setLoading(true);
        try {
            const saleId = `POS-${Date.now()}`;
            const result = await ipcInvoke('initiate-zain-cash-payment', { amount: finalTotal, saleId });
            if (!result.success) { alert(result.error || "فشل في بدء عملية الدفع"); setLoading(false); return; }
            await ipcInvoke('open-external-url', result.redirectUrl);
            setIsZainCashProcessing(true);
            setLoading(false);

            const pollInterval = setInterval(async () => {
                try {
                    const statusResult = await ipcInvoke('check-zain-cash-status', { transactionId: result.transactionId });
                    if (statusResult.success) {
                        if (statusResult.status === 'success' || statusResult.status === 'completed') {
                            clearInterval(pollInterval);
                            setIsZainCashProcessing(false);
                            await handlePayment("ZAIN_CASH");
                        } else if (statusResult.status === 'failed' || statusResult.status === 'rejected') {
                            clearInterval(pollInterval);
                            setIsZainCashProcessing(false);
                            alert("فشلت عملية الدفع");
                        }
                    }
                } catch (err) { console.error("Polling error", err); }
            }, 3000);

            setTimeout(() => { clearInterval(pollInterval); if (isZainCashProcessing) { setIsZainCashProcessing(false); alert("انتهت مهلة الدفع"); } }, 5 * 60 * 1000);
        } catch (error) {
            console.error("Zain Cash Error:", error);
            alert("حدث خطأ غير متوقع");
            setLoading(false);
        }
    };

    const handleSync = useCallback(async () => {
        if (window.ipcRenderer) {
            try { await ipcInvoke('trigger-sync'); } catch (e) { console.error("Sync failed", e); }
        }
    }, []);

    const handleSeed = async () => {
        if (window.ipcRenderer) {
            const res = await ipcInvoke('seed-products');
            alert(res === "Seeded" ? "تم إضافة بيانات تجريبية" : "البيانات موجودة مسبقاً");
            const refreshed = await ipcInvoke('get-products', { searchTerm: "", branchId: user?.branchId });
            setProducts(refreshed);
        }
    };

    const handleWhatsApp = () => {
        if (!lastSale) return;
        let phone = lastSale.patientPhone || "";
        if (!phone) {
            const input = prompt("يرجى إدخال رقم هاتف العميل (مثال: 07xxxxxxxxx):");
            if (!input) return;
            phone = input;
        }
        const saleObj = {
            id: lastSale.invoiceNumber,
            createdAt: lastSale.date,
            total: lastSale.total,
            discount: lastSale.discount || 0,
            patient: { name: lastSale.patientName || "عميلنا الكريم" },
            items: lastSale.items.map(i => ({ drug: { tradeName: i.name }, quantity: i.quantity, price: i.price }))
        };
        try {
            const msg = generateInvoiceMessage(saleObj, companySettings?.name);
            openWhatsApp(phone, msg);
        } catch (err: any) {
            alert("خطأ في واتساب: " + err.message);
        }
    };

    // ─── Hotkeys ─────────────────────────────────────────────────────────────
    useHotkeys('f1', () => setShowHelpPanel(true), { preventDefault: true });
    useHotkeys('f2', () => searchInputRef.current?.focus(), { preventDefault: true });
    useHotkeys('f3', () => {
        setShowDiscountInput(true);
        setTimeout(() => document.getElementById('manual-discount-input')?.focus(), 50);
    }, { preventDefault: true });
    useHotkeys('f4', () => { if (cart.length > 0) handlePayment("CASH"); }, { preventDefault: true }, [cart, handlePayment]);
    useHotkeys('f5', () => {
        if (cart.length === 0) return;
        if (window.confirm('هل تريد إلغاء البيع ومسح السلة؟')) {
            setCart([]); setManualDiscount(0); setIsRedeemingLoyalty(false);
        }
    }, { preventDefault: true }, [cart]);
    useHotkeys('f6', () => setShowReturnModal(true), { preventDefault: true });
    useHotkeys('f8', () => { if (lastSale) setShowPrintPreview(true); }, { preventDefault: true }, [lastSale]);
    useHotkeys('escape', () => {
        if (showHelpPanel) setShowHelpPanel(false);
        else if (showPrintPreview) setShowPrintPreview(false);
        else if (showPatientModal) setShowPatientModal(false);
        else if (isZainCashProcessing) setIsZainCashProcessing(false);
        else if (showReturnModal) setShowReturnModal(false);
    }, { preventDefault: true }, [showHelpPanel, showPrintPreview, showPatientModal, isZainCashProcessing, showReturnModal]);

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div dir="rtl" className="flex h-screen max-h-screen overflow-hidden bg-background text-foreground font-sans">
            <HotkeyHelpPanel open={showHelpPanel} onClose={() => setShowHelpPanel(false)} />

            <AlternativesModal
                isOpen={showAlternativesModal}
                product={outOfStockProduct}
                alternatives={alternatives}
                onClose={() => { setShowAlternativesModal(false); setAlternatives([]); setOutOfStockProduct(null); }}
                onSelect={(alt) => { addToCart(alt, true); setShowAlternativesModal(false); setAlternatives([]); setOutOfStockProduct(null); }}
            />

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

            <PatientModal
                isOpen={showPatientModal}
                onClose={() => setShowPatientModal(false)}
                branchId={user?.branchId}
                onSelectPatient={(p) => { setSelectedPatient(p); setShowPatientModal(false); }}
            />

            <PrintPreviewModal
                isOpen={showPrintPreview && !!lastSale}
                sale={lastSale}
                onClose={() => setShowPrintPreview(false)}
                onWhatsApp={handleWhatsApp}
            />

            <POSProductGrid
                products={products}
                cart={cart}
                loading={loading}
                searchTerm={searchTerm}
                quickSaleProducts={quickSaleProducts}
                isOnline={isOnline}
                isShiftOpen={isShiftOpen}
                shiftDuration={shiftDuration}
                shiftSafeName={shiftSafeName}
                selectedPatient={selectedPatient}
                currentTime={currentTime}
                user={user}
                searchInputRef={searchInputRef}
                onSearchChange={setSearchTerm}
                onSearchKeyDown={handleSearchKeyDown}
                onAddToCart={addToCart}
                onToggleShift={handleToggleShift}
                onOpenCashDrop={() => setShowCashDropModal(true)}
                onOpenReturn={() => setShowReturnModal(true)}
                onOpenPatient={() => setShowPatientModal(true)}
                onClearPatient={() => setSelectedPatient(null)}
                onSync={handleSync}
                onSeed={handleSeed}
            />

            <POSCart
                cart={cart}
                interactions={interactions}
                allergyWarnings={allergyWarnings}
                companySettings={companySettings}
                selectedPatient={selectedPatient}
                manualDiscount={manualDiscount}
                isRedeemingLoyalty={isRedeemingLoyalty}
                showDiscountInput={showDiscountInput}
                subTotal={subTotal}
                finalTotal={finalTotal}
                loyaltyDiscountVal={loyaltyDiscountVal}
                pointsToRedeem={pointsToRedeem}
                loyaltyMinRedemption={loyaltyMinRedemption}
                maxPointsForBill={maxPointsForBill}
                onUpdateQuantity={updateQuantity}
                onRemoveFromCart={removeFromCart}
                onSetItemQuantity={setItemQuantity}
                onClearCart={() => { setCart([]); setManualDiscount(0); setIsRedeemingLoyalty(false); }}
                onDiscountToggle={() => setShowDiscountInput(v => !v)}
                onDiscountChange={setManualDiscount}
                onLoyaltyToggle={() => setIsRedeemingLoyalty(v => !v)}
                onPayment={handlePayment}
                onZainCash={handleZainCashPayment}
            />

            <ShiftModals
                showShiftOpen={showShiftOpenModal}
                startingCash={startingCashAmount}
                onStartingCashChange={setStartingCashAmount}
                onCloseShiftOpen={() => setShowShiftOpenModal(false)}
                onConfirmShiftOpen={confirmStartShift}
                showShiftClose={showShiftCloseModal}
                shiftSummary={shiftSummary}
                shiftDuration={shiftDuration}
                actualCash={actualCashAmount}
                onActualCashChange={setActualCashAmount}
                onCloseShiftClose={() => setShowShiftCloseModal(false)}
                onConfirmShiftClose={confirmCloseShift}
                showCashDrop={showCashDropModal}
                cashDropType={cashDropType}
                cashDropAmount={cashDropAmount}
                cashDropNote={cashDropNote}
                onCashDropTypeChange={setCashDropType}
                onCashDropAmountChange={setCashDropAmount}
                onCashDropNoteChange={setCashDropNote}
                onCloseCashDrop={() => setShowCashDropModal(false)}
                onConfirmCashDrop={confirmCashDrop}
                loading={loading}
            />

            <ZainCashModal
                isOpen={isZainCashProcessing}
                onClose={() => setIsZainCashProcessing(false)}
            />

            <SaleReturnModal
                isOpen={showReturnModal}
                onClose={() => setShowReturnModal(false)}
                user={user}
            />
        </div>
    );
}
