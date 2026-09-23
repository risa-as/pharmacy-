'use client';

import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
// sonner لا react-hot-toast: الجذر (app/layout.tsx) يركّب <Toaster/> الخاص بـ
// sonner فقط، فنداءات react-hot-toast كانت تُنفَّذ بصمت دون ظهور أي رسالة.
import { toast } from 'sonner';

export function StartStocktakeButton({ branchId }: { branchId?: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const [isNavigating, startNavigation] = useTransition();
    const submitting = useRef(false);
    const busy = loading || isNavigating;

    const startStocktake = async () => {
        if (submitting.current || isNavigating) return;
        submitting.current = true;
        setLoading(true);
        try {
            const res = await fetch('/api/inventory/stocktake', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ branchId, notes: "بدء جرد جديد" }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to start stocktake');
            }

            if (!data.stocktake?.id) throw new Error('تعذر فتح جلسة الجرد');
            toast.success(data.stocktake.status === 'REVIEW' ? 'فتح الجرد الذي ينتظر اعتماد المدير' : 'جارٍ فتح جلسة الجرد');
            // Keep the transition pending until the destination renders. Refreshing
            // immediately after push can compete with navigation on the current route.
            startNavigation(() => {
                router.push(`/dashboard/inventory/stocktakes/${encodeURIComponent(data.stocktake.id)}`);
            });

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            submitting.current = false;
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={startStocktake}
            disabled={busy}
            aria-busy={busy}
            className={`flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${busy ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            <span>{busy ? (isNavigating ? 'جاري فتح الجرد...' : 'جاري التحضير...') : 'بدء جرد جديد'}</span>
            <PlusIcon className="h-5 w-5 md:ml-4" />
        </button>
    );
}

export function CancelStocktakeButton({ stocktakeId }: { stocktakeId: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleCancel = async () => {
        if (!confirm('هل أنت متأكد من إلغاء هذا الجرد؟ سيتم حذف جميع البيانات المُدخلة.')) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/inventory/stocktake/${stocktakeId}`, {
                method: 'DELETE',
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'فشل الإلغاء');

            toast.success('تم إلغاء الجرد بنجاح');
            router.refresh();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleCancel}
            disabled={loading}
            title="إلغاء الجرد"
            className={`rounded-md border border-destructive/20 bg-destructive/10 p-2 text-destructive hover:bg-destructive/20 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            <XMarkIcon className="w-5 h-5" />
        </button>
    );
}
