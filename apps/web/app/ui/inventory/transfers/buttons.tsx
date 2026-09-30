'use client';

import Link from 'next/link';
import { PackageOpen, ArrowUpRight, ArrowDownLeft, CheckCircle2, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
// sonner لا react-hot-toast: الجذر (app/layout.tsx) يركّب <Toaster/> الخاص بـ
// sonner فقط، فنداءات react-hot-toast كانت تُنفَّذ بصمت دون ظهور أي رسالة.
import { toast } from 'sonner';
import { StatusPill } from '@/app/ui/data-table';

export function StartTransferButton() {
    return (
        <Link
            href="/dashboard/inventory/transfers/create"
            className="flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
            <span className="hidden md:block ml-2">إنشاء تحويل جديد</span> <PackageOpen className="h-5 md:ml-0" />
        </Link>
    );
}

export function ReceiveTransferButton({ id, isReceiving }: { id: string, isReceiving?: boolean }) {
    const router = useRouter();

    const handleReceive = async () => {
        if (!confirm('هل أنت متأكد من استلام هذه الشحنة وإضافتها للمخزون؟ (لا يمكن التراجع عن هذه الخطوة)')) return;

        try {
            const res = await fetch(`/api/inventory/transfers/${id}/receive`, {
                method: 'PUT',
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'فشل استلام الشحنة');

            toast.success('تم الاستلام وتحديث الرصيد بنجاح!');
            router.refresh();
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    return (
        <button
            onClick={handleReceive}
            className={`whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${isReceiving ? 'border-success bg-success text-success-foreground hover:bg-success/90' : 'border-success/20 bg-success/10 text-success hover:bg-success/20'
                }`}
        >
            تأكيد الاستلام
        </button>
    );
}

// Visual status pill component
export function TransferStatus({ status }: { status: string }) {
    if (status === 'IN_TRANSIT') {
        return (
            <StatusPill tone="warning">
                <Clock className="w-3 h-3" />
                قيد النقل
            </StatusPill>
        );
    }
    if (status === 'COMPLETED') {
        return (
            <StatusPill tone="success">
                <CheckCircle2 className="w-3 h-3" />
                مستلمة
            </StatusPill>
        );
    }
    return <StatusPill tone="muted">{status}</StatusPill>;
}
