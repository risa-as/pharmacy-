'use client';

import { getPurchaseDetails, receivePurchase } from '@/app/lib/actions/purchase-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';

export default function ReceivePurchasePage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [purchase, setPurchase] = useState<any>(null);
    const [receivedItems, setReceivedItems] = useState<any>({});
    const [isPaid, setIsPaid] = useState(true);

    useEffect(() => {
        getPurchaseDetails(params.id).then((data) => {
            if (data) {
                setPurchase(data);
                // Initialize form with default Item quantities
                const initial: any = {};
                const todayStr = format(new Date(), 'yyyyMMdd');

                data.items.forEach((item: any, index: number) => {
                    initial[item.id] = {
                        quantity: item.quantity,
                        expiryDate: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), 'yyyy-MM-dd'), // Default 1 year expiry
                        batchNumber: `BAT-${todayStr}-${index + 1}`
                    };
                });
                setReceivedItems(initial);
            }
            setLoading(false);
        });
    }, [params.id]);

    const handleConfirm = async () => {
        try {
            const itemsToSubmit = Object.entries(receivedItems).map(([itemId, data]: [string, any]: any) => ({
                itemId,
                quantity: Number(data.quantity),
                expiryDate: new Date(data.expiryDate),
                batchNumber: data.batchNumber || 'BATCH-' + format(new Date(), 'yyyyMMdd')
            }));

            await receivePurchase(params.id, itemsToSubmit, isPaid);
            toast.success('تم استلام الطلب وتحديث المخزون بنجاح');
            router.push('/dashboard/purchases');
            router.refresh();
        } catch (error) {
            toast.error('حدث خطأ أثناء الاستلام');
            console.error(error);
            setLoading(false);
        }
    };

    if (loading) return (
        <div className="p-6 space-y-6" dir="rtl">
            <div className="h-8 w-1/3 bg-muted animate-pulse rounded-md"></div>
            <div className="bg-card rounded-lg shadow overflow-hidden border">
                <div className="h-12 bg-muted/50 border-b animate-pulse"></div>
                <div className="p-4 space-y-4">
                    {[1, 2, 3].map((i: any) => (
                        <div key={i} className="flex gap-4">
                            <div className="h-10 w-1/4 bg-muted animate-pulse rounded-md"></div>
                            <div className="h-10 w-1/4 bg-muted animate-pulse rounded-md"></div>
                            <div className="h-10 w-1/4 bg-muted animate-pulse rounded-md"></div>
                            <div className="h-10 w-1/4 bg-muted animate-pulse rounded-md"></div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
    if (!purchase) return <div>الطلب غير موجود</div>;
    if (purchase.status !== 'PENDING') return <div>هذا الطلب تم استلامه مسبقاً</div>;

    return (
        <div className="p-6 space-y-6" dir="rtl">
            <h1 className="text-2xl font-bold">استلام مواد الطلب #{purchase.id.slice(0, 8)}</h1>

            <div className="bg-card rounded-lg shadow overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="text-right">المادة</TableHead>
                            <TableHead className="text-right w-[150px]">الكمية المستلمة</TableHead>
                            <TableHead className="text-right w-[200px]">رقم العمل (Batch)</TableHead>
                            <TableHead className="text-right w-[200px]">تاريخ الانتهاء</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {purchase.items.map((item: any) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium">
                                    {item.drugName}
                                </TableCell>
                                <TableCell>
                                    <Input
                                        type="number"
                                        value={receivedItems[item.id]?.quantity}
                                        onChange={(e) => setReceivedItems((prev: any) => ({ ...prev, [item.id]: { ...prev[item.id], quantity: Number(e.target.value) } }))}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input
                                        placeholder="مثال: BAT-123"
                                        value={receivedItems[item.id]?.batchNumber}
                                        onChange={(e) => setReceivedItems((prev: any) => ({ ...prev, [item.id]: { ...prev[item.id], batchNumber: e.target.value } }))}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input
                                        type="date"
                                        value={receivedItems[item.id]?.expiryDate}
                                        onChange={(e) => setReceivedItems((prev: any) => ({ ...prev, [item.id]: { ...prev[item.id], expiryDate: e.target.value } }))}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <div className="bg-card p-4 rounded-lg shadow flex items-center gap-2 mb-4">
                <input
                    type="checkbox"
                    id="paid"
                    className="w-5 h-5"
                    checked={isPaid}
                    onChange={(e) => setIsPaid(e.target.checked)}
                />
                <label htmlFor="paid" className="font-bold cursor-pointer select-none">
                    تم الدفع نقداً (تسجيل مصروف بقيمة {purchase.total.toLocaleString()} د.ع)
                </label>
            </div>

            <Button onClick={handleConfirm} className="w-full h-12 text-lg">
                تأكيد واستلام المواد
            </Button>
        </div>
    );
}
