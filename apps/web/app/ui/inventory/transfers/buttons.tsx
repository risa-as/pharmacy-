'use client';

import Link from 'next/link';
import { PackageOpen, ArrowUpRight, ArrowDownLeft, CheckCircle2, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

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
            className={`rounded-md px-3 py-1 text-sm font-bold transition-all ${isReceiving ? 'bg-success text-success-foreground hover:bg-success/90' : 'bg-success/10 text-success ring-1 ring-inset ring-success/20 hover:bg-success/20'
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
            <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-1 text-xs font-bold text-warning ring-1 ring-inset ring-warning/20">
                <Clock className="w-3 h-3 ml-1" />
                قيد النقل
            </span>
        );
    }
    if (status === 'COMPLETED') {
        return (
            <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-1 text-xs font-bold text-success ring-1 ring-inset ring-success/20">
                <CheckCircle2 className="w-3 h-3 ml-1" />
                مستلمة
            </span>
        );
    }
    return (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border/50">
            {status}
        </span>
    );
}
