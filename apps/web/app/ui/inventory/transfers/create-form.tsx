'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { PackagePlus, X, Search as SearchIcon } from 'lucide-react';

export default function CreateTransferForm({
    branches,
    availableStock
}: {
    branches: { id: string, name: string }[];
    availableStock: {
        drugId: string;
        tradeName: string;
        barcode: string;
        batchNumber: string;
        expiryDate: Date;
        availableQuantity: number;
        costPrice: number;
    }[];
}) {
    const router = useRouter();
    const [toBranchId, setToBranchId] = useState('');
    const [notes, setNotes] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedItems, setSelectedItems] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filter available stock based on search
    const filteredStock = availableStock.filter((item: any) =>
        item.tradeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.barcode.includes(searchQuery)
    ).slice(0, 10); // Show max 10 results at a time

    const handleAddItem = (stockItem: any) => {
        // Find if exists
        const exists = selectedItems.find((i: any) => i.drugId === stockItem.drugId && i.batchNumber === stockItem.batchNumber);
        if (exists) {
            toast.error('هذا المنتج بهذه الوجبة مضاف مسبقاً للقائمة');
            return;
        }

        setSelectedItems([...selectedItems, { ...stockItem, transferQuantity: 1 }]);
        setSearchQuery(''); // clear search
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...selectedItems];
        newItems.splice(index, 1);
        setSelectedItems(newItems);
    };

    const handleQuantityChange = (index: number, val: number) => {
        const max = selectedItems[index].availableQuantity;
        if (val < 1) val = 1;
        if (val > max) {
            toast.error(`الرصيد المتاح هو ${max} فقط`);
            val = max;
        }

        const newItems = [...selectedItems];
        newItems[index].transferQuantity = val;
        setSelectedItems(newItems);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!toBranchId) {
            toast.error('الرجاء اختيار الفرع المستلم');
            return;
        }

        if (selectedItems.length === 0) {
            toast.error('الرجاء إضافة دواء واحد على الأقل للتحويل');
            return;
        }

        setIsSubmitting(true);

        const payload = {
            toBranchId,
            notes,
            items: selectedItems.map((item: any) => ({
                drugId: item.drugId,
                batchNumber: item.batchNumber,
                expiryDate: item.expiryDate,
                quantity: item.transferQuantity,
                costPrice: item.costPrice
            }))
        };

        try {
            const res = await fetch('/api/inventory/transfers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'حدث خطأ أثناء الإرسال');

            toast.success('تم إرسال التحويل بنجاح');
            router.push('/dashboard/inventory/transfers?tab=outgoing');
            router.refresh();
        } catch (error: any) {
            toast.error(error.message);
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 leading-relaxed">
                <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">الفرع المستلم (الوجهة) <span className="text-destructive">*</span></label>
                    <select
                        value={toBranchId}
                        onChange={(e) => setToBranchId(e.target.value)}
                        className="peer block w-full rounded-md border border-border py-3 pl-3 pr-10 text-sm outline-2 placeholder:text-muted-foreground bg-muted"
                        required
                    >
                        <option value="" disabled>-- اختر الفرع المستلم --</option>
                        {branches.map((b: any) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">ملاحظات التحويل</label>
                    <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="معلومات إضافية عن سبب التحويل..."
                        className="peer block w-full rounded-md border border-border py-3 px-4 text-sm outline-2 placeholder:text-muted-foreground"
                    />
                </div>
            </div>

            <div className="border-t border-border pt-6">
                <h3 className="text-lg font-bold mb-4">قائمة الأدوية المحولة</h3>

                {/* Search Bar */}
                <div className="relative mb-4 w-full md:w-1/2">
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <SearchIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="ابحث عن دواء في رصيدك (الاسم أو الباركود)..."
                        className="block w-full rounded-md border border-border py-3 pr-10 pl-3 text-sm focus:border-ring focus:ring-ring"
                    />

                    {/* Search Results Dropdown */}
                    {searchQuery.length > 1 && (
                        <div className="absolute z-10 w-full mt-1 bg-card rounded-md shadow-lg border border-border max-h-60 overflow-auto">
                            {filteredStock.length > 0 ? (
                                filteredStock.map((item: any, idx: any) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => handleAddItem(item)}
                                        className="w-full text-right px-4 py-3 hover:bg-primary/10 border-b last:border-0 flex justify-between items-center"
                                    >
                                        <div>
                                            <p className="font-bold text-sm text-foreground">{item.tradeName}</p>
                                            <p className="text-xs text-muted-foreground">باركود: {item.barcode} | دفعة: {item.batchNumber}</p>
                                        </div>
                                        <div className="bg-success/10 text-success text-xs px-2 py-1 rounded font-bold">
                                            متاح: {item.availableQuantity}
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="p-4 text-sm text-muted-foreground text-center">لا توجد نتائج في رصيدك</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Selected Items Table */}
                {selectedItems.length > 0 ? (
                    <div className="border rounded-md overflow-hidden">
                        <table className="min-w-full text-right text-sm">
                            <thead className="bg-muted">
                                <tr>
                                    <th className="px-4 py-3">اسم الدواء</th>
                                    <th className="px-4 py-3">رقم الدفعة / وتاريخ الصلاحية</th>
                                    <th className="px-4 py-3 w-32">الكمية المحولة</th>
                                    <th className="px-4 py-3 w-16 text-center">حذف</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {selectedItems.map((item: any, idx: any) => (
                                    <tr key={idx} className="bg-card">
                                        <td className="px-4 py-3 font-bold">{item.tradeName}</td>
                                        <td className="px-4 py-3">
                                            <span className="font-mono text-muted-foreground bg-muted px-2 py-1 rounded text-xs ml-2">{item.batchNumber}</span>
                                            <span className="text-muted-foreground text-xs">تنتهي: {new Date(item.expiryDate).toLocaleDateString('en-GB')}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="number"
                                                min="1"
                                                max={item.availableQuantity}
                                                value={item.transferQuantity}
                                                onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value) || 1)}
                                                className="block w-full rounded-md border-border py-2 px-3 text-sm focus:border-ring focus:ring-ring text-center font-bold"
                                            />
                                            <p className="text-[10px] text-muted-foreground mt-1 text-center">أقصى حد: {item.availableQuantity}</p>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveItem(idx)}
                                                className="text-destructive hover:text-destructive p-1 rounded hover:bg-destructive/10"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="border-2 border-dashed rounded-md p-10 text-center text-muted-foreground bg-muted">
                        <PackagePlus className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                        ابحث عن الأدوية أعلاه لإضافتها لقائمة التحويل
                    </div>
                )}
            </div>

            <div className="mt-8 flex justify-end gap-4 border-t pt-6">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="rounded-lg px-6 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                    إلغاء
                </button>
                <button
                    type="submit"
                    disabled={isSubmitting || selectedItems.length === 0}
                    className="flex items-center rounded-lg bg-primary px-6 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? 'جاري إرسال التحويل...' : 'تأكيد إرسال الأدوية للفرع'}
                </button>
            </div>
        </form>
    );
}
