import { Clock, X, Banknote } from "lucide-react";
import { formatIQD } from "./pos-utils";
import type { ShiftSummary } from "./pos-types";

interface ShiftModalsProps {
    // Shift Open
    showShiftOpen: boolean;
    startingCash: string;
    onStartingCashChange: (v: string) => void;
    onCloseShiftOpen: () => void;
    onConfirmShiftOpen: () => void;
    // Shift Close
    showShiftClose: boolean;
    shiftSummary: ShiftSummary | null;
    shiftDuration: string;
    actualCash: string;
    onActualCashChange: (v: string) => void;
    onCloseShiftClose: () => void;
    onConfirmShiftClose: () => void;
    // Cash Drop
    showCashDrop: boolean;
    cashDropType: "IN" | "OUT";
    cashDropAmount: string;
    cashDropNote: string;
    onCashDropTypeChange: (t: "IN" | "OUT") => void;
    onCashDropAmountChange: (v: string) => void;
    onCashDropNoteChange: (v: string) => void;
    onCloseCashDrop: () => void;
    onConfirmCashDrop: () => void;
    loading: boolean;
}

export default function ShiftModals({
    showShiftOpen, startingCash, onStartingCashChange, onCloseShiftOpen, onConfirmShiftOpen,
    showShiftClose, shiftSummary, shiftDuration, actualCash, onActualCashChange, onCloseShiftClose, onConfirmShiftClose,
    showCashDrop, cashDropType, cashDropAmount, cashDropNote, onCashDropTypeChange, onCashDropAmountChange, onCashDropNoteChange, onCloseCashDrop, onConfirmCashDrop,
    loading,
}: ShiftModalsProps) {
    return (
        <>
            {/* ===== Shift Open Modal ===== */}
            {showShiftOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="bg-primary p-4 text-primary-foreground flex justify-between items-center">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Clock className="w-5 h-5" />
                                بدء وردية جديدة
                            </h2>
                            <button onClick={onCloseShiftOpen} className="text-primary-foreground/70 hover:text-primary-foreground transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">الرصيد الافتتاحي (د.ع)</label>
                                <input
                                    id="shift-starting-cash-input"
                                    type="number"
                                    placeholder="أدخل المبلغ المتوفر في الصندوق الان"
                                    className="w-full bg-background text-foreground border border-border rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    value={startingCash}
                                    onChange={(e) => onStartingCashChange(e.target.value)}
                                />
                            </div>
                            <div className="bg-primary/10 text-primary p-3 rounded-lg text-sm">
                                يرجى عد النقدية في درج النقدية قبل بدء الوردية.
                            </div>
                        </div>
                        <div className="p-4 border-t bg-muted/50 flex gap-3">
                            <button onClick={onConfirmShiftOpen} disabled={loading}
                                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors">
                                بدء الوردية
                            </button>
                            <button onClick={onCloseShiftOpen}
                                className="px-4 py-2 bg-background border border-border rounded-lg font-medium hover:bg-muted transition-colors">
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Shift Close Modal ===== */}
            {showShiftClose && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="bg-destructive p-4 text-destructive-foreground flex justify-between items-center">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Clock className="w-5 h-5" />
                                إنهاء الوردية
                            </h2>
                            <button onClick={onCloseShiftClose} className="text-destructive-foreground/70 hover:text-destructive-foreground transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {shiftSummary ? (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-muted p-4 rounded-xl border border-border">
                                            <p className="text-xs text-muted-foreground mb-1">وقت البدء</p>
                                            <p className="font-bold">{new Date(shiftSummary.startTime).toLocaleTimeString('ar-IQ-u-nu-latn')}</p>
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
                                            <p className="text-xs text-success mb-1">إجمالي المبيعات ({shiftSummary.salesCount})</p>
                                            <p className="font-bold text-success">{formatIQD(shiftSummary.salesTotalAmount)}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-primary/5 p-3 rounded-xl border border-primary/20">
                                            <p className="text-xs text-primary mb-1">نقدي ({shiftSummary.cashSalesCount})</p>
                                            <p className="font-bold text-primary">{formatIQD(shiftSummary.cashSalesTotal)}</p>
                                        </div>
                                        <div className="bg-info/5 p-3 rounded-xl border border-info/20">
                                            <p className="text-xs text-info mb-1">بطاقة ({shiftSummary.cardSalesCount ?? 0})</p>
                                            <p className="font-bold text-info">{formatIQD(shiftSummary.cardSalesTotal ?? 0)}</p>
                                        </div>
                                        <div className="bg-destructive/5 p-3 rounded-xl border border-destructive/20">
                                            <p className="text-xs text-destructive mb-1">آجل ({shiftSummary.creditSalesCount})</p>
                                            <p className="font-bold text-destructive">{formatIQD(shiftSummary.creditSalesTotal)}</p>
                                        </div>
                                    </div>
                                    {(shiftSummary.returnsTotal ?? 0) > 0 && (
                                        <div className="bg-orange-50 p-3 rounded-xl border border-orange-200 flex justify-between items-center">
                                            <p className="text-xs text-orange-700">مرتجعات الوردية</p>
                                            <p className="font-bold text-orange-700">- {formatIQD(shiftSummary.returnsTotal ?? 0)}</p>
                                        </div>
                                    )}
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
                                            الرصيد المتوقع = الرصيد الافتتاحي + المبيعات النقدية - المرتجعات + المقبوضات - المدفوعات
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-foreground mb-1">الرصيد الفعلي المتوفر الآن (د.ع)</label>
                                        <input
                                            type="number"
                                            placeholder="أدخل المبلغ بعد عدّ الدرج"
                                            className="w-full bg-background text-foreground border border-border rounded-lg px-3 py-3 text-lg shadow-sm focus:outline-none focus:border-destructive focus:ring-1 focus:ring-destructive"
                                            value={actualCash}
                                            onChange={(e) => onActualCashChange(e.target.value)}
                                        />
                                        {actualCash && (
                                            <div className="mt-2 text-sm flex justify-between">
                                                <span>الفرق:</span>
                                                <span className={`font-bold ${parseFloat(actualCash) - shiftSummary.expectedCash < 0 ? 'text-destructive' : parseFloat(actualCash) - shiftSummary.expectedCash > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                                                    {formatIQD(parseFloat(actualCash) - shiftSummary.expectedCash)}
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
                            <button onClick={onConfirmShiftClose} disabled={loading || !actualCash}
                                className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors">
                                إغلاق الوردية
                            </button>
                            <button onClick={onCloseShiftClose}
                                className="px-4 py-2 bg-background border border-border rounded-lg font-medium hover:bg-muted transition-colors">
                                عودة
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Cash Drop Modal ===== */}
            {showCashDrop && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-card rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-scaleIn">
                        <div className="bg-warning p-4 text-white flex justify-between items-center">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Banknote className="w-5 h-5" />
                                سحب وإيداع (درج الصندوق)
                            </h2>
                            <button onClick={onCloseCashDrop} className="text-white/70 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-foreground mb-2">نوع العملية</label>
                                <div className="flex gap-2">
                                    <button onClick={() => onCashDropTypeChange("OUT")}
                                        className={`flex-1 py-2 px-3 rounded-lg border font-bold transition-colors ${cashDropType === "OUT" ? 'bg-destructive/10 border-destructive text-destructive' : 'bg-background border-border text-muted-foreground'}`}>
                                        سحب نقدي (مصروف/تسليم)
                                    </button>
                                    <button onClick={() => onCashDropTypeChange("IN")}
                                        className={`flex-1 py-2 px-3 rounded-lg border font-bold transition-colors ${cashDropType === "IN" ? 'bg-success/10 border-success text-success' : 'bg-background border-border text-muted-foreground'}`}>
                                        إيداع نقدي
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-foreground mb-1">المبلغ (د.ع)</label>
                                <input
                                    type="number" placeholder="أدخل المبلغ"
                                    className="w-full bg-background text-foreground border border-border rounded-lg px-3 py-2 text-lg shadow-sm focus:outline-none focus:border-warning focus:ring-1 focus:ring-warning"
                                    value={cashDropAmount}
                                    onChange={(e) => onCashDropAmountChange(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-foreground mb-1">السبب / ملاحظات</label>
                                <input
                                    type="text" placeholder="مثال: مصاريف صيانة، تسليم كاش للمدير..."
                                    className="w-full bg-background text-foreground border border-border rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:border-warning focus:ring-1 focus:ring-warning"
                                    value={cashDropNote}
                                    onChange={(e) => onCashDropNoteChange(e.target.value)}
                                    maxLength={200}
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t bg-muted/50 flex gap-3">
                            <button onClick={onConfirmCashDrop} disabled={loading || !cashDropAmount || parseFloat(cashDropAmount) <= 0}
                                className="flex-1 bg-warning hover:bg-warning/90 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors">
                                تسجيل العملية
                            </button>
                            <button onClick={onCloseCashDrop}
                                className="px-4 py-2 bg-background border border-border rounded-lg font-medium hover:bg-muted transition-colors">
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
