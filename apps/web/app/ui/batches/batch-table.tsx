'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { formatCurrency } from '@/app/lib/utils/currency';
import EditBatchModal from './edit-batch-modal';

interface BatchRow {
    id: string;
    batchNumber: string;
    costPrice: number;
    quantity: number;
    expiryDate: string;
    createdAt: string;
    supplierId: string | null;
    inventory: {
        branch: { name: string } | null;
        drug: { id: string; tradeName: string; barcode: string | null } | null;
    };
    supplier: { name: string } | null;
}

interface Supplier {
    id: string;
    name: string;
}

interface BatchTableProps {
    batches: BatchRow[];
    currentPage: number;
    pageSize: number;
}

export default function BatchTable({ batches, currentPage, pageSize }: BatchTableProps) {
    const router = useRouter();
    const [editBatch, setEditBatch] = useState<any>(null);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Load suppliers when modal opens
    useEffect(() => {
        if (editBatch) {
            fetch('/api/suppliers')
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data)) setSuppliers(data);
                })
                .catch(() => {});
        }
    }, [editBatch]);

    const handleEdit = (batch: BatchRow) => {
        setEditBatch({
            id: batch.id,
            batchNumber: batch.batchNumber,
            costPrice: batch.costPrice,
            quantity: batch.quantity,
            expiryDate: batch.expiryDate,
            supplierId: batch.supplierId,
            drugName: batch.inventory.drug?.tradeName || 'غير معروف',
        });
    };

    const handleSaved = () => {
        setEditBatch(null);
        router.refresh();
    };

    return (
        <>
            <table className="w-full">
                <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
                    <tr>
                        <th className="px-4 py-3 text-center font-bold w-12">#</th>
                        <th className="px-4 py-3 text-right font-bold">الدواء</th>
                        <th className="px-4 py-3 text-right font-bold">الفرع</th>
                        <th className="px-4 py-3 text-right font-bold">المورد</th>
                        <th className="px-4 py-3 text-right font-bold">رقم الدفعة</th>
                        <th className="px-4 py-3 text-right font-bold">سعر الشراء (للوحدة)</th>
                        <th className="px-4 py-3 text-right font-bold">الكمية</th>
                        <th className="px-4 py-3 text-right font-bold">تاريخ الانتهاء</th>
                        <th className="px-4 py-3 text-right font-bold">وقت الإدخال</th>
                        <th className="px-4 py-3 text-right font-bold">الحالة</th>
                        <th className="px-4 py-3 text-center font-bold w-16">تعديل</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {batches.map((batch, index) => {
                        const drug = batch.inventory.drug;
                        const expiryDate = new Date(batch.expiryDate);
                        const isExpired = expiryDate < now;
                        const isExpiringSoon = expiryDate >= now && expiryDate <= thirtyDaysFromNow;

                        let statusClass = 'bg-success/10 text-success';
                        let statusText = 'صالح';
                        if (isExpired) {
                            statusClass = 'bg-destructive/10 text-destructive';
                            statusText = 'منتهي';
                        } else if (isExpiringSoon) {
                            statusClass = 'bg-warning/20 text-warning';
                            statusText = 'قريب الانتهاء';
                        }

                        return (
                            <tr key={batch.id} className="hover:bg-muted">
                                <td className="px-4 py-3 text-center text-sm text-muted-foreground font-mono">
                                    {(currentPage - 1) * pageSize + index + 1}
                                </td>
                                <td className="px-4 py-3 font-medium text-foreground">
                                    {drug?.tradeName || 'غير معروف'}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    {batch.inventory.branch?.name || 'غير محدد'}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    {batch.supplier?.name || <span className="text-muted-foreground/50">—</span>}
                                </td>
                                <td className="px-4 py-3 font-mono text-sm text-muted-foreground">
                                    {batch.batchNumber}
                                </td>
                                <td className="px-4 py-3 font-bold text-foreground text-right">
                                    <span dir="ltr">{formatCurrency(batch.costPrice)}</span>
                                </td>
                                <td className="px-4 py-3 font-bold text-foreground">
                                    {batch.quantity}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    {expiryDate.toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="text-xs text-muted-foreground leading-tight">
                                        <div>{new Date(batch.createdAt).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}</div>
                                        <div className="text-[10px] text-muted-foreground/60">{new Date(batch.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' })}</div>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${statusClass}`}>
                                        {statusText}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <button
                                        onClick={() => handleEdit(batch)}
                                        className="p-1.5 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                                        title="تعديل الدفعة"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <EditBatchModal
                batch={editBatch}
                suppliers={suppliers}
                onClose={() => setEditBatch(null)}
                onSaved={handleSaved}
            />
        </>
    );
}
