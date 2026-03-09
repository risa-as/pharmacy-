'use client';

import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';

export function StartStocktakeButton() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const startStocktake = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/inventory/stocktake', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: "بدء جرد جديد" }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to start stocktake');
            }

            toast.success('تم بدء جلسة جرد جديدة');
            router.push(`/dashboard/inventory/stocktakes/${data.stocktake.id}`);
            router.refresh();

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={startStocktake}
            disabled={loading}
            className={`flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            <span className="hidden md:block">{loading ? 'جاري التحضير...' : 'بدء جرد جديد'}</span>
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
