"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2 } from "lucide-react";
import { initiateZainCashPayment } from "@/app/lib/actions/billing";

interface RenewButtonProps {
    organizationId: string;
    renewalMonths?: number;
}

/**
 * RenewButton — initiates a Zain Cash payment and redirects the user
 * to the Zain Cash hosted payment page.
 */
export default function RenewButton({
    organizationId,
    renewalMonths = 1,
}: RenewButtonProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleRenew() {
        setLoading(true);
        setError(null);

        try {
            const result = await initiateZainCashPayment(organizationId, renewalMonths);

            if (result.success) {
                router.push(result.payUrl);
            } else {
                setError(result.error);
                setLoading(false);
            }
        } catch {
            setError("حدث خطأ غير متوقع. يرجى المحاولة مجدداً.");
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
            <button
                onClick={handleRenew}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                dir="rtl"
            >
                {loading ? (
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                ) : (
                    <Zap className="w-4 h-4 shrink-0" />
                )}
                {loading ? "جاري التحويل إلى زين كاش..." : "تجديد الاشتراك عبر زين كاش"}
            </button>

            {error && (
                <p className="text-xs text-destructive text-right" dir="rtl">
                    {error}
                </p>
            )}
        </div>
    );
}
