import { useState, useEffect } from "react";
import { ShoppingCart, Eraser, AlertTriangle, TicketPercent, X, Gift, Banknote, CreditCard, Building2, Plus, Minus, Trash2, Pencil, PauseCircle, Loader2 } from "lucide-react";
import { formatIQD } from "./pos-utils";
import type { CartItem, DrugInteraction, Patient } from "./pos-types";
import Toggle from "../Toggle";

/**
 * Controlled number input that allows intermediate empty/partial states while typing.
 * A plain controlled <input type="number"> with strict validation rejects the empty
 * string that appears when the user clears the field to retype, causing the input
 * to feel "frozen". This component holds local display state and only propagates
 * valid, committed values to the parent.
 */
function QuantityInput({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
    const [display, setDisplay] = useState(String(value));

    // Sync when the parent value changes externally (e.g. via +/- buttons)
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
 * Discount input — holds local display state so React re-renders don't
 * interfere with typing. Commits valid values on change; resets on blur if invalid.
 */
function DiscountInput({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
    const [display, setDisplay] = useState(value === 0 ? '' : String(value));

    useEffect(() => { setDisplay(value === 0 ? '' : String(value)); }, [value]);

    return (
        <input
            id="manual-discount-input"
            type="number"
            min="0"
            value={display}
            onChange={(e) => {
                setDisplay(e.target.value);
                const num = parseInt(e.target.value, 10);
                if (!isNaN(num) && num >= 0) onChange(Math.min(num, max));
                else if (e.target.value === '') onChange(0);
            }}
            onBlur={() => {
                const num = parseInt(display, 10);
                if (isNaN(num) || num < 0) { setDisplay(''); onChange(0); }
            }}
            placeholder="0"
            autoFocus
            className={`w-20 px-2 py-0.5 rounded border text-sm outline-none transition-all bg-background text-foreground ${value >= max && max > 0 ? 'border-warning focus:border-warning focus:ring-1 focus:ring-warning/20' : 'border-border focus:border-primary focus:ring-1 focus:ring-primary/20'}`}
        />
    );
}

/**
 * Inline price editor — same pattern as QuantityInput.
 * Shows a text input that accepts partial values while typing,
 * only commits on blur/Enter with a valid positive number.
 */
function PriceInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const [display, setDisplay] = useState(String(value));

    useEffect(() => { setDisplay(String(value)); }, [value]);

    const commit = () => {
        const val = parseFloat(display);
        if (!isNaN(val) && val > 0) onChange(val);
        else setDisplay(String(value));
    };

    return (
        <input
            type="number"
            min="1"
            value={display}
            onChange={(e) => setDisplay(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); } }}
            autoFocus
            className="w-20 px-1.5 py-0.5 text-center font-black text-amber-700 text-sm tabular-nums bg-amber-50 border border-amber-400 rounded outline-none focus:ring-1 focus:ring-amber-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
    );
}

interface Props {
    cart: CartItem[];
    interactions: DrugInteraction[];
    allergyWarnings: string[];
    companySettings: any;
    selectedPatient: Patient | null;
    manualDiscount: number;
    isRedeemingLoyalty: boolean;
    showDiscountInput: boolean;
    subTotal: number;
    finalTotal: number;
    loyaltyDiscountVal: number;
    pointsToRedeem: number;
    loyaltyMinRedemption: number;
    maxPointsForBill: number;
    onUpdateQuantity: (id: string, delta: number) => void;
    onRemoveFromCart: (id: string) => void;
    onSetItemQuantity: (id: string, qty: number) => void;
    onSetItemPrice: (id: string, price: number) => void;
    onClearCart: () => void;
    onHold: () => void;
    onDiscountToggle: () => void;
    onDiscountChange: (v: number) => void;
    onLoyaltyToggle: () => void;
    onPayment: (method: string) => void;
    isProcessingSale: boolean;
}

export default function POSCart({
    cart, interactions, allergyWarnings, companySettings, selectedPatient,
    manualDiscount, isRedeemingLoyalty, showDiscountInput,
    subTotal, finalTotal, loyaltyDiscountVal, pointsToRedeem,
    loyaltyMinRedemption, maxPointsForBill,
    onUpdateQuantity, onRemoveFromCart, onSetItemQuantity, onSetItemPrice, onClearCart, onHold,
    onDiscountToggle, onDiscountChange, onLoyaltyToggle, onPayment, isProcessingSale,
}: Props) {
    const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
    const maxPct = companySettings?.maxDiscountPercent ?? 10;
    const maxAllowed = Math.floor(subTotal * (maxPct / 100));
    const patientPoints = selectedPatient?.loyaltyAccount?.totalPoints || 0;

    return (
        <div className="flex w-[32%] flex-col bg-card border-r border-border shadow-xl z-20 print:hidden h-full">
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
                        <>
                            <button
                                onClick={onHold}
                                className="p-1.5 rounded-lg bg-primary/10 text-primary/70 hover:bg-primary/20 hover:text-primary transition-all"
                                title="تعليق الفاتورة (F10)"
                            >
                                <PauseCircle className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={onClearCart}
                                className="p-1.5 rounded-lg bg-destructive/10 text-destructive/60 hover:bg-destructive/20 hover:text-destructive transition-all"
                                title="مسح السلة (F5)"
                            >
                                <Eraser className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-black border border-primary/20">
                        {cart.length} عنصر
                    </span>
                </div>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mx-5 mb-1"></div>

            {/* تنبيهات التفاعلات الدوائية */}
            {(allergyWarnings.length > 0 || interactions.length > 0) && (
                <div className="px-4 py-2 flex flex-col gap-2 shrink-0 max-h-[30vh] overflow-y-auto">
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
                                <h4 className={`font-bold text-sm ${interaction.severity === 'HIGH' ? 'text-destructive' : 'text-warning'}`}>
                                    تفاعل دوائي ({interaction.severity === 'HIGH' ? 'خطير' : 'متوسط'})
                                </h4>
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
                    cart.map((item, index) => {
                        const isOverridden = item.originalPrice !== undefined;
                        const isEditingPrice = editingPriceId === item.id;
                        return (
                        <div
                            key={item.id}
                            className={`group flex items-center gap-3 rounded-xl border p-2.5 transition-all animate-slideUp ${isOverridden ? 'border-amber-300 bg-amber-50/50 hover:border-amber-400' : 'border-border bg-card hover:border-primary/40'}`}
                            style={{ animationDelay: `${index * 30}ms` }}
                        >
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${isOverridden ? 'bg-gradient-to-br from-amber-100 to-amber-200' : 'bg-gradient-to-br from-primary/5 to-primary/10'}`}>
                                💊
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                    <h4 className="font-bold text-foreground text-[13px] truncate">{item.name}</h4>
                                    {isOverridden && (
                                        <span className="shrink-0 px-1 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-700 border border-amber-300 flex items-center gap-0.5">
                                            <Pencil className="w-2.5 h-2.5" />سعر معدّل
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {isEditingPrice ? (
                                        <PriceInput
                                            value={item.price}
                                            onChange={(val) => {
                                                onSetItemPrice(item.id, val);
                                                setEditingPriceId(null);
                                            }}
                                        />
                                    ) : (
                                        <button
                                            onClick={() => setEditingPriceId(item.id)}
                                            className={`flex items-center gap-0.5 group/price rounded px-1 transition-colors ${isOverridden ? 'text-amber-700 hover:bg-amber-100' : 'text-muted-foreground hover:text-amber-600 hover:bg-amber-50'}`}
                                            title="تعديل السعر"
                                        >
                                            {isOverridden && item.originalPrice !== undefined && (
                                                <span className="text-[10px] line-through text-muted-foreground">{formatIQD(item.originalPrice)}</span>
                                            )}
                                            <span className={`text-[11px] font-bold ${isOverridden ? 'text-amber-700' : ''}`}>{formatIQD(item.price)}</span>
                                            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/price:opacity-60 transition-opacity" />
                                        </button>
                                    )}
                                    <span className="text-[11px] text-muted-foreground">× {item.quantity}</span>
                                    <span className={`text-[11px] font-black ${isOverridden ? 'text-amber-700' : 'text-primary'}`}>{formatIQD(item.price * item.quantity)}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <div className="flex items-center bg-muted rounded-lg p-0.5 border border-border">
                                    <button
                                        onClick={() => onUpdateQuantity(item.id, 1)}
                                        className="w-7 h-7 flex items-center justify-center rounded-md bg-background text-success shadow-sm hover:bg-success/10 transition-colors"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </button>
                                    <QuantityInput
                                        value={item.quantity}
                                        max={item.stock}
                                        onChange={(val) => onSetItemQuantity(item.id, val)}
                                    />
                                    <button
                                        onClick={() => onUpdateQuantity(item.id, -1)}
                                        className="w-7 h-7 flex items-center justify-center rounded-md bg-background text-destructive shadow-sm hover:bg-destructive/10 transition-colors"
                                    >
                                        <Minus className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <button
                                    onClick={() => onRemoveFromCart(item.id)}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                        );
                    })
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
                                onClick={onDiscountToggle}
                                className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors"
                            >
                                <TicketPercent className="w-4 h-4" />
                                <span>خصم إضافي</span>
                                <kbd className="text-[9px] font-mono opacity-50 border border-blue-300 px-1 py-0.5 rounded">F3</kbd>
                            </button>
                            {showDiscountInput ? (
                                <div className="flex flex-col items-end gap-1">
                                    <div className="flex items-center gap-1">
                                        <DiscountInput value={manualDiscount} max={maxAllowed} onChange={onDiscountChange} />
                                        <span className="text-[10px] text-muted-foreground">د.ع</span>
                                        <button onClick={() => { onDiscountChange(0); onDiscountToggle(); }} className="text-muted-foreground hover:text-destructive">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <span className={`text-[9px] font-medium ${manualDiscount >= maxAllowed && maxAllowed > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                                        الحد الأقصى: {formatIQD(maxAllowed)} ({maxPct}%)
                                    </span>
                                </div>
                            ) : (
                                <span className="text-muted-foreground text-xs">{manualDiscount > 0 ? `-${formatIQD(manualDiscount)}` : formatIQD(0)}</span>
                            )}
                        </div>

                        {/* خصم الولاء */}
                        {companySettings?.loyaltyEnabled && selectedPatient && (
                            <div className="flex justify-between items-center text-sm">
                                <div className="flex items-center gap-1 text-purple-600 font-medium">
                                    <Gift className="w-4 h-4" />
                                    <span className="text-xs">استبدال نقاط ({patientPoints})</span>
                                </div>
                                {selectedPatient.loyaltyAccount && selectedPatient.loyaltyAccount.totalPoints >= loyaltyMinRedemption ? (
                                    <Toggle
                                        size="sm"
                                        checked={isRedeemingLoyalty}
                                        onChange={onLoyaltyToggle}
                                        disabled={maxPointsForBill <= 0}
                                        activeClass="bg-purple-600"
                                    />
                                ) : (
                                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">غير كافية</span>
                                )}
                            </div>
                        )}

                        {isRedeemingLoyalty && loyaltyDiscountVal > 0 && (
                            <div className="flex justify-between text-xs text-purple-600 pr-5">
                                <span>سيتم خصم {pointsToRedeem} نقطة</span>
                                <span>-{formatIQD(loyaltyDiscountVal)}</span>
                            </div>
                        )}
                    </div>

                    {/* نقاط ستكتسب */}
                    {companySettings?.loyaltyEnabled && selectedPatient && finalTotal > 0 && (
                        <div className="flex justify-between text-sm bg-success/5 p-1.5 rounded border border-success/20">
                            <span className="text-success font-bold flex items-center gap-1 text-xs">🎁 نقاط ستكتسب</span>
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

                {/* أزرار الدفع — نقدي F4 | بطاقة F5 | آجل F6 */}
                <div className="flex gap-2">
                    <button
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-success py-2.5 px-3 font-bold text-white text-sm shadow-md shadow-success/25 transition-all hover:bg-success/90 hover:shadow-success/40 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed relative"
                        disabled={cart.length === 0 || isProcessingSale}
                        onClick={() => onPayment("CASH")}
                        title="دفع نقدي (F4)"
                    >
                        {isProcessingSale ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <Banknote className="w-4 h-4 shrink-0" />}
                        <span>نقدي</span>
                        <span className="absolute top-1 left-1 bg-white/20 text-[9px] px-1 py-0.5 rounded font-mono leading-none">F4</span>
                    </button>
                    <button
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 px-3 font-bold text-white text-sm shadow-md shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed relative"
                        disabled={cart.length === 0 || isProcessingSale}
                        onClick={() => onPayment("CARD")}
                        title="دفع بالبطاقة (F5)"
                    >
                        {isProcessingSale ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <Building2 className="w-4 h-4 shrink-0" />}
                        <span>بطاقة</span>
                        <span className="absolute top-1 left-1 bg-white/20 text-[9px] px-1 py-0.5 rounded font-mono leading-none">F5</span>
                    </button>
                    <button
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-warning py-2.5 px-3 font-bold text-white text-sm shadow-md shadow-warning/25 transition-all hover:bg-warning/90 hover:shadow-warning/40 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed relative"
                        disabled={cart.length === 0 || isProcessingSale}
                        onClick={() => onPayment("CREDIT")}
                        title="بيع بالآجل (F6)"
                    >
                        {isProcessingSale ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <CreditCard className="w-4 h-4 shrink-0" />}
                        <span>آجل</span>
                        <span className="absolute top-1 left-1 bg-white/20 text-[9px] px-1 py-0.5 rounded font-mono leading-none">F6</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
