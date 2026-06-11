"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, Banknote, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { makePatientDebtPayment } from "@/app/lib/actions/debt";

interface Safe {
    id: string;
    name: string;
    type: string;
}

interface QuickPaymentModalProps {
    patientId: string;
    patientName: string;
    balance: number;
    safes: Safe[];
    onClose: () => void;
}

function formatIQD(amount: number) {
    return new Intl.NumberFormat("en-US").format(Math.round(amount)) + " د.ع";
}

const METHOD_LABELS: Record<string, string> = {
    CASH: "نقدي",
    CARD: "بطاقة",
    BANK_TRANSFER: "تحويل بنكي",
    ZAIN_CASH: "زين كاش",
    MOBILE_WALLET: "محفظة إلكترونية",
};

function ModalContent({
    patientId,
    patientName,
    balance,
    safes,
    onClose,
}: QuickPaymentModalProps) {
    const router = useRouter();
    const [amount, setAmount] = useState(balance);
    const [method, setMethod] = useState("CASH");
    const [note, setNote] = useState("");
    // النظام يستخدم خزنة واحدة ("الصندوق الرئيسي") — تُختار تلقائياً كما في باقي النظام
    const safeId = safes.length > 0 ? safes[0].id : "";
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
    const amountRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setTimeout(() => {
            amountRef.current?.focus();
            amountRef.current?.select();
        }, 50);

        // منع scroll الصفحة خلف الـ modal
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (amount <= 0 || loading) return;

        setLoading(true);
        setStatus(null);

        const result = await makePatientDebtPayment(
            patientId,
            amount,
            method,
            note || undefined,
            safeId || undefined
        );

        setLoading(false);

        if (result.success) {
            setStatus({
                type: "success",
                message: `تم تسجيل الدفعة بنجاح — ${formatIQD((result as any).paid ?? amount)}`,
            });
            router.refresh();
            setTimeout(onClose, 1400);
        } else {
            setStatus({ type: "error", message: result.message || "حدث خطأ غير متوقع" });
        }
    };

    return (
        /* Overlay — مُرسَم على document.body مباشرةً عبر portal */
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            dir="rtl"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60"
                onClick={onClose}
            />

            {/* Modal card */}
            <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header — ثابت */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-success/10 rounded-xl flex items-center justify-center">
                            <Banknote className="w-5 h-5 text-success" />
                        </div>
                        <div>
                            <p className="font-bold text-foreground text-sm">تسديد دفعة</p>
                            <p className="text-xs text-muted-foreground">{patientName}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body — قابل للتمرير */}
                <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
                    {/* الرصيد المستحق */}
                    <div className="flex items-center justify-between bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3">
                        <span className="text-sm text-muted-foreground">الرصيد المستحق</span>
                        <span className="font-bold text-destructive text-sm" dir="ltr">
                            {formatIQD(balance)}
                        </span>
                    </div>

                    {/* المبلغ */}
                    <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                            المبلغ المسدد
                        </label>
                        <div className="flex gap-2">
                            <input
                                ref={amountRef}
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(Number(e.target.value))}
                                min={1}
                                max={balance}
                                required
                                className="flex-1 border border-border rounded-xl px-4 py-2.5 text-sm bg-background text-foreground focus:ring-2 focus:ring-success/30 focus:border-success outline-none transition-colors"
                            />
                            <button
                                type="button"
                                onClick={() => setAmount(balance)}
                                className="px-3 py-2 text-xs font-bold bg-success/10 text-success border border-success/20 rounded-xl hover:bg-success/20 transition-colors whitespace-nowrap"
                            >
                                الكل
                            </button>
                        </div>
                        {amount > balance && (
                            <p className="text-xs text-destructive mt-1">المبلغ يتجاوز الرصيد المستحق</p>
                        )}
                    </div>

                    {/* طريقة الدفع */}
                    <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                            طريقة الدفع
                        </label>
                        <select
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                            className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background text-foreground focus:ring-2 focus:ring-success/30 focus:border-success outline-none transition-colors"
                        >
                            {Object.entries(METHOD_LABELS).map(([val, label]) => (
                                <option key={val} value={val}>{label}</option>
                            ))}
                        </select>
                    </div>

                    {/* ملاحظة */}
                    <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                            ملاحظة <span className="opacity-60">(اختياري)</span>
                        </label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="مثال: دفعة جزئية..."
                            className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background text-foreground placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-success/30 focus:border-success outline-none transition-colors"
                        />
                    </div>

                    {/* رسالة الحالة */}
                    {status && (
                        <div
                            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
                                status.type === "success"
                                    ? "bg-success/10 text-success border border-success/20"
                                    : "bg-destructive/10 text-destructive border border-destructive/20"
                            }`}
                        >
                            {status.type === "success"
                                ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                                : <AlertCircle className="w-4 h-4 shrink-0" />
                            }
                            {status.message}
                        </div>
                    )}
                </div>

                {/* Footer — ثابت */}
                <form onSubmit={handleSubmit} className="px-6 pb-5 pt-3 border-t border-border shrink-0">
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                        >
                            إلغاء
                        </button>
                        <button
                            type="submit"
                            disabled={loading || amount <= 0 || amount > balance}
                            className="flex-1 rounded-xl bg-success text-success-foreground py-2.5 text-sm font-bold hover:bg-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> جاري التسديد...</>
                            ) : (
                                `تسديد ${formatIQD(amount)}`
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function QuickPaymentModal(props: QuickPaymentModalProps) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;
    return createPortal(<ModalContent {...props} />, document.body);
}
