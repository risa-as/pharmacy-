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
    initialQuantity: number;
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
                            <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الدواء</th>
                            <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الفرع</th>
                            <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">المورد</th>
                            <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">رقم الدفعة</th>
                            <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">سعر الشراء</th>
                            <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الكمية</th>
                            <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">تاريخ الانتهاء</th>
                            <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">وقت الإدخال</th>
                            <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الحالة</th>
                            <th className="px-3 py-3 text-center font-medium font-cairo whitespace-nowrap">تعديل</th>
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
                                    <td className="px-3 py-3">
                                        <div className="max-w-[150px]">
                                            <p className="font-semibold text-foreground truncate" title={drug?.tradeName || undefined}>
                                                {drug?.tradeName || 'غير معروف'}
                                            </p>
                                            {drug?.barcode && (
                                                <p className="text-[10px] text-muted-foreground truncate" dir="ltr">{drug.barcode}</p>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-muted-foreground">
                                        <span className="block max-w-[90px] truncate" title={batch.inventory.branch?.name || undefined}>
                                            {batch.inventory.branch?.name || 'غير محدد'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 text-muted-foreground">
                                        {batch.supplier?.name ? (
                                            <span className="block max-w-[100px] truncate" title={batch.supplier.name}>
                                                {batch.supplier.name}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground/50">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground" dir="ltr">
                                        <span className="block max-w-[80px] truncate" title={batch.batchNumber}>
                                            {batch.batchNumber}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 font-bold text-foreground whitespace-nowrap" dir="ltr">
                                        {formatCurrency(batch.costPrice)}
                                    </td>
                                    <td className="px-3 py-3">
                                        {(() => {
                                            // Rows created before initialQuantity existed (or found in stocktake)
                                            // can have initial < quantity — treat remaining as the floor.
                                            const totalQty = Math.max(batch.initialQuantity, batch.quantity);
                                            const consumed = totalQty - batch.quantity;
                                            const consumedPct = totalQty > 0
                                                ? Math.min(100, Math.round((consumed / totalQty) * 100))
                                                : 0;
                                            return (
                                                <div className="min-w-[105px] space-y-1">
                                                    <div className="flex items-baseline gap-1">
                                                        <span className="font-bold text-foreground">{batch.quantity}</span>
                                                        <span className="text-[10px] text-muted-foreground">متبقي</span>
                                                    </div>
                                                    <div className="h-1 w-full max-w-[90px] rounded-sm bg-muted overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-sm ${consumedPct >= 100 ? 'bg-destructive' : 'bg-primary'}`}
                                                            style={{ width: `${consumedPct}%` }}
                                                        />
                                                    </div>
                                                    <p className="text-[11px] text-muted-foreground leading-tight">
                                                        الكلية: <span className="font-semibold text-foreground">{totalQty}</span>
                                                        {' · '}
                                                        المستهلك: <span className="font-semibold text-foreground">{consumed}</span>
                                                    </p>
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap" dir="ltr">
                                        {expiryDate.toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}
                                    </td>
                                    <td className="px-3 py-3">
                                        <div className="text-xs text-muted-foreground leading-tight whitespace-nowrap" dir="ltr">
                                            <div>{new Date(batch.createdAt).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}</div>
                                            <div className="text-[10px] text-muted-foreground/60">{new Date(batch.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' })}</div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3">
                                        <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-bold ${statusClass}`}>
                                            {statusText}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                        <button
                                            onClick={() => handleEdit(batch)}
                                            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-colors"
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
