/**
 * Single source of truth for the point-of-sale flow (navigation-map §6):
 * cart → customer → method → review (the checkout sheet) → one confirmation.
 *
 * The sales tab and the payment review screen both read this context, so the
 * cart, customer, discounts, loyalty redemption and drug-safety warnings never
 * travel through route params and survive going back from the review.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { apiService, newIdempotencyKey } from '../services/api';

export type PaymentMethod = 'CASH' | 'CARD' | 'CREDIT';

export interface CartItem {
    id: string;          // drugId
    name: string;
    tradeName?: string;
    scientificName?: string;
    price: number;
    quantity: number;
    stock?: number;
    /** Set only while the price is overridden — the drug's list price (desktop parity). */
    originalPrice?: number;
}

export interface CheckoutPatient {
    id: string;
    name: string;
    phone?: string;
    balance?: number;
}

export interface DrugInteraction { drug1: string; drug2: string; severity: string; description: string }

export type SafetyStatus = 'idle' | 'checking' | 'ok' | 'failed';

interface LoyaltySettings {
    loyaltyEnabled: boolean;
    loyaltyPointsPerDinar: number;
    loyaltyRedemptionValue: number;
    loyaltyMinRedemption: number;
}

interface LoyaltyAccount { totalPoints: number; tier: string }

interface CheckoutContextValue {
    cart: CartItem[];
    patient: CheckoutPatient | null;
    method: PaymentMethod | null;
    manualDiscount: number;
    pointsToRedeem: number;
    loyaltySettings: LoyaltySettings | null;
    loyaltyAccount: LoyaltyAccount | null;
    interactions: DrugInteraction[];
    allergyWarnings: string[];
    safetyStatus: SafetyStatus;

    subTotal: number;
    itemCount: number;
    loyaltyDiscount: number;
    totalDiscount: number;
    total: number;
    /** Largest redeemable points given balance, bill and the 100-point step. */
    maxRedeemablePoints: number;
    redemptionValue: number;
    minRedemption: number;

    /** Stable key for the current checkout attempt (reset when the cart changes). */
    idempotencyKey: string;

    addDrug: (drug: { id: string; name?: string; tradeName?: string; scientificName?: string; price: number; quantity?: number }) => boolean;
    updateQuantity: (id: string, change: number) => void;
    /** Typed quantity (cart card), clamped to the available stock. */
    setItemQuantity: (id: string, quantity: number) => void;
    /** Typed unit price (cart card); keeps the list price for the audit trail. */
    setItemPrice: (id: string, price: number) => void;
    removeItem: (id: string) => void;
    setPatient: (p: CheckoutPatient | null) => void;
    setMethod: (m: PaymentMethod | null) => void;
    setManualDiscount: (amount: number) => void;
    setPointsToRedeem: (points: number) => void;
    recheckSafety: () => void;
    resetCheckout: () => void;

    /** Quick re-add chips shown on an empty cart ("آخر المبيعات"). */
    recentItems: CartItem[];
    /** Record a completed sale's lines (stock decremented locally). */
    recordSold: (sold: CartItem[]) => void;
    dropRecent: (id: string) => void;
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

export function useCheckout(): CheckoutContextValue {
    const ctx = useContext(CheckoutContext);
    if (!ctx) throw new Error('useCheckout must be used inside <CheckoutProvider>');
    return ctx;
}

const POINT_STEP = 100;

export function CheckoutProvider({ children }: { children: React.ReactNode }) {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [patient, setPatientState] = useState<CheckoutPatient | null>(null);
    const [method, setMethod] = useState<PaymentMethod | null>(null);
    const [manualDiscount, setManualDiscountState] = useState(0);
    const [pointsToRedeem, setPointsToRedeemState] = useState(0);
    const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings | null>(null);
    const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccount | null>(null);
    const [interactions, setInteractions] = useState<DrugInteraction[]>([]);
    const [allergyWarnings, setAllergyWarnings] = useState<string[]>([]);
    const [safetyStatus, setSafetyStatus] = useState<SafetyStatus>('idle');
    const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
    const [safetyNonce, setSafetyNonce] = useState(0);
    const [recentItems, setRecentItems] = useState<CartItem[]>([]);

    const recordSold = useCallback((sold: CartItem[]) => {
        setRecentItems(prev => {
            const soldQty = new Map(sold.map(i => [i.id, i.quantity]));
            // The chip re-adds the drug at its list price: a price typed for one
            // customer must not follow the drug into the next sale.
            const fresh = sold.map(i => ({
                ...i,
                price: i.originalPrice ?? i.price,
                originalPrice: undefined,
                stock: Math.max(0, (i.stock ?? 0) - i.quantity),
                quantity: 1,
            }));
            const older = prev.map(r => ({ ...r, stock: Math.max(0, (r.stock ?? 0) - (soldQty.get(r.id) ?? 0)) }));
            const seen = new Set<string>();
            return [...fresh, ...older]
                .filter(i => (i.stock ?? 0) > 0)
                .filter(i => (seen.has(i.id) ? false : (seen.add(i.id), true)))
                .slice(0, 5);
        });
    }, []);

    const dropRecent = useCallback((id: string) => setRecentItems(prev => prev.filter(r => r.id !== id)), []);

    // Loyalty programme settings (once).
    useEffect(() => {
        apiService.getLoyaltySettings().then(setLoyaltySettings).catch(() => {});
    }, []);

    // Loyalty account follows the selected customer.
    useEffect(() => {
        setLoyaltyAccount(null);
        setPointsToRedeemState(0);
        if (!patient) return;
        let active = true;
        apiService.getLoyaltyAccount(patient.id)
            .then(acc => { if (active) setLoyaltyAccount(acc); })
            .catch(() => {});
        return () => { active = false; };
    }, [patient]);

    // Any change to what is being sold means a new sale attempt.
    const cartSignature = cart.map(i => `${i.id}:${i.quantity}:${i.price}`).join('|');
    const firstRender = useRef(true);
    useEffect(() => {
        if (firstRender.current) { firstRender.current = false; return; }
        setIdempotencyKey(newIdempotencyKey());
    }, [cartSignature, patient?.id, method, manualDiscount, pointsToRedeem]);

    // Drug interactions + allergies: re-checked whenever the set of drugs or the
    // customer changes (removals included). Failure is surfaced, never hidden.
    const safetyNames = useMemo(
        () => Array.from(new Set(cart.map(i => (i.scientificName || i.name || '').trim()).filter(Boolean))).sort(),
        [cart],
    );
    const safetyKey = `${safetyNames.join('|')}#${patient?.id ?? ''}#${safetyNonce}`;
    useEffect(() => {
        const needsCheck = safetyNames.length > 1 || (safetyNames.length > 0 && !!patient);
        if (!needsCheck) {
            setInteractions([]);
            setAllergyWarnings([]);
            setSafetyStatus('idle');
            return;
        }
        let active = true;
        setSafetyStatus('checking');
        const timer = setTimeout(() => {
            apiService.checkPharmacovigilance(safetyNames, patient?.id).then(res => {
                if (!active) return;
                setInteractions(res.interactions);
                setAllergyWarnings(res.allergyWarnings);
                setSafetyStatus(res.failed ? 'failed' : 'ok');
            });
        }, 350);
        return () => { active = false; clearTimeout(timer); };
    }, [safetyKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const subTotal = useMemo(() => cart.reduce((acc, i) => acc + i.price * i.quantity, 0), [cart]);
    const itemCount = useMemo(() => cart.reduce((acc, i) => acc + i.quantity, 0), [cart]);

    const redemptionValue = loyaltySettings?.loyaltyRedemptionValue ?? 2.5;
    const minRedemption = loyaltySettings?.loyaltyMinRedemption ?? 500;
    const effectiveManualDiscount = Math.min(manualDiscount, subTotal);
    const loyaltyDiscount = Math.floor(pointsToRedeem * redemptionValue);
    const totalDiscount = Math.min(subTotal, effectiveManualDiscount + loyaltyDiscount);
    const total = Math.max(0, subTotal - totalDiscount);

    const maxRedeemablePoints = useMemo(() => {
        if (!loyaltySettings?.loyaltyEnabled || !loyaltyAccount) return 0;
        if (loyaltyAccount.totalPoints < minRedemption) return 0;
        const byBalance = Math.floor(loyaltyAccount.totalPoints / POINT_STEP) * POINT_STEP;
        const byBill = Math.floor(Math.max(0, subTotal - effectiveManualDiscount) / redemptionValue / POINT_STEP) * POINT_STEP;
        return Math.max(0, Math.min(byBalance, byBill));
    }, [loyaltySettings, loyaltyAccount, minRedemption, subTotal, effectiveManualDiscount, redemptionValue]);

    // Keep redemption within bounds when the bill shrinks.
    useEffect(() => {
        if (pointsToRedeem > maxRedeemablePoints) setPointsToRedeemState(maxRedeemablePoints);
    }, [maxRedeemablePoints, pointsToRedeem]);

    // Mirror of `cart` so mutations can validate synchronously (alerts must not
    // run inside state updaters, which React may invoke more than once).
    const cartRef = useRef<CartItem[]>(cart);
    const commitCart = useCallback((next: CartItem[]) => {
        cartRef.current = next;
        setCart(next);
    }, []);

    const addDrug: CheckoutContextValue['addDrug'] = useCallback((drug) => {
        const prev = cartRef.current;
        const available = drug.quantity;
        const existing = prev.find(i => i.id === drug.id);
        if (existing) {
            const limit = available ?? existing.stock;
            if (limit !== undefined && existing.quantity >= limit) {
                Alert.alert('تنبيه', `الكمية المتوفرة فقط ${limit}`);
                return false;
            }
            commitCart(prev.map(i => i.id === drug.id ? { ...i, quantity: i.quantity + 1, stock: limit } : i));
            return true;
        }
        if (available !== undefined && available <= 0) {
            Alert.alert('نفاد المخزون', 'هذا الدواء غير متوفر حالياً في المخزون');
            return false;
        }
        commitCart([...prev, {
            id: drug.id,
            name: drug.name ?? drug.tradeName ?? '',
            tradeName: drug.tradeName,
            scientificName: drug.scientificName,
            price: drug.price,
            quantity: 1,
            stock: available,
        }]);
        return true;
    }, [commitCart]);

    const updateQuantity = useCallback((id: string, change: number) => {
        const prev = cartRef.current;
        const item = prev.find(i => i.id === id);
        if (!item) return;
        const next = item.quantity + change;
        if (next <= 0) return;
        if (item.stock !== undefined && next > item.stock) {
            Alert.alert('تنبيه', `الكمية المتوفرة فقط ${item.stock}`);
            return;
        }
        commitCart(prev.map(i => i.id === id ? { ...i, quantity: next } : i));
    }, [commitCart]);

    const setItemQuantity = useCallback((id: string, quantity: number) => {
        const prev = cartRef.current;
        const item = prev.find(i => i.id === id);
        if (!item) return;
        const next = Math.floor(quantity);
        if (!Number.isFinite(next) || next < 1) return;
        if (item.stock !== undefined && next > item.stock) {
            Alert.alert('تنبيه', `الكمية المتوفرة فقط ${item.stock}`);
            return;
        }
        commitCart(prev.map(i => i.id === id ? { ...i, quantity: next } : i));
    }, [commitCart]);

    // Same rule as the desktop POS: remember the list price on the first
    // override, and drop the override when the price is typed back to it.
    const setItemPrice = useCallback((id: string, price: number) => {
        if (!Number.isFinite(price) || price <= 0) return;
        commitCart(cartRef.current.map(i => {
            if (i.id !== id) return i;
            const originalPrice = i.originalPrice ?? i.price;
            if (price === originalPrice) return { ...i, price, originalPrice: undefined };
            return { ...i, price, originalPrice };
        }));
    }, [commitCart]);

    const removeItem = useCallback((id: string) => {
        commitCart(cartRef.current.filter(i => i.id !== id));
    }, [commitCart]);

    const setPatient = useCallback((p: CheckoutPatient | null) => setPatientState(p), []);
    const setManualDiscount = useCallback((amount: number) => setManualDiscountState(Math.max(0, amount || 0)), []);
    const setPointsToRedeem = useCallback((points: number) => setPointsToRedeemState(Math.max(0, points || 0)), []);
    const recheckSafety = useCallback(() => setSafetyNonce(n => n + 1), []);

    const resetCheckout = useCallback(() => {
        commitCart([]);
        setPatientState(null);
        setMethod(null);
        setManualDiscountState(0);
        setPointsToRedeemState(0);
        setLoyaltyAccount(null);
        setInteractions([]);
        setAllergyWarnings([]);
        setSafetyStatus('idle');
        setIdempotencyKey(newIdempotencyKey());
    }, [commitCart]);

    const value: CheckoutContextValue = {
        cart, patient, method, manualDiscount: effectiveManualDiscount, pointsToRedeem,
        loyaltySettings, loyaltyAccount, interactions, allergyWarnings, safetyStatus,
        subTotal, itemCount, loyaltyDiscount, totalDiscount, total, maxRedeemablePoints,
        redemptionValue, minRedemption, idempotencyKey,
        addDrug, updateQuantity, setItemQuantity, setItemPrice, removeItem, setPatient, setMethod, setManualDiscount,
        setPointsToRedeem, recheckSafety, resetCheckout,
        recentItems, recordSold, dropRecent,
    };

    return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}
