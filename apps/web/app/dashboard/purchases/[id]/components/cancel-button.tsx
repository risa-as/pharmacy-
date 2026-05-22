'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelPurchase } from '@/app/lib/actions/purchase-actions';
import { Button } from '@/components/ui/button';
import { XCircle, Loader2 } from 'lucide-react';

export default function CancelPurchaseButton({
    purchaseId,
    size = 'sm',
}: {
    purchaseId: string;
    size?: 'sm' | 'default' | 'lg';
}) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleCancel = async () => {
        if (!confirm('هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.')) return;
        setLoading(true);
        try {
            const result = await cancelPurchase(purchaseId);
            if (result.success) {
                router.refresh();
            } else {
                alert(result.error || 'فشل في إلغاء الطلب');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            variant="destructive"
            size={size}
            onClick={handleCancel}
            disabled={loading}
        >
            {loading
                ? <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                : <XCircle className="w-4 h-4 ml-2" />
            }
            {loading ? 'جاري الإلغاء...' : 'إلغاء'}
        </Button>
    );
}
