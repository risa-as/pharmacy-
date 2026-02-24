"use client";

import { useState } from "react";
import { makeDebtPayment } from "@/app/lib/actions/debt";
import { createZainCashTransaction } from "@/app/lib/actions/zaincash";

interface DebtPaymentFormProps {
    saleId: string;
    patientId: string;
    remaining: number;
    safes: any[];
}

function formatIQD(amount: number) {
    return new Intl.NumberFormat("ar-IQ").format(Math.round(amount)) + " د.ع";
}

export default function DebtPaymentForm({ saleId, patientId, remaining, safes }: DebtPaymentFormProps) {
    const [amount, setAmount] = useState(remaining);
    const [method, setMethod] = useState("CASH");
    const [note, setNote] = useState("");
    const [safeId, setSafeId] = useState(safes.length > 0 ? safes[0].id : "");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (amount <= 0) return;

        setLoading(true);
        setError("");

        try {
            if (method === "ZAIN_CASH") {
                const result = await createZainCashTransaction(amount, saleId, "debt_payment");
                if ("error" in result) {
                    setError(result.error);
                } else {
                    // Redirect to payment
                    window.location.href = result.redirectUrl;
                    return; // Don't stop loading
                }
            } else {
                const result = await makeDebtPayment(saleId, patientId, amount, method, note, safeId);

                if (result.success) {
                    window.location.reload();
                } else {
                    setError(result.message || "حدث خطأ");
                }
            }
        } catch (err: any) {
            setError(err.message || "حدث خطأ غير متوقع");
        }

        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="bg-success/10 border border-green-200 rounded-xl p-4 mt-3 space-y-3">
            <h4 className="text-sm font-bold text-success">تسديد دفعة</h4>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">المبلغ</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(Number(e.target.value))}
                        max={remaining}
                        min={1}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none"
                    />
                    <p className="text-xs text-muted-foreground mt-1">المتبقي: {formatIQD(remaining)}</p>
                </div>
                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">طريقة الدفع</label>
                    <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none"
                    >
                        <option value="CASH">نقدي</option>
                        <option value="CARD">بطاقة</option>
                        <option value="BANK_TRANSFER">تحويل بنكي</option>
                        <option value="ZAIN_CASH">زين كاش</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">إيداع في الصندوق</label>
                    <select
                        value={safeId}
                        onChange={(e) => setSafeId(e.target.value)}
                        required
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none"
                    >
                        {safes.map((safe) => (
                            <option key={safe.id} value={safe.id}>
                                {safe.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">ملاحظة (اختياري)</label>
                    <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="مثال: دفعة جزئية..."
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none"
                    />
                </div>
            </div>

            {error && <p className="text-destructive text-xs mt-3">{error}</p>}

            <div className="flex gap-2">
                <button
                    type="submit"
                    disabled={loading || amount <= 0}
                    className="flex-1 bg-success text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? "جاري التسديد..." : `تسديد ${formatIQD(amount)}`}
                </button>
                <button
                    type="button"
                    onClick={() => setAmount(remaining)}
                    className="px-3 py-2 bg-success/10 text-success rounded-lg text-xs font-medium hover:bg-green-200 transition-colors"
                >
                    الكل
                </button>
            </div>
        </form>
    );
}
