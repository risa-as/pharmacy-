'use client';

import { useEffect, useMemo, useState } from 'react';
import { getLowStockInventory, createSmartPurchase, getSuppliers } from '@/app/lib/actions/purchase-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Store, AlertTriangle, ListChecks, Wallet, TrendingUp, Sparkles, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
    branchId: string;
    isAdmin: boolean;
    branches: { id: string; name: string }[];
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export default function SmartOrderClient({ branchId: initialBranchId, isAdmin, branches }: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<any[]>([]);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [selectedSupplier, setSelectedSupplier] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);
    const [currentBranchId, setCurrentBranchId] = useState<string>(initialBranchId);

    const isAllBranches = currentBranchId === 'ALL';

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentBranchId]);

    async function loadData() {
        setLoading(true);
        try {
            const targetBranch = currentBranchId === 'ALL' ? undefined : currentBranchId;
            const [inventoryData, suppliersData] = await Promise.all([
                getLowStockInventory(targetBranch),
                getSuppliers(),
            ]);
            setItems(inventoryData);
            setSuppliers(suppliersData);
            // Seed editable quantities from the smart suggestion, and reset selection.
            const q: Record<string, number> = {};
            for (const it of inventoryData as any[]) q[it.inventoryId] = it.suggestedQty;
            setQuantities(q);
            setSelectedItems(new Set());
        } catch (e) {
            console.error(e);
            toast.error('فشل في تحميل البيانات');
        } finally {
            setLoading(false);
        }
    }

    const getQty = (id: string) => quantities[id] ?? 0;
    const setQty = (id: string, value: number) =>
        setQuantities((prev) => ({ ...prev, [id]: Math.max(0, value) }));

    const toggleSelection = (id: string) => {
        setSelectedItems((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // Live grand total of the selected order — recomputes on quantity/selection change.
    const { selectedCount, grandTotal } = useMemo(() => {
        let total = 0;
        for (const it of items) {
            if (selectedItems.has(it.inventoryId)) total += getQty(it.inventoryId) * (it.cost || 0);
        }
        return { selectedCount: selectedItems.size, grandTotal: total };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, selectedItems, quantities]);

    const allVisibleSelected = items.length > 0 && selectedItems.size === items.length;

    const handleCreateOrder = async () => {
        if (isAllBranches) { toast.error('يرجى تحديد فرع معين لإنشاء الطلب'); return; }
        if (!selectedSupplier) { toast.error('يرجى اختيار المورد'); return; }

        const orderItems = items
            .filter((item: any) => selectedItems.has(item.inventoryId))
            .map((item: any) => ({ drugId: item.drugId, quantity: getQty(item.inventoryId), cost: item.cost }))
            .filter((i) => i.quantity > 0);

        if (orderItems.length === 0) { toast.error('يرجى اختيار عناصر بكميات صحيحة للطلب'); return; }

        setSubmitting(true);
        try {
            const result = await createSmartPurchase(currentBranchId, selectedSupplier, orderItems);
            if (result.success) {
                toast.success('تم إنشاء طلب الشراء بنجاح');
                router.push('/dashboard/purchases');
            } else {
                toast.error(result.error || 'حدث خطأ أثناء الإنشاء');
            }
        } catch {
            toast.error('حدث خطأ غير متوقع');
        } finally {
            setSubmitting(false);
        }
    };

    const colCount = isAllBranches ? 8 : 7;

    return (
        <div className="space-y-5" dir="rtl">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Sparkles className="h-6 w-6 text-primary" />
                        الطلب الذكي
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        كميات مقترحة تلقائياً بناءً على متوسط المبيعات اليومية × (مدة التوريد + مخزون الأمان).
                    </p>
                </div>

                <div className="flex flex-wrap gap-3 items-end">
                    {isAdmin && (
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-muted-foreground">الفرع</label>
                            <Select onValueChange={setCurrentBranchId} value={currentBranchId}>
                                <SelectTrigger className="w-[190px] h-10 bg-card">
                                    <div className="flex items-center gap-2">
                                        <Store className="w-4 h-4 text-muted-foreground" />
                                        <SelectValue placeholder="اختر الفرع" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">كل الفروع</SelectItem>
                                    {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground">المورد</label>
                        <Select onValueChange={setSelectedSupplier} value={selectedSupplier}>
                            <SelectTrigger className="w-[190px] h-10 bg-card">
                                <SelectValue placeholder="اختر المورد" />
                            </SelectTrigger>
                            <SelectContent>
                                {suppliers.length === 0 ? (
                                    <div className="px-3 py-2 text-xs text-muted-foreground">لا يوجد موردون</div>
                                ) : suppliers.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>{s.name || 'مورد بدون اسم'}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning"><AlertTriangle className="h-5 w-5" /></div>
                    <div>
                        <div className="text-lg font-bold leading-none font-mono">{items.length}</div>
                        <div className="text-xs text-muted-foreground mt-1">مواد بحاجة لإعادة طلب</div>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><ListChecks className="h-5 w-5" /></div>
                    <div>
                        <div className="text-lg font-bold leading-none font-mono">{selectedCount}</div>
                        <div className="text-xs text-muted-foreground mt-1">عناصر محددة</div>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500"><Wallet className="h-5 w-5" /></div>
                    <div>
                        <div className="text-lg font-bold leading-none font-mono">{fmt(grandTotal)} <span className="text-xs font-normal text-muted-foreground">د.ع</span></div>
                        <div className="text-xs text-muted-foreground mt-1">إجمالي الطلب المقدّر</div>
                    </div>
                </div>
            </div>

            {isAllBranches && (
                <div className="flex items-center gap-2 bg-warning/10 text-warning p-3 rounded-lg text-sm border border-warning/30">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    أنت تشاهد نواقص جميع الفروع. لإنشاء طلب شراء، اختر فرعاً معيناً من القائمة.
                </div>
            )}

            {/* Table */}
            <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted">
                        <TableRow>
                            <TableHead className="w-[44px] text-right">
                                <input
                                    type="checkbox"
                                    className="rounded border-border text-primary focus:ring-primary/40"
                                    disabled={isAllBranches || items.length === 0}
                                    checked={allVisibleSelected}
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedItems(new Set(items.map((i: any) => i.inventoryId)));
                                        else setSelectedItems(new Set());
                                    }}
                                />
                            </TableHead>
                            <TableHead className="text-right font-bold text-foreground">الدواء</TableHead>
                            {isAllBranches && <TableHead className="text-right font-bold text-foreground">الفرع</TableHead>}
                            <TableHead className="text-right font-bold text-foreground">الرصيد</TableHead>
                            <TableHead className="text-right font-bold text-foreground">الحد الأدنى</TableHead>
                            <TableHead className="text-right font-bold text-foreground">مبيعات ٣٠ يوم</TableHead>
                            <TableHead className="text-right font-bold text-foreground">الكمية المقترحة</TableHead>
                            <TableHead className="text-right font-bold text-foreground">التكلفة التقديرية</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={colCount} className="text-center py-14">
                                    <div className="flex justify-center items-center gap-2 text-muted-foreground">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        <span>جاري تحميل البيانات...</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={colCount} className="text-center py-14">
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                        <CheckCircle2 className="h-10 w-10 text-success/60" />
                                        <span className="text-base font-medium text-foreground">المخزون في حالة جيدة</span>
                                        <span className="text-sm">لا توجد مواد وصلت للحد الأدنى حالياً.</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            items.map((item: any) => {
                                const qty = getQty(item.inventoryId);
                                const selected = selectedItems.has(item.inventoryId);
                                return (
                                    <TableRow
                                        key={item.inventoryId}
                                        className={`transition-colors ${selected ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                                    >
                                        <TableCell>
                                            <input
                                                type="checkbox"
                                                className="rounded border-border text-primary focus:ring-primary/40 disabled:opacity-50"
                                                disabled={isAllBranches}
                                                checked={selected}
                                                onChange={() => toggleSelection(item.inventoryId)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-bold text-foreground">{item.drugName}</div>
                                            {item.barcode && <div className="text-xs text-muted-foreground font-mono" dir="ltr">{item.barcode}</div>}
                                        </TableCell>
                                        {isAllBranches && <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{item.branchName}</TableCell>}
                                        <TableCell>
                                            <span className="inline-flex items-center rounded-md bg-destructive/10 text-destructive font-bold px-2 py-0.5 font-mono">{item.currentStock}</span>
                                        </TableCell>
                                        <TableCell className="font-mono text-muted-foreground">{item.minStock}</TableCell>
                                        <TableCell>
                                            {item.totalSoldLast30Days > 0 ? (
                                                <div className="flex items-center gap-1.5">
                                                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                                                    <div>
                                                        <div className="font-mono font-medium text-foreground">{item.totalSoldLast30Days}</div>
                                                        <div className="text-[10px] text-muted-foreground">~{item.averageDailySales}/يوم</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">بدون مبيعات</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                min={0}
                                                disabled={isAllBranches}
                                                value={qty}
                                                className="w-24 h-9 font-bold text-center"
                                                onChange={(e) => setQty(item.inventoryId, parseInt(e.target.value) || 0)}
                                            />
                                        </TableCell>
                                        <TableCell className="font-mono font-bold text-foreground whitespace-nowrap">
                                            {fmt(qty * (item.cost || 0))} <span className="text-xs font-normal text-muted-foreground">د.ع</span>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>

                {/* Sticky action footer */}
                {!loading && items.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-3">
                        <div className="text-sm text-muted-foreground">
                            المحدد: <span className="font-bold text-foreground">{selectedCount}</span>
                            <span className="mx-2">·</span>
                            الإجمالي المقدّر: <span className="font-bold text-foreground font-mono">{fmt(grandTotal)} د.ع</span>
                        </div>
                        <Button
                            onClick={handleCreateOrder}
                            disabled={submitting || selectedCount === 0 || !selectedSupplier || isAllBranches}
                            className="h-10 px-6"
                        >
                            {submitting ? (
                                <><Loader2 className="ml-2 h-4 w-4 animate-spin" /> جاري المعالجة...</>
                            ) : (
                                `إنشاء طلب شراء (${selectedCount})`
                            )}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
