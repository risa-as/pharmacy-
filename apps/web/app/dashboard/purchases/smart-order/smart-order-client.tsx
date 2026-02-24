'use client';

import { useEffect, useState } from 'react';
import { getLowStockInventory, createSmartPurchase, getSuppliers } from '@/app/lib/actions/purchase-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Store } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
    branchId: string;
    isAdmin: boolean;
    branches: { id: string; name: string }[];
}

export default function SmartOrderClient({ branchId: initialBranchId, isAdmin, branches }: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<any[]>([]);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [selectedSupplier, setSelectedSupplier] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);

    // Admin State
    const [currentBranchId, setCurrentBranchId] = useState<string>(initialBranchId);

    useEffect(() => {
        loadData();
    }, [currentBranchId]);

    async function loadData() {
        setLoading(true);
        try {
            // If currentBranchId is "ALL", passing undefined to server action
            const targetBranch = currentBranchId === "ALL" ? undefined : currentBranchId;
            const [inventoryData, suppliersData] = await Promise.all([
                getLowStockInventory(targetBranch),
                getSuppliers()
            ]);
            setItems(inventoryData);
            setSuppliers(suppliersData);
            // Reset selection when data changes
            setSelectedItems(new Set());
        } catch (e) {
            console.error(e);
            toast.error('فشل في تحميل البيانات');
        } finally {
            setLoading(false);
        }
    }

    const handleCreateOrder = async () => {
        if (!selectedSupplier) {
            toast.error('يرجى اختيار المورد');
            return;
        }

        if (currentBranchId === "ALL") {
            toast.error('يرجى تحديد فرع معين لإنشاء الطلب');
            return;
        }

        const orderItems = items
            .filter(item => selectedItems.has(item.inventoryId))
            .map(item => ({
                drugId: item.drugId,
                quantity: item.suggestedQty,
                cost: item.cost
            }));

        if (orderItems.length === 0) {
            toast.error('يرجى اختيار عناصر للطلب');
            return;
        }

        setSubmitting(true);
        try {
            const result = await createSmartPurchase(currentBranchId, selectedSupplier, orderItems);
            if (result.success) {
                toast.success('تم إنشاء طلب الشراء بنجاح');
                router.push('/dashboard/purchases');
            } else {
                toast.error('حدث خطأ أثناء الإنشاء');
            }
        } catch (error) {
            toast.error('حدث خطأ غير متوقع');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedItems);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedItems(newSet);
    };

    return (
        <div className="space-y-6" dir="rtl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold mb-1">الطلب الذكي (Smart Purchasing)</h1>
                    <p className="text-sm text-muted-foreground">إنشاء طلبات شراء بناءً على نواقص المخزون</p>
                </div>

                <div className="flex flex-wrap gap-4 items-end">
                    {/* Admin Branch Select */}
                    {isAdmin && (
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-muted-foreground">الفرع</label>
                            <Select onValueChange={setCurrentBranchId} value={currentBranchId}>
                                <SelectTrigger className="w-[200px] h-10 bg-card">
                                    <div className="flex items-center gap-2">
                                        <Store className="w-4 h-4 text-muted-foreground" />
                                        <SelectValue placeholder="اختر الفرع" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">كل الفروع</SelectItem>
                                    {branches.map(b => (
                                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground">المورد</label>
                        <Select onValueChange={setSelectedSupplier} value={selectedSupplier}>
                            <SelectTrigger className="w-[200px] h-10 bg-card">
                                <SelectValue placeholder="اختر المورد" />
                            </SelectTrigger>
                            <SelectContent>
                                {suppliers.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name || 'مورد بدون اسم'}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex flex-col h-10 justify-end">
                        <Button
                            onClick={handleCreateOrder}
                            disabled={submitting || selectedItems.size === 0 || !selectedSupplier || currentBranchId === "ALL" || loading}
                            className="h-10 px-6"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    جاري المعالجة...
                                </>
                            ) : (
                                `إنشاء طلب شراء (${selectedItems.size})`
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {currentBranchId === "ALL" && (
                <div className="bg-yellow-50 text-yellow-800 p-3 rounded-lg text-sm border border-yellow-200">
                    ملاحظة: أنت تشاهد النواقص في جميع الفروع. لإنشاء طلب شراء، يرجى تحديد فرع معين من القائمة.
                </div>
            )}

            <div className="bg-card rounded-lg shadow border overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted">
                        <TableRow>
                            <TableHead className="w-[50px] text-right">
                                <input
                                    type="checkbox"
                                    className="rounded border-border text-primary focus:ring-blue-500"
                                    disabled={currentBranchId === "ALL"}
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedItems(new Set(items.map(i => i.inventoryId)));
                                        else setSelectedItems(new Set());
                                    }}
                                />
                            </TableHead>
                            <TableHead className="text-right font-bold text-foreground">الدواء</TableHead>
                            {currentBranchId === "ALL" && (
                                <TableHead className="text-right font-bold text-foreground">الفرع</TableHead>
                            )}
                            <TableHead className="text-right font-bold text-foreground">الرصيد الحالي</TableHead>
                            <TableHead className="text-right font-bold text-foreground">الحد الأدنى</TableHead>
                            <TableHead className="text-right font-bold text-foreground">الكمية المقترحة</TableHead>
                            <TableHead className="text-right font-bold text-foreground">التكلفة التقديرية</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={currentBranchId === "ALL" ? 7 : 6} className="text-center py-12">
                                    <div className="flex justify-center items-center gap-2 text-muted-foreground">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        <span>جاري تحميل البيانات...</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={currentBranchId === "ALL" ? 7 : 6} className="text-center py-12 text-muted-foreground">
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-lg font-medium">ممتاز! المخزون في حالة جيدة</span>
                                        <span className="text-sm">لا توجد مواد وصلت للحد الأدنى.</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            items.map((item) => (
                                <TableRow key={item.inventoryId} className="hover:bg-muted transition-colors">
                                    <TableCell>
                                        <input
                                            type="checkbox"
                                            className="rounded border-border text-primary focus:ring-blue-500 disabled:opacity-50"
                                            disabled={currentBranchId === "ALL"}
                                            checked={selectedItems.has(item.inventoryId)}
                                            onChange={() => toggleSelection(item.inventoryId)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-bold text-foreground">{item.drugName}</div>
                                        <div className="text-xs text-muted-foreground">{item.barcode}</div>
                                    </TableCell>
                                    {currentBranchId === "ALL" && (
                                        <TableCell className="text-sm text-muted-foreground">{item.branchName}</TableCell>
                                    )}
                                    <TableCell className="text-destructive font-bold">{item.currentStock}</TableCell>
                                    <TableCell className="font-mono">{item.minStock}</TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            disabled={currentBranchId === "ALL"}
                                            defaultValue={item.suggestedQty}
                                            className="w-24 h-9 font-bold text-center"
                                            onChange={(e) => {
                                                item.suggestedQty = parseInt(e.target.value) || 0;
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell className="font-mono font-bold text-foreground">{(item.suggestedQty * item.cost).toLocaleString()} د.ع</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
