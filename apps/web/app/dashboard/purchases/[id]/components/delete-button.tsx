'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deletePurchase } from '@/app/lib/actions/purchase-actions';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';

export default function DeletePurchaseButton({
    purchaseId,
    size = 'sm',
    redirectAfter,
}: {
    purchaseId: string;
    size?: 'sm' | 'default' | 'lg';
    redirectAfter?: string;
}) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleDelete = async () => {
        if (!confirm('هل أنت متأكد من حذف هذا الطلب نهائياً؟ لا يمكن التراجع عن هذا الإجراء.')) return;
        setLoading(true);
        try {
            const result = await deletePurchase(purchaseId);
            if (result.success) {
                if (redirectAfter) {
                    router.push(redirectAfter);
                } else {
                    router.refresh();
                }
            } else {
                alert(result.error || 'فشل في حذف الطلب');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            variant="destructive"
            size={size}
            onClick={handleDelete}
            disabled={loading}
        >
            {loading
                ? <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                : <Trash2 className="w-4 h-4 ml-2" />
            }
            {loading ? 'جاري الحذف...' : 'حذف'}
        </Button>
    );
}
