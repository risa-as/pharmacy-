import { useState, useEffect, useRef, useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import HotkeyHelpPanel from "./HotkeyHelpPanel";
import { Search, ShoppingCart, Trash2, Plus, Minus, Database, Wifi, WifiOff, CheckCircle, Printer, X, LayoutGrid, TicketPercent, Gift, Clock, CreditCard, Banknote, Smartphone, AlertTriangle, Eraser, Undo2 } from "lucide-react";
import SyncHealthDashboard from "./SyncHealthDashboard";
import InvoicePrint from "./InvoicePrint";
import SaleReturnModal from "./SaleReturnModal";
import { generateInvoiceMessage, openWhatsApp } from "../utils/whatsapp";

interface Product {
    id: string;
    name: string;
    scientificName?: string;
    origin?: string;
    price: number;
    costPrice?: number;
    stock: number;
    barcode: string;
    nearestExpiry?: string | null;
}

// حساب حالة الصلاحية
function getExpiryStatus(expiryDate: string | null | undefined): { label: string; color: string; urgent: boolean } | null {
    if (!expiryDate) return null;
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return { label: 'منتهي', color: 'bg-destructive text-destructive-foreground', urgent: true };
    if (diffDays <= 90) return { label: `${diffDays} يوم`, color: 'bg-destructive/10 text-destructive', urgent: true };
    if (diffDays <= 180) return { label: `${Math.ceil(diffDays / 30)} شهر`, color: 'bg-warning/10 text-warning', urgent: false };
    return null;
}

interface CartItem extends Product {
    quantity: number;
}

// تنسيق الدينار العراقي
function formatIQD(amount: number) {
    return new Intl.NumberFormat("ar-IQ", {
        style: "decimal",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount) + " د.ع";
}

// توليد رقم فاتورة
function generateInvoiceNumber() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

export default function POSLayout({ user }: { user: any }) {
    const [searchTerm, setSearchTerm] = useState("");
    const [cart, setCart] = useState<CartItem[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOnline, setIsOnline] = useState(false);
    const [isZainCashProcessing, setIsZainCashProcessing] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Shift State
    const [isShiftOpen, setIsShiftOpen] = useState(false);
    const [shiftStartTime, setShiftStartTime] = useState<Date | null>(null);
    const [shiftDuration, setShiftDuration] = useState("00:00:00");
    const [shiftSafeName, setShiftSafeName] = useState<string>("");

    // Shift Modals State
    const [showShiftOpenModal, setShowShiftOpenModal] = useState(false);
    const [showShiftCloseModal, setShowShiftCloseModal] = useState(false);
    const [availableSafes, setAvailableSafes] = useState<any[]>([]);
    const [selectedSafeId, setSelectedSafeId] = useState("");
    const [startingCashAmount, setStartingCashAmount] = useState("");
    const [actualCashAmount, setActualCashAmount] = useState("");
    const [shiftSummary, setShiftSummary] = useState<any>(null);

    // Return Modal State
    const [showReturnModal, setShowReturnModal] = useState(false);

    // Keyboard shortcuts help panel
    const [showHelpPanel, setShowHelpPanel] = useState(false);

    // Cash Drop Modal State
    const [showCashDropModal, setShowCashDropModal] = useState(false);
    const [cashDropType, setCashDropType] = useState<"IN" | "OUT">("OUT");
    const [cashDropAmount, setCashDropAmount] = useState("");
    const [cashDropNote, setCashDropNote] = useState("");

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isShiftOpen && shiftStartTime) {
            interval = setInterval(() => {
                const now = new Date();
                const diff = now.getTime() - new Date(shiftStartTime).getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                setShiftDuration(
                    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
                );
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isShiftOpen, shiftStartTime]);

    const checkShiftStatus = useCallback(async () => {
        if (window.ipcRenderer && user?.id) {
            try {
                const status = await window.ipcRenderer.invoke('get-shift-status', { userId: user.id });
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

    useEffect(() => {
        checkShiftStatus();
    }, [checkShiftStatus]);

    const handleToggleShift = async () => {
        if (!window.ipcRenderer) return;

        if (isShiftOpen) {
            // Fetch summary first before showing close modal
            setLoading(true);
            try {
                const res = await window.ipcRenderer.invoke('get-shift-summary', { userId: user.id });
                if (res.success) {
                    setShiftSummary(res.summary);
                    setActualCashAmount(""); // Clear previous
                    setShowShiftCloseModal(true);
                } else {
                    alert("فشل في جلب ملخص الوردية: " + res.message);
                }
            } catch (error: any) {
                alert("حدث خطأ المزامنة: " + error.message);
            } finally {
                setLoading(false);
            }
        } else {
            // Fetch safes before showing open modal
            setLoading(true);
            try {
                const safes = await window.ipcRenderer.invoke('get-safes', { branchId: user.branchId });
                setAvailableSafes(safes);
                if (safes.length > 0) setSelectedSafeId(safes[0].id);
                setStartingCashAmount("");
                setShowShiftOpenModal(true);
            } catch (error: any) {
                alert("فشل في جلب الصناديق: " + error.message);
            } finally {
                setLoading(false);
            }
        }
    };

    const confirmStartShift = async () => {
        if (!selectedSafeId) {
            alert("يرجى اختيار صندوق");
            return;
        }
        setLoading(true);
        try {
            const res = await window.ipcRenderer.invoke('clock-in', {
                userId: user.id,
                branchId: user.branchId,
                safeId: selectedSafeId,
                startingCash: parseFloat(startingCashAmount || "0")
            });
            if (res.success) {
                setShowShiftOpenModal(false);
                checkShiftStatus();
            } else {
                alert("فشل بدء الوردية: " + res.message);
            }
        } catch (error: any) {
            alert("حدث خطأ: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const confirmCloseShift = async () => {
        if (!actualCashAmount) {
            alert("يرجى إدخال النقد الفعلي في الصندوق");
            return;
        }
        setLoading(true);
        try {
            const res = await window.ipcRenderer.invoke('clock-out', {
                userId: user.id,
                actualCash: parseFloat(actualCashAmount)
            });
            if (res.success) {
                setShowShiftCloseModal(false);
                checkShiftStatus();
                alert("تم إنهاء الوردية بنجاح");
            } else {
                alert("فشل إنهاء الوردية: " + res.message);
            }
        } catch (error: any) {
            alert("حدث خطأ: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const confirmCashDrop = async () => {
        if (!cashDropAmount || parseFloat(cashDropAmount) <= 0) {
            alert("يرجى إدخال مبلغ صحيح");
            return;
        }

        // We need an IPC handler for this
        if (!window.ipcRenderer) return;
        setLoading(true);
        try {
            const res = await window.ipcRenderer.invoke('process-cash-drop', {
                userId: user.id,
                amount: parseFloat(cashDropAmount),
                type: cashDropType,
                note: cashDropNote
            });
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

    // حالة الطباعة
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [lastSale, setLastSale] = useState<{
        items: { name: string; quantity: number; price: number }[];
        total: number;
        invoiceNumber: string;
        date: Date;
        patientName?: string;
        patientPhone?: string; // Add phone
        settings?: any;
        pointsEarned?: number;
    } | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    // ساعة حية
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const checkConnection = async () => {
            if (window.ipcRenderer) {
                try {
                    const status = await window.ipcRenderer.invoke('get-connection-status');
                    setIsOnline(status);
                } catch (e) {
                    console.error("Connection check failed", e);
                }
            }
        };

        const connectionInterval = setInterval(checkConnection, 10000);
        checkConnection();

        const fetchProducts = async () => {
            if (window.ipcRenderer) {
                setLoading(true);
                try {
                    const data = await window.ipcRenderer.invoke('get-products', { searchTerm, branchId: user?.branchId });
                    setProducts(data);
                } catch (error) {
                    console.error("فشل في جلب المنتجات", error);
                } finally {
                    setLoading(false);
                }
            }
        };

        const debounce = setTimeout(fetchProducts, 300);
        return () => {
            clearTimeout(debounce);
            clearInterval(connectionInterval);
        };
    }, [searchTerm]);

    // مسح الباركود السريع
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

    // حالة المريض
    const [selectedPatient, setSelectedPatient] = useState<{
        id: string;
        name: string;
        phone: string;
        loyaltyAccount?: {
            totalPoints: number;
            tier: string;
        }
    } | null>(null);

    // ==== Pharmacovigilance (Smart Alerts) ====
    const [interactions, setInteractions] = useState<{ drug1: string; drug2: string; severity: string; description: string }[]>([]);
    const [allergyWarnings, setAllergyWarnings] = useState<string[]>([]);

    useEffect(() => {
        const checkPharmacovigilance = async () => {
            if (!window.ipcRenderer || cart.length === 0) {
                setInteractions([]);
                setAllergyWarnings([]);
                return;
            }

            const scientificNames = cart
                .map(c => c.scientificName?.trim())
                .filter(Boolean) as string[];

            if (scientificNames.length === 0) return;

            try {
                // 1. Check Drug Interactions
                if (scientificNames.length >= 2) {
                    const inters = await window.ipcRenderer.invoke('pos:check-interactions', scientificNames);
                    setInteractions(inters || []);
                } else {
                    setInteractions([]);
                }

                // 2. Check Patient Allergies
                if (selectedPatient?.id) {
                    const allergies = await window.ipcRenderer.invoke('pos:check-allergies', {
                        scientificNames,
                        patientId: selectedPatient.id
                    });
                    setAllergyWarnings(allergies || []);
                } else {
                    setAllergyWarnings([]);
                }
            } catch (error) {
                console.error("Pharmacovigilance check failed:", error);
            }
        };

        const debounceCheck = setTimeout(checkPharmacovigilance, 500);
        return () => clearTimeout(debounceCheck);
    }, [cart, selectedPatient?.id]);

    // Alternatives State
    const [showAlternativesModal, setShowAlternativesModal] = useState(false);
    const [alternatives, setAlternatives] = useState<Product[]>([]);
    const [outOfStockProduct, setOutOfStockProduct] = useState<Product | null>(null);
    const addToCart = async (product: Product, skipStockCheck = false) => {
        // 1. Stock Check (Skip if adding alternative specifically)
        if (!skipStockCheck && product.stock <= 0) {
            if (window.ipcRenderer) {
                setLoading(true);
                try {
                    const alts = await window.ipcRenderer.invoke('get-alternatives', {
                        drugId: product.id,
                        branchId: user?.branchId
                    });

                    if (alts && alts.length > 0) {
                        setAlternatives(alts);
                        setOutOfStockProduct(product);
                        setShowAlternativesModal(true);
                        setLoading(false);
                        return; // Stop here, let user choose
                    } else {
                        alert("هذا المنتج غير متوفر ولا توجد بدائل متاحة حالياً.");
                        setLoading(false);
                        return;
                    }
                } catch (e) {
                    console.error("Failed to fetch alternatives", e);
                    setLoading(false);
                }
            }
            // If offline or error, just warn
            alert("هذا المنتج نفد من المخزون!");
            return;
        }

        setCart((prev) => {
            const existing = prev.find((item) => item.id === product.id);
            if (existing) {
                if (existing.quantity >= product.stock) {
                    alert("لا يمكن إضافة المزيد، الكمية المطلوبة تتجاوز الرصيد المتوفر");
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
                    if (newQty > product.stock) return item;
                    return { ...item, quantity: newQty };
                }
                return item;
            })
        );
    };

    const [showPatientModal, setShowPatientModal] = useState(false);
    const [patientQuery, setPatientQuery] = useState("");
    const [patientResults, setPatientResults] = useState<any[]>([]);
    const [newPatient, setNewPatient] = useState({ name: "", phone: "", gender: "male" });

    // States for Discounts
    const [manualDiscount, setManualDiscount] = useState<number>(0);
    const [isRedeemingLoyalty, setIsRedeemingLoyalty] = useState(false);
    const [showDiscountInput, setShowDiscountInput] = useState(false);

    useEffect(() => {
        if (showPatientModal) {
            if (patientQuery.length <= 1) {
                const fetchRecents = async () => {
                    if (window.ipcRenderer) {
                        const recents = await window.ipcRenderer.invoke('get-patients', { branchId: user?.branchId });
                        setPatientResults(recents);
                    }
                };
                fetchRecents();
            } else {
                const search = async () => {
                    if (window.ipcRenderer) {
                        const results = await window.ipcRenderer.invoke('search-patients', patientQuery, user?.branchId);
                        setPatientResults(results);
                    }
                };
                const debounce = setTimeout(search, 300);
                return () => clearTimeout(debounce);
            }
        }
    }, [patientQuery, showPatientModal]);

    const handleCreatePatient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (window.ipcRenderer) {
            const res = await window.ipcRenderer.invoke('create-patient', { ...newPatient, branchId: user?.branchId });
            if (res.success) {
                setSelectedPatient(res.patient);
                setShowPatientModal(false);
                setNewPatient({ name: "", phone: "", gender: "male" });
            } else {
                alert(res.error);
            }
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const subTotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

    const [companySettings, setCompanySettings] = useState<any>(null);

    useEffect(() => {
        const fetchSettings = async () => {
            if (window.ipcRenderer) {
                try {
                    const settings = await window.ipcRenderer.invoke('get-settings');
                    setCompanySettings(settings);
                } catch (error) {
                    console.error("Failed to fetch settings:", error);
                }
            }
        };
        fetchSettings();
    }, []);

    // Loyalty & Discount Calculations
    const loyaltyRedemptionValue = companySettings?.loyaltyRedemptionValue || 2.5;
    const loyaltyMinRedemption = companySettings?.loyaltyMinRedemption || 500;
    const maxLoyaltyAmount = Math.max(0, subTotal - manualDiscount);
    const patientPoints = selectedPatient?.loyaltyAccount?.totalPoints || 0;
    const maxPointsForBill = Math.floor(maxLoyaltyAmount / loyaltyRedemptionValue);
    const rawPointsToRedeem = Math.min(patientPoints, maxPointsForBill);
    const step = 100;
    const steppedPointsToRedeem = Math.floor(rawPointsToRedeem / step) * step;
    const pointsToRedeem = isRedeemingLoyalty ? steppedPointsToRedeem : 0;
    const loyaltyDiscountVal = Math.floor(pointsToRedeem * loyaltyRedemptionValue);
    const totalDiscount = manualDiscount + loyaltyDiscountVal;
    const finalTotal = Math.max(0, subTotal - totalDiscount);

    useEffect(() => {
        setIsRedeemingLoyalty(false);
        if (cart.length === 0) setManualDiscount(0);
    }, [cart.length, selectedPatient?.id]);

    const handleZainCashPayment = async () => {
        if (cart.length === 0) return;
        setLoading(true);
        try {
            const saleId = `POS-${Date.now()}`;
            // @ts-ignore
            const result = await window.ipcRenderer.invoke('initiate-zain-cash-payment', {
                amount: finalTotal,
                saleId
            });

            if (!result.success) {
                alert(result.error || "فشل في بدء عملية الدفع");
                setLoading(false);
                return;
            }

            // @ts-ignore
            await window.ipcRenderer.invoke('open-external-url', result.redirectUrl);

            setIsZainCashProcessing(true);
            setLoading(false);

            const transactionId = result.transactionId;
            const pollInterval = setInterval(async () => {
                try {
                    // @ts-ignore
                    const statusResult = await window.ipcRenderer.invoke('check-zain-cash-status', { transactionId });
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
                } catch (err) {
                    console.error("Polling error", err);
                }
            }, 3000);

            setTimeout(() => {
                clearInterval(pollInterval);
                if (isZainCashProcessing) {
                    setIsZainCashProcessing(false);
                    alert("انتهت مهلة الدفع");
                }
            }, 5 * 60 * 1000);

        } catch (error) {
            console.error("Zain Cash Error:", error);
            alert("حدث خطأ غير متوقع");
            setLoading(false);
        }
    };

    const handlePayment = async (paymentMethod: string = "CASH") => {
        if (!window.ipcRenderer) return;

        // Enforce shift: sales cannot proceed without an open shift
        if (!isShiftOpen) {
            alert("يجب فتح وردية عمل أولاً قبل إجراء أي عملية بيع.");
            return;
        }

        const isCredit = paymentMethod === "CREDIT";

        if (isCredit && !selectedPatient) {
            setShowPatientModal(true);
            return;
        }

        const confirmMsg = isCredit
            ? `هل تريد بيع بالآجل بقيمة ${formatIQD(finalTotal)}؟\n(العميل: ${selectedPatient?.name})\nسيضاف المبلغ إلى دفتر الديون`
            : `هل تريد إتمام عملية الدفع بقيمة ${formatIQD(finalTotal)}؟ ${selectedPatient ? `\n(العميل: ${selectedPatient.name})` : ''}`;

        if (confirm(confirmMsg)) {
            const result = await window.ipcRenderer.invoke('process-sale', {
                items: cart,
                total: finalTotal,
                userId: user.id,
                patientId: selectedPatient?.id,
                discount: totalDiscount,
                pointsRedeemed: pointsToRedeem,
                paymentMethod
            });

            if (result.success) {
                const pointsEarned = (!isCredit && companySettings?.loyaltyEnabled && selectedPatient)
                    ? Math.floor(finalTotal * (companySettings.loyaltyPointsPerDinar || 0.01))
                    : 0;

                const invoiceData = {
                    items: cart.map(item => ({
                        name: item.name,
                        quantity: item.quantity,
                        price: item.price
                    })),
                    total: finalTotal,
                    invoiceNumber: generateInvoiceNumber(),
                    date: new Date(),
                    patientName: selectedPatient?.name,
                    patientPhone: selectedPatient?.phone, // Add phone persistence
                    settings: companySettings,
                    pointsEarned: pointsEarned,
                    discount: totalDiscount,
                    pointsRedeemed: pointsToRedeem,
                    isCredit
                };

                // Show success animation
                setShowSuccess(true);
                setTimeout(() => {
                    setShowSuccess(false);
                    setLastSale(invoiceData);
                    setShowPrintPreview(true);
                }, 1200);

                setCart([]);
                setSearchTerm("");
                setSelectedPatient(null);
                setManualDiscount(0);
                setIsRedeemingLoyalty(false);

                const refreshed = await window.ipcRenderer.invoke('get-products', { searchTerm: "", branchId: user?.branchId });
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
            const refreshed = await window.ipcRenderer.invoke('get-products', { searchTerm: "", branchId: user?.branchId });
            setProducts(refreshed);
        }
    };

    const handleSync = useCallback(async () => {
        if (window.ipcRenderer) {
            try {
                await window.ipcRenderer.invoke('trigger-sync');
            } catch (e) {
                console.error("Sync failed", e);
            }
        }
    }, []);

    // ===== اختصارات لوحة المفاتيح (react-hotkeys-hook) =====
    // F1 — فتح لوحة الاختصارات
    useHotkeys('f1', () => setShowHelpPanel(true), { preventDefault: true });

    // F2 — التركيز على حقل البحث
    useHotkeys('f2', () => searchInputRef.current?.focus(), { preventDefault: true });

    // F3 — تفعيل حقل الخصم
    useHotkeys('f3', () => {
        setShowDiscountInput(true);
        setTimeout(() => {
            const input = document.getElementById('manual-discount-input');
            if (input) input.focus();
        }, 50);
    }, { preventDefault: true });

    // F4 — الدفع النقدي (الإجراء الرئيسي للتسوية)
    useHotkeys('f4', () => {
        if (cart.length > 0) handlePayment("CASH");
    }, { preventDefault: true }, [cart, handlePayment]);

    // F5 — إلغاء البيع (مع تأكيد)
    useHotkeys('f5', () => {
        if (cart.length === 0) return;
        if (window.confirm('هل تريد إلغاء البيع ومسح السلة؟')) {
            setCart([]);
            setManualDiscount(0);
            setIsRedeemingLoyalty(false);
        }
    }, { preventDefault: true }, [cart]);

    // F6 — فتح نافذة الإرجاع
    useHotkeys('f6', () => setShowReturnModal(true), { preventDefault: true });

    // F8 — طباعة آخر فاتورة
    useHotkeys('f8', () => {
        if (lastSale) setShowPrintPreview(true);
    }, { preventDefault: true }, [lastSale]);

    // Escape — إغلاق أي نافذة مفتوحة
    useHotkeys('escape', () => {
        if (showHelpPanel) setShowHelpPanel(false);
        else if (showPrintPreview) setShowPrintPreview(false);
        else if (showPatientModal) setShowPatientModal(false);
        else if (isZainCashProcessing) setIsZainCashProcessing(false);
        else if (showReturnModal) setShowReturnModal(false);
    }, { preventDefault: true }, [showHelpPanel, showPrintPreview, showPatientModal, isZainCashProcessing, showReturnModal]);

    return (
        <div dir="rtl" className="flex h-screen max-h-screen overflow-hidden bg-background text-foreground font-sans">

            {/* ===== لوحة الاختصارات (F1) ===== */}
            <HotkeyHelpPanel open={showHelpPanel} onClose={() => setShowHelpPanel(false)} />

            {/* ===== نافذة بدائل الأدوية (Alternatives Modal) ===== */}
            {showAlternativesModal && outOfStockProduct && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full p-6 mx-4 animate-scaleIn border border-border">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mb-3 text-warning">
                                <Database className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-foreground">المنتج غير متوفر!</h3>
                            <p className="text-muted-foreground mt-1">
                                الكمية من
                                <span className="font-bold text-foreground mx-1">{outOfStockProduct.name}</span>
                                نفدت. إليك البدائل المتاحة بنفس الاسم العلمي ({outOfStockProduct.scientificName}):
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 max-h-60 overflow-y-auto p-2 mb-6 bg-muted/50 rounded-xl border border-border">
                            {alternatives.map((alt) => (
                                <div key={alt.id} className="flex justify-between items-center bg-card p-3 rounded-lg shadow-sm border border-border hover:border-primary/40 transition-colors">
                                    <div>
                                        <div className="font-bold text-foreground">{alt.name}</div>
                                        <div className="text-xs text-muted-foreground flex gap-2">
                                            <span>{alt.origin}</span>
                                            <span>•</span>
                                            <span>{alt.barcode}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <div className="font-bold text-primary">{formatIQD(alt.price)}</div>
                                            <div className="text-xs text-success font-medium">الرصيد: {alt.stock}</div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                addToCart(alt, true); // skipStockCheck=true because we know it has stock
                                                setShowAlternativesModal(false);
                                                setAlternatives([]);
                                                setOutOfStockProduct(null);
                                            }}
                                            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg font-bold text-sm transition-colors"
                                        >
                                            اختيار
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => {
                                setShowAlternativesModal(false);
                                setAlternatives([]);
                                setOutOfStockProduct(null);
                            }}
                            className="w-full bg-muted hover:bg-muted/80 text-foreground font-bold py-3 rounded-xl transition-all"
                        >
                            إلغاء
                        </button>
                    </div>
                </div>
            )}

            {/* ===== أنيميشن نجاح البيع ===== */}
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

            {/* ===== نافذة اختيار المريض ===== */}
            {showPatientModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn">
                    <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full p-6 mx-4 animate-slideUp">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <span>👤</span> ملف المريض
                            </h3>
                            <button onClick={() => setShowPatientModal(false)} className="bg-muted p-2 rounded-full hover:bg-muted/80 transition-colors"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-foreground mb-2">بحث عن مريض مسجل</label>
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
                            {patientResults.length > 0 ? (
                                <div className="mt-2 bg-card border border-border shadow-lg rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                                    {patientResults.map(p => (
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
                            ) : (
                                patientQuery.length > 1 && (
                                    <div className="mt-2 p-3 text-center text-muted-foreground bg-muted/50 rounded-xl text-sm">
                                        لا توجد نتائج مطابقة، يمكنك إضافة مريض جديد بالأسفل
                                    </div>
                                )
                            )}
                        </div>

                        <div className="flex items-center gap-4 mb-4">
                            <div className="h-px bg-border flex-1"></div>
                            <span className="text-muted-foreground text-sm">أو إضافة مريض جديد</span>
                            <div className="h-px bg-border flex-1"></div>
                        </div>

                        <form onSubmit={handleCreatePatient} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">الاسم الكامل</label>
                                <input
                                    required type="text"
                                    className="w-full px-4 py-2 rounded-xl border border-border focus:ring-2 focus:ring-ring outline-none transition-all"
                                    value={newPatient.name}
                                    onChange={e => setNewPatient({ ...newPatient, name: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">رقم الهاتف</label>
                                    <input
                                        required type="tel"
                                        className="w-full px-4 py-2 rounded-xl border border-border focus:ring-2 focus:ring-ring outline-none transition-all"
                                        value={newPatient.phone}
                                        onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">الجنس</label>
                                    <select
                                        className="w-full px-4 py-2 rounded-xl border border-border focus:ring-2 focus:ring-ring outline-none bg-background transition-all"
                                        value={newPatient.gender}
                                        onChange={e => setNewPatient({ ...newPatient, gender: e.target.value })}
                                    >
                                        <option value="male">ذكر</option>
                                        <option value="female">أنثى</option>
                                    </select>
                                </div>
                            </div>
                            <button type="submit" className="w-full bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]">
                                حفظ واختيار المريض
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ===== نافذة معاينة الطباعة ===== */}
            {showPrintPreview && lastSale && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 print:bg-white animate-fadeIn">
                    <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full mx-4 print:shadow-none print:rounded-none print:max-w-none border border-border overflow-hidden animate-slideUp">
                        <div className="flex items-center justify-between p-4 border-b border-border print:hidden bg-muted/30">
                            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <Printer className="w-5 h-5 text-primary" />
                                معاينة الفاتورة
                                <kbd className="text-[9px] font-mono opacity-50 border border-border px-1.5 py-0.5 rounded bg-background">F8</kbd>
                            </h3>
                            <button onClick={() => setShowPrintPreview(false)} className="p-2 hover:bg-muted/50 rounded-lg transition-colors text-muted-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto print:max-h-none print:overflow-visible">
                            <InvoicePrint
                                ref={printRef}
                                items={lastSale.items}
                                total={lastSale.total}
                                invoiceNumber={lastSale.invoiceNumber}
                                date={lastSale.date}
                                // @ts-ignore
                                patientName={lastSale.patientName}
                                settings={lastSale.settings}
                                pointsEarned={lastSale.pointsEarned}
                            />
                        </div>
                        <div className="flex gap-3 p-4 border-t border-border bg-muted/30 print:hidden">
                            <button
                                onClick={handlePrint}
                                className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground py-3 rounded-xl font-bold transition-all shadow-md shadow-primary/20 active:scale-[0.98]"
                            >
                                <Printer className="w-5 h-5" />
                                طباعة الفاتورة
                            </button>

                            <button
                                onClick={() => {
                                    if (!lastSale) return;

                                    // 1. Get Phone Number
                                    let phone = lastSale.patientPhone || "";

                                    if (!phone) {
                                        const input = prompt("يرجى إدخال رقم هاتف العميل (مثال: 07xxxxxxxxx):");
                                        if (!input) return;
                                        phone = input;
                                    }

                                    // 2. Generate Message
                                    const saleObj = {
                                        id: lastSale.invoiceNumber,
                                        createdAt: lastSale.date,
                                        total: lastSale.total,
                                        // @ts-ignore
                                        discount: lastSale.discount || lastSale.settings?.discount || 0,
                                        patient: { name: lastSale.patientName || "عميلنا الكريم" },
                                        items: lastSale.items.map(i => ({
                                            drug: { tradeName: i.name },
                                            quantity: i.quantity,
                                            price: i.price
                                        }))
                                    };

                                    try {
                                        const msg = generateInvoiceMessage(saleObj, companySettings?.name);
                                        openWhatsApp(phone, msg);
                                    } catch (err: any) {
                                        alert("خطأ في واتساب: " + err.message);
                                        console.error(err);
                                    }
                                }}
                                className="flex-1 flex items-center justify-center gap-2 bg-success/10 text-success hover:bg-success/20 py-3 rounded-xl font-bold transition-colors border border-success/30"
                            >
                                <Smartphone className="w-5 h-5" />
                                إرسال واتساب
                            </button>
                            <button
                                onClick={() => setShowPrintPreview(false)}
                                className="flex-1 bg-background border border-border hover:bg-muted text-foreground py-3 rounded-xl font-bold transition-colors"
                            >
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== اليمين: شبكة المنتجات ===== */}
            <div className="flex w-[63%] flex-col border-l border-border/50 bg-muted/20 print:hidden relative">

                {/* شريط الحالة الذكي */}
                <div className="bg-zinc-900 text-white h-9 flex items-center justify-between px-4 text-xs font-medium shrink-0">
                    <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-1.5 ${isOnline ? 'text-success' : 'text-warning'}`}>
                            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                            <span>{isOnline ? 'متصل' : 'غير متصل'}</span>
                        </div>
                        <div className="w-px h-4 bg-zinc-700" />
                        <span className="text-zinc-400">مرحباً، {user.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 text-zinc-500">
                            <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] tracking-wider">F1</span>
                            <span>نقدي</span>
                            <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] tracking-wider">F2</span>
                            <span>آجل</span>
                            <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] tracking-wider">F3</span>
                            <span>عميل</span>
                            <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] tracking-wider">/</span>
                            <span>بحث</span>
                        </div>
                        <div className="w-px h-4 bg-zinc-700" />
                        <div className="flex items-center gap-1.5 text-zinc-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="font-mono tabular-nums">{currentTime.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    </div>
                </div>

                {/* الهيدر */}
                <div className="bg-card/90 backdrop-blur-md p-4 flex justify-between items-center shadow-sm border-b border-border z-10">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleToggleShift}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all shadow-sm ${isShiftOpen
                                ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30'
                                : 'bg-success/10 text-success hover:bg-success/20 border border-success/30'
                                }`}
                        >
                            <Clock className={`w-5 h-5 ${isShiftOpen ? 'animate-pulse' : ''}`} />
                            <div className="flex flex-col items-start leading-none">
                                <span className="text-xs opacity-80">{isShiftOpen ? 'إنهاء الوردية' : 'بدء الوردية'}</span>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="font-mono text-sm">{isShiftOpen ? shiftDuration : '--:--:--'}</span>
                                    {isShiftOpen && shiftSafeName && (
                                        <span className="text-[10px] bg-destructive/10 px-1.5 py-0.5 rounded border border-destructive/20">{shiftSafeName}</span>
                                    )}
                                </div>
                            </div>
                        </button>

                        {isShiftOpen && (
                            <>
                                <button
                                    onClick={() => setShowCashDropModal(true)}
                                    className="flex items-center gap-2 px-3 py-2 bg-warning/10 text-warning hover:bg-warning/20 border border-warning/30 rounded-xl font-bold transition-all shadow-sm"
                                    title="سحب أو إيداع نقدي في درج الصندوق"
                                >
                                    <Banknote className="w-5 h-5" />
                                    <span className="text-xs">سحب/إيداع</span>
                                </button>
                            </>
                        )}

                        <button
                            onClick={() => setShowReturnModal(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30 rounded-xl font-bold transition-all shadow-sm"
                            title="إرجاع بضاعة (F6)"
                        >
                            <Undo2 className="w-5 h-5" />
                            <span className="text-xs">إرجاع</span>
                            <kbd className="text-[9px] font-mono bg-destructive/10 px-1 py-0.5 rounded border border-destructive/20 opacity-70">F6</kbd>
                        </button>

                        <div className="w-px h-8 bg-border mx-2"></div>
                        <div className="w-11 h-11 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                            <LayoutGrid className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black text-foreground tracking-tight">نقطة البيع</h1>
                            <p className="text-muted-foreground text-xs">{products.length} منتج متوفر • {cart.reduce((a, c) => a + c.quantity, 0)} في السلة</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 relative z-50">
                        <SyncHealthDashboard />
                        {/* زر اختيار المريض */}
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
                                {selectedPatient && (
                                    <div className="flex items-center gap-2 text-[10px] font-normal opacity-80 mt-0.5">
                                        <span>{selectedPatient.phone}</span>
                                        {selectedPatient.loyaltyAccount && (
                                            <span className={`px-1.5 py-0.5 rounded-full ${selectedPatient.loyaltyAccount.tier === 'GOLD' ? 'bg-warning/10 text-warning' :
                                                selectedPatient.loyaltyAccount.tier === 'SILVER' ? 'bg-muted text-muted-foreground' :
                                                    'bg-warning/20 text-warning'
                                                }`}>
                                                💎 {selectedPatient.loyaltyAccount.totalPoints} نقطة
                                            </span>
                                        )}
                                    </div>
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
                        <button
                            onClick={handleSync}
                            className="p-2 bg-background border border-border hover:bg-primary/10 hover:border-primary/30 rounded-xl transition-all text-muted-foreground hover:text-primary"
                            title="مزامنة (F5)"
                        >
                            <Database className="w-4 h-4" />
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
                            placeholder="ابحث عن دواء بالاسم أو الباركود... (F2 للتركيز • Enter للإضافة)"
                            className="w-full rounded-xl border border-border bg-background py-3.5 pr-12 pl-4 text-base shadow-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-muted-foreground"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
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

                {/* عدد النتائج */}
                {searchTerm && products.length > 0 && (
                    <div className="px-5 pb-1">
                        <span className="text-xs text-muted-foreground font-medium">{products.length} نتيجة لـ "{searchTerm}"</span>
                    </div>
                )}

                {/* شبكة المنتجات */}
                <div className="flex-1 overflow-y-auto px-5 pb-5">
                    <div className="grid grid-cols-2 gap-3 pt-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                        {products.map((product) => {
                            const cartItem = cart.find(c => c.id === product.id);
                            const expiryStatus = getExpiryStatus(product.nearestExpiry);
                            const isExpired = expiryStatus?.label === 'منتهي';
                            const stockLevel = product.stock > 20 ? 'high' : product.stock > 5 ? 'mid' : product.stock > 0 ? 'low' : 'out';

                            return (
                                <button
                                    key={product.id}
                                    onClick={() => addToCart(product)}
                                    disabled={product.stock <= 0 || isExpired}
                                    className={`group relative flex flex-col rounded-2xl p-3 transition-all duration-200 text-right ${product.stock <= 0 || isExpired
                                        ? 'bg-muted opacity-50 cursor-not-allowed border border-transparent'
                                        : 'bg-card border border-border hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1 active:scale-[0.97]'
                                        }`}
                                >
                                    {/* Badge كمية في السلة */}
                                    {cartItem && (
                                        <div className="absolute -top-2.5 -left-2.5 w-7 h-7 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-xs font-black rounded-full flex items-center justify-center shadow-lg shadow-primary/40 z-10 animate-scaleIn ring-2 ring-background">
                                            {cartItem.quantity}
                                        </div>
                                    )}

                                    {/* شارة تنبيه الصلاحية */}
                                    {expiryStatus && (
                                        <div className={`absolute top-1.5 right-1.5 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md z-10 ${expiryStatus.color}`}>
                                            <AlertTriangle className="w-2.5 h-2.5" />
                                            {expiryStatus.label}
                                        </div>
                                    )}

                                    {/* أيقونة المنتج */}
                                    <div className={`mb-2 h-12 w-full rounded-xl flex items-center justify-center text-xl transition-colors ${stockLevel === 'out' ? 'bg-muted' :
                                        stockLevel === 'low' ? 'bg-gradient-to-br from-destructive/5 to-warning/5 group-hover:from-destructive/10 group-hover:to-warning/10' :
                                            'bg-gradient-to-br from-primary/5 to-primary/10 group-hover:from-primary/10 group-hover:to-primary/15'
                                        }`}>
                                        💊
                                    </div>

                                    {/* اسم المنتج */}
                                    <h3 className="line-clamp-1 font-bold text-foreground text-[13px] leading-snug">
                                        {product.name}
                                    </h3>



                                    {/* السعر والمخزون */}
                                    <div className="flex w-full items-end justify-between mt-auto pt-2">
                                        <span className="font-black text-primary text-sm tabular-nums">
                                            {formatIQD(product.price || 0)}
                                        </span>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${stockLevel === 'high' ? 'bg-success/10 text-success' :
                                            stockLevel === 'mid' ? 'bg-primary/10 text-primary' :
                                                stockLevel === 'low' ? 'bg-warning/10 text-warning' :
                                                    'bg-destructive/10 text-destructive'
                                            }`}>
                                            {product.stock > 0 ? product.stock : 'نفد'}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {products.length === 0 && !loading && (
                        <div className="flex h-full flex-col items-center justify-center text-muted-foreground py-20 animate-fadeIn">
                            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-5">
                                <Search className="h-8 w-8 opacity-25" />
                            </div>
                            <h3 className="text-lg font-bold text-muted-foreground mb-1">لا توجد نتائج</h3>
                            <p className="text-muted-foreground mb-6 max-w-xs text-center text-sm">جرب كلمات مفتاحية أخرى</p>
                            <button onClick={handleSeed} className="px-5 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl font-bold transition-colors text-sm">
                                إعادة تهيئة المنتجات
                            </button>
                        </div>
                    )}

                    {loading && (
                        <div className="flex h-full flex-col items-center justify-center text-muted-foreground py-20">
                            <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="font-medium animate-pulse text-sm">جاري جلب البيانات...</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ===== اليسار: السلة ===== */}
            <div className="flex w-[37%] flex-col bg-card border-r border-border shadow-xl z-20 print:hidden h-full">
                {/* هيدر السلة */}
                <div className="flex items-center justify-between p-5 pb-3 bg-card">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-primary to-primary/80 p-2.5 rounded-xl shadow-lg shadow-primary/20">
                            <ShoppingCart className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-foreground">سلة المشتريات</h2>
                            <p className="text-[10px] text-muted-foreground font-medium">{new Date().toLocaleDateString('ar-IQ')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {cart.length > 0 && (
                            <button
                                onClick={() => { setCart([]); setManualDiscount(0); setIsRedeemingLoyalty(false); }}
                                className="p-1.5 rounded-lg bg-destructive/10 text-destructive/60 hover:bg-destructive/20 hover:text-destructive transition-all"
                                title="مسح السلة (F5)"
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

                {/* ==== Pharmacovigilance Alerts ==== */}
                {(allergyWarnings.length > 0 || interactions.length > 0) && (
                    <div className="px-4 py-2 flex flex-col gap-2">
                        {allergyWarnings.length > 0 && (
                            <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 flex gap-3 items-start animate-fadeIn shadow-sm">
                                <div className="bg-destructive/20 text-destructive p-2 rounded-lg shrink-0">
                                    <AlertTriangle className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-destructive text-sm">تحذير حساسية!</h4>
                                    <p className="text-xs text-destructive mt-0.5 leading-relaxed">
                                        المريض يعاني من حساسية تجاه المواد المتواجدة في السلة:
                                        <span className="font-bold ml-1">{allergyWarnings.join('، ')}</span>
                                    </p>
                                </div>
                            </div>
                        )}

                        {interactions.map((interaction, idx) => (
                            <div key={idx} className={`border rounded-xl p-3 flex gap-3 items-start animate-fadeIn shadow-sm ${interaction.severity === 'HIGH' ? 'bg-destructive/10 border-destructive/30' : 'bg-warning/10 border-warning/30'}`}>
                                <div className={`p-2 rounded-lg shrink-0 ${interaction.severity === 'HIGH' ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning'}`}>
                                    <AlertTriangle className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <h4 className={`font-bold text-sm ${interaction.severity === 'HIGH' ? 'text-destructive' : 'text-warning'}`}>
                                            تفاعل دوائي ({interaction.severity === 'HIGH' ? 'خطير' : 'متوسط'})
                                        </h4>
                                    </div>
                                    <div className="flex items-center gap-1.5 my-1.5 flex-wrap">
                                        <span className="bg-card px-2 py-0.5 rounded text-[10px] font-bold border truncate max-w-full" title={interaction.drug1}>{interaction.drug1}</span>
                                        <span className="text-muted-foreground text-xs">+</span>
                                        <span className="bg-card px-2 py-0.5 rounded text-[10px] font-bold border truncate max-w-full" title={interaction.drug2}>{interaction.drug2}</span>
                                    </div>
                                    <p className={`text-[11px] leading-relaxed ${interaction.severity === 'HIGH' ? 'text-destructive' : 'text-warning'}`}>
                                        {interaction.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {/* ================================ */}

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
                        cart.map((item, index) => (
                            <div
                                key={item.id}
                                className="group flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 hover:border-primary/40 transition-all animate-slideUp"
                                style={{ animationDelay: `${index * 30}ms` }}
                            >
                                <div className="w-10 h-10 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg flex items-center justify-center text-lg shrink-0">
                                    💊
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-foreground text-[13px] truncate">{item.name}</h4>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] text-muted-foreground">{formatIQD(item.price)} × {item.quantity}</span>
                                        <span className="text-[11px] text-primary font-black">{formatIQD(item.price * item.quantity)}</span>
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
                                        <input
                                            type="number"
                                            min="1"
                                            max={item.stock}
                                            value={item.quantity}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                if (!isNaN(val) && val > 0 && val <= item.stock) {
                                                    setCart(prev => prev.map(c => c.id === item.id ? { ...c, quantity: val } : c));
                                                }
                                            }}
                                            className="w-10 text-center font-black text-foreground text-sm tabular-nums bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
                            <span className="font-bold tabular-nums">{cart.reduce((a, c) => a + c.quantity, 0)}</span>
                        </div>

                        <div className="flex justify-between text-muted-foreground text-sm">
                            <span>المجموع الفرعي</span>
                            <span className="font-bold tabular-nums">{formatIQD(subTotal)}</span>
                        </div>

                        {/* قسم الخصومات */}
                        <div className="bg-muted/50 rounded-lg p-2 space-y-2 border border-border">
                            <div className="flex justify-between items-center text-sm">
                                <button
                                    onClick={() => {
                                        setShowDiscountInput(!showDiscountInput);
                                        if (!showDiscountInput) {
                                            setTimeout(() => {
                                                const input = document.getElementById('manual-discount-input');
                                                if (input) input.focus();
                                            }, 50);
                                        }
                                    }}
                                    className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors"
                                >
                                    <TicketPercent className="w-4 h-4" />
                                    <span>خصم إضافي</span>
                                    <kbd className="text-[9px] font-mono opacity-50 border border-blue-300 px-1 py-0.5 rounded">F3</kbd>
                                </button>
                                {showDiscountInput ? (() => {
                                    const maxPct = companySettings?.maxDiscountPercent ?? 10;
                                    const maxAllowed = Math.floor(subTotal * (maxPct / 100));
                                    return (
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="flex items-center gap-1">
                                                <input
                                                    id="manual-discount-input"
                                                    type="number"
                                                    min="0"
                                                    max={maxAllowed}
                                                    className={`w-20 px-2 py-0.5 rounded border text-sm outline-none transition-all ${manualDiscount >= maxAllowed && maxAllowed > 0 ? 'border-warning focus:border-warning focus:ring-1 focus:ring-warning/20' : 'border-border focus:border-primary focus:ring-1 focus:ring-primary/20'}`}
                                                    value={manualDiscount === 0 ? '' : manualDiscount}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === '') { setManualDiscount(0); return; }
                                                        const num = parseInt(val);
                                                        if (!isNaN(num)) {
                                                            setManualDiscount(Math.min(num, maxAllowed));
                                                        }
                                                    }}
                                                    placeholder="0"
                                                    autoFocus
                                                />
                                                <span className="text-[10px] text-muted-foreground">{formatIQD(0).split(' ')[1]}</span>
                                                <button
                                                    onClick={() => { setManualDiscount(0); setShowDiscountInput(false); }}
                                                    className="text-muted-foreground hover:text-destructive"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <span className={`text-[9px] font-medium ${manualDiscount >= maxAllowed && maxAllowed > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                                                الحد الأقصى: {formatIQD(maxAllowed)} ({maxPct}%)
                                            </span>
                                        </div>
                                    );
                                })() : (
                                    <span className="text-muted-foreground text-xs">{manualDiscount > 0 ? `-${formatIQD(manualDiscount)}` : formatIQD(0)}</span>
                                )}
                            </div>

                            {/* خصم الولاء */}
                            {companySettings?.loyaltyEnabled && selectedPatient && (
                                <div className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-1 text-purple-600 font-medium">
                                        <Gift className="w-4 h-4" />
                                        <span className="text-xs">استبدال نقاط ({selectedPatient.loyaltyAccount?.totalPoints || 0})</span>
                                    </div>
                                    {selectedPatient.loyaltyAccount && selectedPatient.loyaltyAccount.totalPoints >= loyaltyMinRedemption ? (
                                        <button
                                            onClick={() => setIsRedeemingLoyalty(!isRedeemingLoyalty)}
                                            disabled={maxPointsForBill <= 0}
                                            className={`relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none ${isRedeemingLoyalty ? 'bg-purple-600' : 'bg-muted-foreground/30'}`}
                                        >
                                            <span className={`absolute left-0.5 top-0.5 bg-background w-4 h-4 rounded-full transition-transform duration-200 ${isRedeemingLoyalty ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </button>
                                    ) : (
                                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">غير كافية</span>
                                    )}
                                </div>
                            )}

                            {(isRedeemingLoyalty && loyaltyDiscountVal > 0) && (
                                <div className="flex justify-between text-xs text-purple-600 pr-5">
                                    <span>سيتم خصم {pointsToRedeem} نقطة</span>
                                    <span>-{formatIQD(loyaltyDiscountVal)}</span>
                                </div>
                            )}
                        </div>

                        {/* نقاط ستكتسب */}
                        {companySettings?.loyaltyEnabled && selectedPatient && finalTotal > 0 && (
                            <div className="flex justify-between text-sm bg-success/5 p-1.5 rounded border border-success/20">
                                <span className="text-success font-bold flex items-center gap-1 text-xs">
                                    🎁 نقاط ستكتسب
                                </span>
                                <span className="font-bold text-success text-xs">
                                    +{Math.floor(finalTotal * (companySettings.loyaltyPointsPerDinar || 0.01))} نقطة
                                </span>
                            </div>
                        )}

                        {/* الإجمالي */}
                        <div className="bg-gradient-to-l from-primary to-primary/80 rounded-xl p-3 flex justify-between items-center">
                            <span className="text-sm font-bold text-primary-foreground/80">الإجمالي النهائي</span>
                            <span className="text-xl font-black text-primary-foreground tracking-tight tabular-nums">{formatIQD(finalTotal)}</span>
                        </div>
                    </div>

                    {/* أزرار الدفع */}
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            className="col-span-1 group rounded-2xl bg-gradient-to-b from-success to-success/90 py-4 font-bold text-white shadow-lg shadow-success/20 transition-all hover:shadow-success/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1.5 relative overflow-hidden"
                            disabled={cart.length === 0}
                            onClick={() => handlePayment("CASH")}
                            title="دفع نقدي (F4)"
                        >
                            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                            <Banknote className="w-6 h-6 relative z-10" />
                            <span className="relative z-10 text-sm font-black">نقدي</span>
                            <span className="absolute top-1.5 left-1.5 bg-white/20 text-[9px] px-1.5 py-0.5 rounded-md font-mono">F4</span>
                        </button>
                        <button
                            className="col-span-1 group rounded-2xl bg-gradient-to-b from-warning to-warning/90 py-4 font-bold text-white shadow-lg shadow-warning/20 transition-all hover:shadow-warning/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1.5 relative overflow-hidden"
                            disabled={cart.length === 0}
                            onClick={() => handlePayment("CREDIT")}
                            title="بيع بالآجل"
                        >
                            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                            <CreditCard className="w-6 h-6 relative z-10" />
                            <span className="relative z-10 text-sm font-black">آجل</span>
                        </button>
                        <button
                            className="col-span-1 group rounded-2xl bg-gradient-to-b from-violet-500 to-purple-600 py-4 font-bold text-white shadow-lg shadow-purple-600/20 transition-all hover:shadow-purple-600/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1.5 relative overflow-hidden"
                            disabled={cart.length === 0}
                            onClick={() => handleZainCashPayment()}
                            title="الدفع عبر زين كاش"
                        >
                            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                            <Smartphone className="w-6 h-6 relative z-10" />
                            <span className="relative z-10 text-sm font-black">زين كاش</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ===== Zain Cash Modal ===== */}
            {isZainCashProcessing && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn">
                    <div className="bg-card rounded-2xl p-8 max-w-sm w-full text-center space-y-6 animate-slideUp">
                        <div className="w-20 h-20 bg-gradient-to-br from-violet-100 to-purple-100 rounded-full flex items-center justify-center mx-auto animate-pulse">
                            <Smartphone className="w-10 h-10 text-purple-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold mb-2">في انتظار الدفع...</h3>
                            <p className="text-muted-foreground text-sm">
                                يرجى إتمام عملية الدفع في النافذة المنبثقة.<br />
                                سيتم تحديث الحالة تلقائياً.
                            </p>
                        </div>
                        <div className="flex justify-center gap-2">
                            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                        <button
                            onClick={() => setIsZainCashProcessing(false)}
                            className="text-destructive text-sm hover:underline font-medium"
                        >
                            إلغاء العملية
                        </button>
                    </div>
                </div>
            )}
            {/* ===== Shift Open Modal ===== */}
            {showShiftOpenModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="bg-primary p-4 text-primary-foreground flex justify-between items-center">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Clock className="w-5 h-5" />
                                بدء وردية جديدة
                            </h2>
                            <button onClick={() => setShowShiftOpenModal(false)} className="text-primary-foreground/70 hover:text-primary-foreground transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">اختر الصندوق</label>
                                <select
                                    className="w-full border-border rounded-lg shadow-sm focus:border-primary focus:ring-primary"
                                    value={selectedSafeId}
                                    onChange={(e) => setSelectedSafeId(e.target.value)}
                                >
                                    <option value="" disabled>-- اختر صندوقاً --</option>
                                    {availableSafes.map(safe => (
                                        <option key={safe.id} value={safe.id}>{safe.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">الرصيد الافتتاحي (د.ع)</label>
                                <input
                                    type="number"
                                    placeholder="أدخل المبلغ المتوفر في الصندوق الان"
                                    className="w-full border-border rounded-lg shadow-sm focus:border-primary focus:ring-primary"
                                    value={startingCashAmount}
                                    onChange={(e) => setStartingCashAmount(e.target.value)}
                                />
                            </div>
                            <div className="bg-primary/10 text-primary p-3 rounded-lg text-sm">
                                يرجى عد النقدية في درج النقدية قبل بدء الوردية.
                            </div>
                        </div>
                        <div className="p-4 border-t bg-muted/50 flex gap-3">
                            <button
                                onClick={confirmStartShift}
                                disabled={loading || !selectedSafeId}
                                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
                            >
                                بدء الوردية
                            </button>
                            <button
                                onClick={() => setShowShiftOpenModal(false)}
                                className="px-4 py-2 bg-background border border-border rounded-lg font-medium hover:bg-muted transition-colors"
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Shift Close Modal ===== */}
            {showShiftCloseModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="bg-destructive p-4 text-destructive-foreground flex justify-between items-center">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Clock className="w-5 h-5" />
                                إنهاء الوردية
                            </h2>
                            <button onClick={() => setShowShiftCloseModal(false)} className="text-destructive-foreground/70 hover:text-destructive-foreground transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {shiftSummary ? (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-muted p-4 rounded-xl border border-border">
                                            <p className="text-xs text-muted-foreground mb-1">وقت البدء</p>
                                            <p className="font-bold">{new Date(shiftSummary.startTime).toLocaleTimeString('ar-IQ')}</p>
                                        </div>
                                        <div className="bg-muted p-4 rounded-xl border border-border">
                                            <p className="text-xs text-muted-foreground mb-1">مدة الوردية</p>
                                            <p className="font-bold">{shiftDuration}</p>
                                        </div>
                                        <div className="bg-primary/10 p-4 rounded-xl border border-primary/20">
                                            <p className="text-xs text-primary mb-1">الصندوق</p>
                                            <p className="font-bold text-primary">{shiftSummary.safeName}</p>
                                        </div>
                                        <div className="bg-success/10 p-4 rounded-xl border border-success/20">
                                            <p className="text-xs text-success mb-1">المبيعات ({shiftSummary.salesCount})</p>
                                            <p className="font-bold text-success">{formatIQD(shiftSummary.salesTotalAmount)}</p>
                                        </div>
                                    </div>

                                    <div className="bg-warning/10 rounded-xl p-4 border border-warning/30">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm font-medium text-warning">الرصيد الافتتاحي</span>
                                            <span className="font-bold text-warning">{formatIQD(shiftSummary.startingCash)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-warning">الرصيد المتوقع في الصندوق</span>
                                            <span className="text-lg font-black text-warning">{formatIQD(shiftSummary.expectedCash)}</span>
                                        </div>
                                        <p className="text-[10px] text-warning/80 mt-2">
                                            الرصيد المتوقع = الرصيد الافتتاحي + المبيعات النقدية + المقبوضات - المدفوعات
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-foreground mb-1">الرصيد الفعلي المتوفر الآن (د.ع)</label>
                                        <input
                                            type="number"
                                            placeholder="أدخل المبلغ بعد عدّ الدرج"
                                            className="w-full border-border rounded-lg shadow-sm focus:border-destructive focus:ring-destructive text-lg py-3"
                                            value={actualCashAmount}
                                            onChange={(e) => setActualCashAmount(e.target.value)}
                                        />
                                        {actualCashAmount && (
                                            <div className="mt-2 text-sm flex justify-between">
                                                <span>الفرق:</span>
                                                <span className={`font-bold ${parseFloat(actualCashAmount) - shiftSummary.expectedCash < 0 ? 'text-destructive' : parseFloat(actualCashAmount) - shiftSummary.expectedCash > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                                                    {formatIQD(parseFloat(actualCashAmount) - shiftSummary.expectedCash)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">جاري جلب تفاصيل الوردية...</div>
                            )}
                        </div>

                        <div className="p-4 border-t bg-muted/50 flex gap-3">
                            <button
                                onClick={confirmCloseShift}
                                disabled={loading || !actualCashAmount}
                                className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
                            >
                                إغلاق الوردية
                            </button>
                            <button
                                onClick={() => setShowShiftCloseModal(false)}
                                className="px-4 py-2 bg-background border border-border rounded-lg font-medium hover:bg-muted transition-colors"
                            >
                                عودة
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Cash Drop Modal ===== */}
            {showCashDropModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-card rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-scaleIn">
                        <div className="bg-warning p-4 text-white flex justify-between items-center">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Banknote className="w-5 h-5" />
                                سحب وإيداع (درج الصندوق)
                            </h2>
                            <button onClick={() => setShowCashDropModal(false)} className="text-white/70 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-foreground mb-2">نوع العملية</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setCashDropType("OUT")}
                                        className={`flex-1 py-2 px-3 rounded-lg border font-bold transition-colors ${cashDropType === "OUT" ? 'bg-destructive/10 border-destructive text-destructive' : 'bg-background border-border text-muted-foreground'}`}
                                    >
                                        سحب نقدي (مصروف/تسليم)
                                    </button>
                                    <button
                                        onClick={() => setCashDropType("IN")}
                                        className={`flex-1 py-2 px-3 rounded-lg border font-bold transition-colors ${cashDropType === "IN" ? 'bg-success/10 border-success text-success' : 'bg-background border-border text-muted-foreground'}`}
                                    >
                                        إيداع نقدي
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-foreground mb-1">المبلغ (د.ع)</label>
                                <input
                                    type="number"
                                    placeholder="أدخل المبلغ"
                                    className="w-full border-border rounded-lg shadow-sm focus:border-warning focus:ring-warning text-lg py-2"
                                    value={cashDropAmount}
                                    onChange={(e) => setCashDropAmount(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-foreground mb-1">السبب / ملاحظات</label>
                                <input
                                    type="text"
                                    placeholder="مثال: مصاريف صيانة، تسليم كاش للمدير..."
                                    className="w-full border-border rounded-lg shadow-sm focus:border-warning focus:ring-warning py-2"
                                    value={cashDropNote}
                                    onChange={(e) => setCashDropNote(e.target.value)}
                                    maxLength={200}
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t bg-muted/50 flex gap-3">
                            <button
                                onClick={confirmCashDrop}
                                disabled={loading || !cashDropAmount || parseFloat(cashDropAmount) <= 0}
                                className="flex-1 bg-warning hover:bg-warning/90 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
                            >
                                تسجيل العملية
                            </button>
                            <button
                                onClick={() => setShowCashDropModal(false)}
                                className="px-4 py-2 bg-background border border-border rounded-lg font-medium hover:bg-muted transition-colors"
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ===== Sale Return Modal ===== */}
            <SaleReturnModal
                isOpen={showReturnModal}
                onClose={() => setShowReturnModal(false)}
                user={user}
            />
        </div>
    );
}
