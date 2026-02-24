"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { createStripePaymentIntent, confirmStripePayment } from "@/app/lib/actions/stripe";

interface StripePaymentButtonProps {
    amount: number;
    saleId: string;
    onSuccess?: () => void;
    onError?: (error: string) => void;
}

export default function StripePaymentButton({
    amount,
    saleId,
    onSuccess,
    onError,
}: StripePaymentButtonProps) {
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [cardNumber, setCardNumber] = useState("");
    const [expiry, setExpiry] = useState("");
    const [cvc, setCvc] = useState("");

    const handlePayment = async () => {
        setLoading(true);
        try {
            // Create payment intent
            const result = await createStripePaymentIntent(amount, saleId);

            if ("error" in result) {
                onError?.(result.error);
                setLoading(false);
                return;
            }

            // In a real implementation, you would use Stripe Elements here
            // For testing, we'll simulate a successful payment
            const confirmResult = await confirmStripePayment(result.paymentIntentId, saleId);

            if ("success" in confirmResult && confirmResult.success) {
                onSuccess?.();
            } else if ("error" in confirmResult) {
                onError?.(confirmResult.error);
            }
        } catch (error: any) {
            onError?.(error.message || "فشل الدفع");
        } finally {
            setLoading(false);
            setShowForm(false);
        }
    };

    if (showForm) {
        return (
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                <h3 className="font-bold text-foreground flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-primary" />
                    الدفع بالبطاقة
                </h3>

                <div className="space-y-3">
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                            رقم البطاقة
                        </label>
                        <input
                            type="text"
                            placeholder="4242 4242 4242 4242"
                            value={cardNumber}
                            onChange={(e) => setCardNumber(e.target.value)}
                            className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                            dir="ltr"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">
                                تاريخ الانتهاء
                            </label>
                            <input
                                type="text"
                                placeholder="MM/YY"
                                value={expiry}
                                onChange={(e) => setExpiry(e.target.value)}
                                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                                dir="ltr"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">
                                CVC
                            </label>
                            <input
                                type="text"
                                placeholder="123"
                                value={cvc}
                                onChange={(e) => setCvc(e.target.value)}
                                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                                dir="ltr"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={handlePayment}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                جارٍ الدفع...
                            </>
                        ) : (
                            <>
                                <CreditCard className="w-4 h-4" />
                                ادفع {amount.toFixed(2)}
                            </>
                        )}
                    </button>
                    <button
                        onClick={() => setShowForm(false)}
                        className="px-4 py-3 bg-muted hover:bg-muted text-foreground font-bold rounded-lg transition-colors"
                    >
                        إلغاء
                    </button>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                    🔒 مدفوعات آمنة عبر Stripe
                </p>
            </div>
        );
    }

    return (
        <button
            onClick={() => setShowForm(true)}
            className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-bold py-3 px-4 rounded-lg transition-all"
        >
            <CreditCard className="w-5 h-5" />
            الدفع بالبطاقة (Stripe)
        </button>
    );
}
