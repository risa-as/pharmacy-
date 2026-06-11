'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Box } from 'lucide-react';
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
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                        <tr>
                            <th className="px-6 py-3.5 text-right font-medium font-cairo">الدواء</th>
                            <th className="px-6 py-3.5 text-right font-medium font-cairo">الفرع</th>
                            <th className="px-6 py-3.5 text-right font-medium font-cairo">المورد</th>
                            <th className="px-6 py-3.5 text-right font-medium font-cairo">رقم الدفعة</th>
                            <th className="px-6 py-3.5 text-right font-medium font-cairo">سعر الشراء</th>
                            <th className="px-6 py-3.5 text-right font-medium font-cairo">الكمية</th>
                            <th className="px-6 py-3.5 text-right font-medium font-cairo">تاريخ الانتهاء</th>
                            <th className="px-6 py-3.5 text-right font-medium font-cairo">وقت الإدخال</th>
                            <th className="px-6 py-3.5 text-right font-medium font-cairo">الحالة</th>
                            <th className="px-6 py-3.5 text-center font-medium font-cairo">تعديل</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                        {batches.map((batch) => {
                            const drug = batch.inventory.drug;
                            const expiryDate = new Date(batch.expiryDate);
                            const isExpired = expiryDate < now;
                            const isExpiringSoon = expiryDate >= now && expiryDate <= thirtyDaysFromNow;

                            let statusClass = 'bg-success/10 text-success border-success/20';
                            let statusText = 'صالح';
                            if (isExpired) {
                                statusClass = 'bg-destructive/10 text-destructive border-destructive/20';
                                statusText = 'منتهي';
                            } else if (isExpiringSoon) {
                                statusClass = 'bg-warning/10 text-warning border-warning/20';
                                statusText = 'قريب الانتهاء';
                            }

                            return (
                                <tr key={batch.id} className="hover:bg-muted/40 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                                                <Box className="w-4 h-4 text-primary" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-foreground truncate">{drug?.tradeName || 'غير معروف'}</p>
                                                {drug?.barcode && (
                                                    <p className="text-xs text-muted-foreground" dir="ltr">{drug.barcode}</p>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-muted-foreground">
                                        {batch.inventory.branch?.name || 'غير محدد'}
                                    </td>
                                    <td className="px-6 py-4 text-muted-foreground">
                                        {batch.supplier?.name || <span className="text-muted-foreground/50">—</span>}
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground" dir="ltr">
                                        {batch.batchNumber}
                                    </td>
                                    <td className="px-6 py-4 font-bold text-foreground" dir="ltr">
                                        {formatCurrency(batch.costPrice)}
                                    </td>
                                    <td className="px-6 py-4 font-bold text-foreground">
                                        {batch.quantity}
                                    </td>
                                    <td className="px-6 py-4 text-muted-foreground" dir="ltr">
                                        {expiryDate.toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-xs text-muted-foreground leading-tight" dir="ltr">
                                            <div>{new Date(batch.createdAt).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}</div>
                                            <div className="text-[10px] text-muted-foreground/60">{new Date(batch.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' })}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold ${statusClass}`}>
                                            {statusText}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button
                                            onClick={() => handleEdit(batch)}
                                            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-colors"
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
            </div>

            <EditBatchModal
                batch={editBatch}
                suppliers={suppliers}
                onClose={() => setEditBatch(null)}
                onSaved={handleSaved}
            />
        </>
    );
}
