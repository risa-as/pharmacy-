"use client";

import { useState } from "react";
import { Smartphone, Loader2, ExternalLink } from "lucide-react";
import { createZainCashTransaction } from "@/app/lib/actions/zaincash";

interface ZainCashButtonProps {
    amount: number;
    saleId: string;
    description?: string;
    onSuccess?: () => void;
    onError?: (error: string) => void;
}

export default function ZainCashButton({
    amount,
    saleId,
    description,
    onSuccess,
    onError,
}: ZainCashButtonProps) {
    const [loading, setLoading] = useState(false);

    const handlePayment = async () => {
        setLoading(true);
        try {
            const result = await createZainCashTransaction(amount, saleId, description || "pharmacy_payment");

            if ("error" in result) {
                onError?.(result.error);
                setLoading(false);
                return;
            }

            // Redirect to Zain Cash payment page
            window.location.href = result.redirectUrl;
        } catch (error: any) {
            onError?.(error.message || "فشل إنشاء المعاملة");
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handlePayment}
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-3 px-4 rounded-lg transition-all disabled:opacity-50"
        >
            {loading ? (
                <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    جارٍ التحويل...
                </>
            ) : (
                <>
                    <Smartphone className="w-5 h-5" />
                    الدفع عبر Zain Cash
                    <ExternalLink className="w-4 h-4 opacity-70" />
                </>
            )}
        </button>
    );
}
