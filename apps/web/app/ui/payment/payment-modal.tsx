"use client";

import { useState } from "react";
import { CreditCard, Smartphone, DollarSign, X, CheckCircle } from "lucide-react";
import StripePaymentButton from "./stripe-button";
import ZainCashButton from "./zaincash-button";

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    amount: number;
    saleId: string;
    onPaymentComplete?: (method: string) => void;
}

export default function PaymentModal({
    isOpen,
    onClose,
    amount,
    saleId,
    onPaymentComplete,
}: PaymentModalProps) {
    const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
    const [paymentSuccess, setPaymentSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSuccess = () => {
        setPaymentSuccess(true);
        setTimeout(() => {
            onPaymentComplete?.(selectedMethod || "unknown");
            onClose();
        }, 2000);
    };

    const handleError = (errorMessage: string) => {
        setError(errorMessage);
    };

    const handleCashPayment = () => {
        // Cash payment is handled directly
        onPaymentComplete?.("CASH");
        onClose();
    };

    if (paymentSuccess) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-card rounded-2xl p-8 max-w-md w-full mx-4 text-center">
                    <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-8 h-8 text-success" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">تم الدفع بنجاح!</h2>
                    <p className="text-muted-foreground">سيتم إغلاق النافذة تلقائياً...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-2xl max-w-lg w-full mx-4 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold">اختر طريقة الدفع</h2>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-card/20 rounded-lg transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                    <div className="mt-4 text-center">
                        <p className="text-blue-100 text-sm">المبلغ المطلوب</p>
                        <p className="text-4xl font-bold">{amount.toFixed(2)}</p>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {error && (
                        <div className="bg-destructive/10 border border-red-200 text-destructive px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {/* Cash Payment */}
                    <button
                        onClick={handleCashPayment}
                        className="flex items-center gap-4 w-full p-4 bg-muted hover:bg-muted rounded-xl border-2 border-transparent hover:border-border transition-all"
                    >
                        <div className="w-12 h-12 bg-success/10 rounded-xl flex items-center justify-center">
                            <DollarSign className="w-6 h-6 text-success" />
                        </div>
                        <div className="text-right">
                            <p className="font-bold text-foreground">الدفع نقداً</p>
                            <p className="text-sm text-muted-foreground">استلام المبلغ يدوياً</p>
                        </div>
                    </button>

                    {/* Stripe Payment */}
                    <div className="border-2 border-blue-200 rounded-xl p-4 bg-primary/10">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                                <CreditCard className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <p className="font-bold text-foreground">البطاقة البنكية</p>
                                <p className="text-xs text-muted-foreground">Visa, Mastercard</p>
                            </div>
                        </div>
                        <StripePaymentButton
                            amount={amount}
                            saleId={saleId}
                            onSuccess={handleSuccess}
                            onError={handleError}
                        />
                    </div>

                    {/* Zain Cash Payment */}
                    <div className="border-2 border-green-200 rounded-xl p-4 bg-success/10">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-success rounded-lg flex items-center justify-center">
                                <Smartphone className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <p className="font-bold text-foreground">Zain Cash</p>
                                <p className="text-xs text-muted-foreground">محفظة زين كاش الإلكترونية</p>
                            </div>
                        </div>
                        <ZainCashButton
                            amount={amount}
                            saleId={saleId}
                            description={`دفع فاتورة رقم ${saleId}`}
                            onSuccess={handleSuccess}
                            onError={handleError}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-muted px-6 py-4 text-center">
                    <p className="text-xs text-muted-foreground">
                        🔒 جميع المعاملات مشفرة وآمنة
                    </p>
                </div>
            </div>
        </div>
    );
}
