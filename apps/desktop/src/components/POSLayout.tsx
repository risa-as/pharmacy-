import { useState, useEffect, useRef, useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { CheckCircle, Banknote, Clock } from "lucide-react";
import HotkeyHelpPanel from "./HotkeyHelpPanel";
import SaleReturnModal from "./SaleReturnModal";
import { generateInvoiceMessage, openWhatsApp } from "../utils/whatsapp";

import POSProductGrid from "./pos/POSProductGrid";
import POSCart from "./pos/POSCart";
import AlternativesModal from "./pos/AlternativesModal";
import PatientModal from "./pos/PatientModal";
import PrintPreviewModal from "./pos/PrintPreviewModal";
import ShiftModals from "./pos/ShiftModals";
import AppAlertModal from "./AppAlertModal";
import { showAlert, showConfirm } from "../lib/dialog";
import ZainCashModal from "./pos/ZainCashModal";
import { HeldInvoicesListModal } from "./pos/HeldInvoicesModal";
import { ipcInvoke, generateInvoiceNumber, loadHeldInvoices, saveHeldInvoices, formatIQD } from "./pos/pos-utils";
import type { Product, CartItem, Patient, ShiftSummary, DrugInteraction, SaleData, HeldInvoice } from "./pos/pos-types";

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
    const [showShiftRequiredModal, setShowShiftRequiredModal] = useState(false);
    const [showShiftClosedNotice, setShowShiftClosedNotice] = useState(false);
    const [showCreditConfirm, setShowCreditConfirm] = useState(false);
    const [isProcessingSale, setIsProcessingSale] = useState(false);
    const [startingCashAmount, setStartingCashAmount] = useState("");
    const [actualCashAmount, setActualCashAmount] = useState("");
    const [shiftSummary, setShiftSummary] = useState<ShiftSummary | null>(null);

    // ─── Cash Drop ───────────────────────────────────────────────────────────
    const [showCashDropModal, setShowCashDropModal] = useState(false);
    const [showGrid, setShowGrid] = useState(true);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const [showReceiptAfterSale, setShowReceiptAfterSale] = useState(true);

    // ─── Alternatives Modal ──────────────────────────────────────────────────
    const [showAlternativesModal, setShowAlternativesModal] = useState(false);
    const [alternatives, setAlternatives] = useState<Product[]>([]);
    const [outOfStockProduct, setOutOfStockProduct] = useState<Product | null>(null);

    // ─── Held Invoices (تعليق الفاتورة) ──────────────────────────────────────
    const [heldInvoices, setHeldInvoices] = useState<HeldInvoice[]>([]);
    const [showHeldListModal, setShowHeldListModal] = useState(false);

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

    // Connection check — independent of search
    useEffect(() => {
        const checkConnection = async () => {
            if (window.ipcRenderer) {
                try { setIsOnline(await ipcInvoke('get-connection-status')); } catch { }
            }
        };
        const connectionInterval = setInterval(checkConnection, 10000);
        checkConnection();
        return () => clearInterval(connectionInterval);
    }, []);

    // Initial product load — runs once on mount
    useEffect(() => {
        if (!window.ipcRenderer) return;
        setLoading(true);
        ipcInvoke('get-products', { searchTerm: "", branchId: user?.branchId })
            .then(setProducts)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user?.branchId]);

    // Load persisted held invoices for this user
    useEffect(() => {
        if (user?.id) setHeldInvoices(loadHeldInvoices(user.id));
    }, [user?.id]);

    // Text search — only fires for manual typing (>= 2 chars), NOT for barcode scans
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!searchTerm || searchTerm.length < 2) {
            setShowSearchResults(false);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            if (!window.ipcRenderer) return;
            setLoading(true);
            try {
                const data = await ipcInvoke('get-products', { searchTerm, branchId: user?.branchId });
                setProducts(data);
                setShowSearchResults(true);
            } catch (error) {
                console.error("فشل في جلب المنتجات", error);
            } finally {
                setLoading(false);
            }
        }, 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [searchTerm]);

    useEffect(() => {
        if (window.ipcRenderer) {
            ipcInvoke('get-quick-sale-products', { branchId: user?.branchId })
                .then((data: any) => setQuickSaleProducts((data || []).sort((a: any, b: any) => a.name.localeCompare(b.name, 'ar'))))
                .catch(console.error);
        }
    }, []);

    useEffect(() => {
        if (window.ipcRenderer) {
            ipcInvoke('get-settings')
                .then(setCompanySettings)
                .catch(console.error);
            ipcInvoke('get-pos-settings')
                .then((s: any) => { if (typeof s?.showReceiptAfterSale === 'boolean') setShowReceiptAfterSale(s.showReceiptAfterSale); })
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
                        void showAlert({ variant: "warning", title: "المنتج غير متوفر", message: "هذا المنتج غير متوفر ولا توجد بدائل متاحة حالياً." });
                    }
                } catch {
                    void showAlert({ variant: "warning", title: "نفد المخزون", message: "هذا المنتج نفد من المخزون." });
                } finally {
                    setLoading(false);
                }
            } else {
                void showAlert({ variant: "warning", title: "نفد المخزون", message: "هذا المنتج نفد من المخزون." });
            }
            return;
        }
        // Stock ceiling checked outside the setCart updater — updaters can run
        // during render, where triggering the dialog host would be a side effect.
        const existingItem = cart.find((item) => item.id === product.id);
        if (existingItem && existingItem.quantity >= product.stock) {
            void showAlert({ variant: "warning", title: "الكمية غير كافية", message: "لا يمكن إضافة المزيد، الكمية المطلوبة تتجاوز الرصيد المتوفر." });
            return;
        }
        setCart((prev) => {
            const existing = prev.find((item) => item.id === product.id);
            if (existing) {
                if (existing.quantity >= product.stock) return prev;
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

    const setItemPrice = (id: string, price: number) => {
        setCart(prev => prev.map(c => {
            if (c.id !== id) return c;
            // Store original price only on the first override
            const originalPrice = c.originalPrice ?? c.price;
            // If the user resets to original price, remove the override
            if (price === originalPrice) return { ...c, price, originalPrice: undefined };
            return { ...c, price, originalPrice };
        }));
    };

    const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && searchTerm.trim()) {
            // Cancel any pending get-products query so it doesn't race with the barcode lookup
            if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
            const term = searchTerm.trim();
            // Clear input immediately — before the async call so there's no grid flash
            setSearchTerm("");
            setShowSearchResults(false);
            // Fast path: direct barcode lookup (single product, indexed query < 50ms)
            const byBarcode = await ipcInvoke<any>('get-product-by-barcode', { barcode: term, branchId: user?.branchId });
            if (byBarcode) {
                addToCart(byBarcode);
                setProducts(prev => prev.some(p => p.id === byBarcode.id)
                    ? prev.map(p => p.id === byBarcode.id ? byBarcode : p)
                    : [...prev, byBarcode]
                );
                return;
            }
            // Fallback: search in already-loaded products list
            const product = products.find(p => p.barcode === term);
            if (product && product.stock > 0) addToCart(product);
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
                    void showAlert({ variant: "error", title: "فشل في جلب ملخص الوردية", message: res.message });
                }
            } catch (error: any) {
                void showAlert({ variant: "error", title: "حدث خطأ", message: error.message });
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
            else void showAlert({ variant: "error", title: "فشل بدء الوردية", message: res.message });
        } catch (error: any) {
            void showAlert({ variant: "error", title: "حدث خطأ", message: error.message });
        } finally {
            setLoading(false);
        }
    };

    const confirmCloseShift = async () => {
        if (!actualCashAmount) { void showAlert({ variant: "warning", title: "أدخل النقد الفعلي", message: "يرجى إدخال المبلغ الفعلي الموجود في الصندوق قبل إنهاء الوردية." }); return; }
        setLoading(true);
        try {
            const res = await ipcInvoke('clock-out', { userId: user.id, actualCash: parseFloat(actualCashAmount) });
            if (res.success) { setShowShiftCloseModal(false); checkShiftStatus(); setShowShiftClosedNotice(true); }
            else void showAlert({ variant: "error", title: "فشل إنهاء الوردية", message: res.message });
        } catch (error: any) {
            void showAlert({ variant: "error", title: "حدث خطأ", message: error.message });
        } finally {
            setLoading(false);
        }
    };

    const confirmCashDrop = async () => {
        if (!cashDropAmount || parseFloat(cashDropAmount) <= 0) { void showAlert({ variant: "warning", title: "مبلغ غير صحيح", message: "يرجى إدخال مبلغ صحيح." }); return; }
        if (!window.ipcRenderer) return;
        setLoading(true);
        try {
            const res = await ipcInvoke('process-cash-drop', { userId: user.id, amount: parseFloat(cashDropAmount), type: cashDropType, note: cashDropNote });
            if (res.success) {
                setShowCashDropModal(false);
                setCashDropAmount("");
                setCashDropNote("");
                void showAlert({ variant: "success", title: "تم تسجيل العملية بنجاح", autoCloseMs: 2000 });
            } else {
                void showAlert({ variant: "error", title: "فشل تسجيل العملية", message: res.message });
            }
        } catch (error: any) {
            void showAlert({ variant: "error", title: "حدث خطأ", message: error.message });
        } finally {
            setLoading(false);
        }
    };

    // ─── Payment Handlers ────────────────────────────────────────────────────
    const handlePayment = async (paymentMethod: string = "CASH") => {
        if (!window.ipcRenderer) return;
        if (isProcessingSale) return;
        if (!isShiftOpen) { setShowShiftRequiredModal(true); return; }

        const isCredit = paymentMethod === "CREDIT";
        if (isCredit && !selectedPatient) { setShowPatientModal(true); return; }

        const hasHighInteraction = interactions.some(i => i.severity?.toUpperCase() === 'HIGH');
        if (hasHighInteraction) {
            const details = interactions.filter(i => i.severity?.toUpperCase() === 'HIGH')
                .map(i => `• ${i.drug1} + ${i.drug2}: ${i.description}`)
                .join('\n');
            const acknowledged = await showConfirm({
                variant: "error",
                title: "تحذير: تفاعل دوائي خطير",
                message: `يوجد تفاعل دوائي خطير بين الأدوية المحددة:\n${details}\n\nيجب الحصول على موافقة المريض قبل المتابعة.`,
                actionLabel: "متابعة رغم الخطر",
            });
            if (!acknowledged) return;
        }

        // Credit writes debt onto the customer's ledger — confirm before recording.
        // Cash/card execute immediately: speed at the counter, and the returns
        // flow (F9) covers mistakes.
        if (isCredit) { setShowCreditConfirm(true); return; }
        await executeSale(paymentMethod);
    };

    const executeSale = async (paymentMethod: string) => {
        const isCredit = paymentMethod === "CREDIT";
        const hasPriceOverride = cart.some(item => item.originalPrice !== undefined);
        setIsProcessingSale(true);
        let result: any;
        try {
            result = await ipcInvoke('process-sale', {
                items: cart, total: finalTotal, userId: user.id,
                patientId: selectedPatient?.id, discount: totalDiscount,
                pointsRedeemed: pointsToRedeem, paymentMethod, hasPriceOverride
            });
        } finally {
            setIsProcessingSale(false);
        }

        if (result.success) {
            const pointsEarned = (!isCredit && companySettings?.loyaltyEnabled && selectedPatient)
                ? Math.floor(finalTotal * (companySettings.loyaltyPointsPerDinar || 0.01))
                : 0;

            const invoiceData: SaleData = {
                items: cart.map(item => ({ name: item.name, quantity: item.quantity, price: item.price, originalPrice: item.originalPrice })),
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

            setLastSale(invoiceData);
            if (showReceiptAfterSale) {
                // The receipt preview IS the confirmation — opening it directly
                // (no success splash first) saves the cashier ~1.2s per sale.
                setShowPrintPreview(true);
            } else {
                setShowSuccess(true);
                setTimeout(() => setShowSuccess(false), 1800);
            }
            // Deduct sold quantities from local products state — no full reload needed
            setProducts(prev => prev.map(p => {
                const soldItem = cart.find(c => c.id === p.id);
                return soldItem ? { ...p, stock: Math.max(0, p.stock - soldItem.quantity) } : p;
            }));
            setCart([]); setSearchTerm(""); setSelectedPatient(null); setManualDiscount(0); setIsRedeemingLoyalty(false);
        } else {
            void showAlert({ variant: "error", title: "فشلت عملية البيع", message: result.error });
        }
    };


    // ─── Held Invoices Handlers ──────────────────────────────────────────────
    const persistHeld = useCallback((list: HeldInvoice[]) => {
        setHeldInvoices(list);
        if (user?.id) saveHeldInvoices(user.id, list);
    }, [user?.id]);

    // يبني لقطة من السلة الحالية (دون مسحها)
    const buildSnapshot = useCallback((label: string): HeldInvoice => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label,
        createdAt: new Date().toISOString(),
        cart,
        patient: selectedPatient,
        manualDiscount,
        isRedeemingLoyalty,
        subTotal,
        itemCount: cart.reduce((a, c) => a + c.quantity, 0),
    }), [cart, selectedPatient, manualDiscount, isRedeemingLoyalty, subTotal]);

    const clearCartState = () => {
        setCart([]); setSearchTerm(""); setSelectedPatient(null);
        setManualDiscount(0); setIsRedeemingLoyalty(false); setShowDiscountInput(false);
    };

    // تعليق فوري دون مودال — يستخدم اسم العميل المحدد كتسمية تلقائية إن وُجد
    const holdInvoice = () => {
        if (cart.length === 0) return;
        persistHeld([buildSnapshot(selectedPatient?.name || ""), ...heldInvoices]);
        clearCartState();
    };

    const recallInvoice = (id: string) => {
        const invoice = heldInvoices.find(h => h.id === id);
        if (!invoice) return;
        // لا تفقد السلة الحالية: علّقها تلقائياً إن كانت غير فارغة
        let list = heldInvoices.filter(h => h.id !== id);
        if (cart.length > 0) {
            list = [buildSnapshot(selectedPatient?.name || "سلة محفوظة تلقائياً"), ...list];
        }
        persistHeld(list);
        setCart(invoice.cart);
        setSelectedPatient(invoice.patient);
        setManualDiscount(invoice.manualDiscount);
        setIsRedeemingLoyalty(invoice.isRedeemingLoyalty);
        setSearchTerm("");
        setShowHeldListModal(false);
    };

    const deleteHeld = async (id: string) => {
        const ok = await showConfirm({ variant: "error", title: "حذف الفاتورة المعلّقة", message: "هل تريد حذف هذه الفاتورة المعلّقة نهائياً؟", actionLabel: "حذف" });
        if (!ok) return;
        persistHeld(heldInvoices.filter(h => h.id !== id));
    };

    const handleSync = useCallback(async () => {
        if (window.ipcRenderer) {
            try { await ipcInvoke('trigger-sync'); } catch (e) { console.error("Sync failed", e); }
        }
    }, []);

    const handleSeed = async () => {
        if (window.ipcRenderer) {
            const res = await ipcInvoke('seed-products');
            const seeded = res === "Seeded";
            void showAlert({ variant: seeded ? "success" : "warning", title: seeded ? "تم إضافة بيانات تجريبية" : "البيانات موجودة مسبقاً", autoCloseMs: 2000 });
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
            void showAlert({ variant: "error", title: "خطأ في واتساب", message: err.message });
        }
    };

    // ─── Refocus after modals close ──────────────────────────────────────────
    // When any modal closes: trigger OS blur/focus cycle via IPC first (fixes
    // Chromium internal keyboard focus), then DOM-focus the search input after
    // enough time for the OS cycle to complete (~150ms).
    const anyModalOpen = showSuccess || showPrintPreview || showPatientModal
        || showReturnModal || showHelpPanel || isZainCashProcessing
        || showShiftOpenModal || showShiftCloseModal || showCashDropModal
        || showAlternativesModal || showHeldListModal
        || showShiftRequiredModal || showShiftClosedNotice || showCreditConfirm;
    const prevModalOpen = useRef(false);

    useEffect(() => {
        if (prevModalOpen.current && !anyModalOpen && !loading) {
            window.ipcRenderer?.send('refocus-window');
            const t = setTimeout(() => searchInputRef.current?.focus(), 200);
            return () => clearTimeout(t);
        }
        prevModalOpen.current = anyModalOpen;
    }, [anyModalOpen, loading]);

    // Auto-focus the opening-balance field so the cashier can type immediately.
    useEffect(() => {
        if (showShiftOpenModal) {
            const t = setTimeout(() => document.getElementById('shift-starting-cash-input')?.focus(), 100);
            return () => clearTimeout(t);
        }
    }, [showShiftOpenModal]);

    // ─── Hotkeys ─────────────────────────────────────────────────────────────
    useHotkeys('f1', () => setShowHelpPanel(true), { preventDefault: true });
    useHotkeys('f2', () => searchInputRef.current?.focus(), { preventDefault: true });
    useHotkeys('f3', () => {
        setShowDiscountInput(true);
        setTimeout(() => document.getElementById('manual-discount-input')?.focus(), 50);
    }, { preventDefault: true });
    useHotkeys('f4', () => { if (cart.length > 0) handlePayment("CASH"); }, { preventDefault: true }, [cart, handlePayment]);
    useHotkeys('f5', () => { if (cart.length > 0) handlePayment("CARD"); }, { preventDefault: true }, [cart, handlePayment]);
    useHotkeys('f6', () => { if (cart.length > 0) handlePayment("CREDIT"); }, { preventDefault: true }, [cart, handlePayment]);
    useHotkeys('f7', () => {
        if (cart.length === 0) return;
        void showConfirm({ variant: "warning", title: "إلغاء البيع", message: "هل تريد إلغاء البيع ومسح السلة؟", actionLabel: "مسح السلة" }).then((ok) => {
            if (ok) { setCart([]); setManualDiscount(0); setIsRedeemingLoyalty(false); }
        });
    }, { preventDefault: true }, [cart]);
    useHotkeys('f8', () => { if (lastSale) setShowPrintPreview(true); }, { preventDefault: true }, [lastSale]);
    useHotkeys('f9', () => setShowReturnModal(true), { preventDefault: true });
    useHotkeys('f10', () => holdInvoice(), { preventDefault: true }, [cart, heldInvoices, selectedPatient]);
    useHotkeys('f11', () => setShowHeldListModal(true), { preventDefault: true });
    useHotkeys('escape', () => {
        if (showHelpPanel) setShowHelpPanel(false);
        else if (showHeldListModal) setShowHeldListModal(false);
        else if (showPrintPreview) setShowPrintPreview(false);
        else if (showPatientModal) setShowPatientModal(false);
        else if (isZainCashProcessing) setIsZainCashProcessing(false);
        else if (showReturnModal) setShowReturnModal(false);
        else if (showShiftRequiredModal) setShowShiftRequiredModal(false);
        else if (showShiftClosedNotice) setShowShiftClosedNotice(false);
        else if (showCreditConfirm) setShowCreditConfirm(false);
    }, { preventDefault: true }, [showHelpPanel, showHeldListModal, showPrintPreview, showPatientModal, isZainCashProcessing, showReturnModal, showShiftRequiredModal, showShiftClosedNotice, showCreditConfirm]);

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div dir="rtl" className="flex h-screen max-h-screen overflow-hidden bg-background text-foreground font-sans">
            <HotkeyHelpPanel open={showHelpPanel} onClose={() => setShowHelpPanel(false)} />

            <AppAlertModal
                open={showShiftRequiredModal}
                variant="warning"
                icon={<Clock className="w-7 h-7" strokeWidth={2.25} />}
                title="الوردية غير مفتوحة"
                message="يجب فتح وردية عمل أولاً قبل إجراء أي عملية بيع."
                actionLabel="بدء الوردية"
                onAction={() => {
                    setShowShiftRequiredModal(false);
                    setStartingCashAmount("");
                    setShowShiftOpenModal(true);
                }}
                onClose={() => setShowShiftRequiredModal(false)}
            />

            <AppAlertModal
                open={showShiftClosedNotice}
                variant="success"
                title="تم إنهاء الوردية بنجاح"
                message="تم تسجيل ملخص الوردية وإغلاق الصندوق."
                autoCloseMs={2500}
                onClose={() => setShowShiftClosedNotice(false)}
            />

            <AppAlertModal
                open={showCreditConfirm}
                variant="warning"
                icon={<Banknote className="w-7 h-7" strokeWidth={2.25} />}
                title="تأكيد البيع بالآجل"
                message={`بيع بالآجل بقيمة ${formatIQD(finalTotal)} للعميل «${selectedPatient?.name || ""}» — سيضاف المبلغ إلى دفتر الديون.`}
                actionLabel="تأكيد البيع"
                onAction={() => { setShowCreditConfirm(false); void executeSale("CREDIT"); }}
                onClose={() => setShowCreditConfirm(false)}
            />

            <AlternativesModal
                isOpen={showAlternativesModal}
                product={outOfStockProduct}
                alternatives={alternatives}
                onClose={() => { setShowAlternativesModal(false); setAlternatives([]); setOutOfStockProduct(null); }}
                onSelect={(alt) => { addToCart(alt, true); setShowAlternativesModal(false); setAlternatives([]); setOutOfStockProduct(null); }}
            />

            {showSuccess && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn"
                    onClick={() => setShowSuccess(false)}
                >
                    <div className="bg-card rounded-2xl w-full max-w-sm mx-4 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="h-1.5 bg-success" />
                        <div className="p-8 flex flex-col items-center text-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center animate-successBounce">
                                <CheckCircle className="w-11 h-11 text-success" strokeWidth={2.25} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-foreground">تم البيع بنجاح</h2>
                                {lastSale?.invoiceNumber && (
                                    <p className="text-sm text-muted-foreground mt-1 tabular-nums">فاتورة رقم {lastSale.invoiceNumber}</p>
                                )}
                            </div>
                            {lastSale && (
                                <div className="w-full bg-success/10 rounded-xl py-3 px-4 flex items-center justify-between">
                                    <span className="text-sm font-medium text-success">الإجمالي</span>
                                    <span className="text-xl font-black text-success tabular-nums">{formatIQD(lastSale.total)}</span>
                                </div>
                            )}
                        </div>
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
                onOpenHeld={() => setShowHeldListModal(true)}
                heldCount={heldInvoices.length}
                onOpenPatient={() => setShowPatientModal(true)}
                onClearPatient={() => setSelectedPatient(null)}
                onSync={handleSync}
                onSeed={handleSeed}
                showGrid={showGrid}
                showSearchResults={showSearchResults}
                onToggleGrid={() => setShowGrid(v => !v)}
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
                onSetItemPrice={setItemPrice}
                onClearCart={() => { setCart([]); setManualDiscount(0); setIsRedeemingLoyalty(false); }}
                onHold={holdInvoice}
                onDiscountToggle={() => setShowDiscountInput(v => !v)}
                onDiscountChange={setManualDiscount}
                onLoyaltyToggle={() => setIsRedeemingLoyalty(v => !v)}
                onPayment={handlePayment}
                isProcessingSale={isProcessingSale}
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

            <HeldInvoicesListModal
                isOpen={showHeldListModal}
                invoices={heldInvoices}
                onRecall={recallInvoice}
                onDelete={deleteHeld}
                onClose={() => setShowHeldListModal(false)}
            />
        </div>
    );
}
