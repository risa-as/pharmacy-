'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

type InventoryItem = {
    id: string;
    drugId: string;
    tradeName: string;
    barcode: string;
    cost: number;
    price: number;
    stock: number;
};

export default function BulkPricingClient({ inventory, suppliers }: { inventory: InventoryItem[], suppliers: any[] }) {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSupplier, setSelectedSupplier] = useState('');

    // Selection state
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [selectAll, setSelectAll] = useState(false);

    // Adjustment state
    const [adjustmentType, setAdjustmentType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
    const [adjustmentAction, setAdjustmentAction] = useState<'INCREASE' | 'DECREASE'>('INCREASE');
    const [adjustmentValue, setAdjustmentValue] = useState<number>(10);
    const [applyRounding, setApplyRounding] = useState(true);

    const [loading, setLoading] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    // Simulated supplier filtering based on names (if we had proper relations, it would be exact)
    // For now, it just filters all if no supplier is logic is hooked up deeply.
    // In a real scenario, we'd fetch items purchased from this supplier.
    // We will just use the search term for robust local filtering.
    const filteredInventory = useMemo(() => {
        let items = inventory;

        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            items = items.filter((item: any) =>
                item.tradeName.toLowerCase().includes(lowerSearch) ||
                item.barcode.includes(searchTerm)
            );
        }

        // If a supplier is selected but we don't have supplier tags on inventory items yet, 
        // we might not filter perfectly. But we keep the UI ready.

        return items;
    }, [inventory, searchTerm]);

    // Handle Checkboxes
    const handleSelectAll = () => {
        if (selectAll) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(filteredInventory.map((i: any) => i.id)));
        }
        setSelectAll(!selectAll);
    };

    const handleSelectItem = (id: string) => {
        const newSet = new Set(selectedItems);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedItems(newSet);
        if (newSet.size === filteredInventory.length && filteredInventory.length > 0) {
            setSelectAll(true);
        } else {
            setSelectAll(false);
        }
    };

    // Calculate Preview Price
    const calculateNewPrice = (oldPrice: number) => {
        if (!showPreview) return oldPrice;

        let newPrice = oldPrice;
        if (adjustmentType === 'PERCENTAGE') {
            const factor = adjustmentValue / 100;
            newPrice = adjustmentAction === 'INCREASE' ? newPrice * (1 + factor) : newPrice * (1 - factor);
        } else {
            newPrice = adjustmentAction === 'INCREASE' ? newPrice + adjustmentValue : newPrice - adjustmentValue;
        }

        newPrice = Math.max(0, newPrice);

        if (applyRounding) {
            newPrice = newPrice <= 0 ? 0 : Math.ceil(newPrice / 250) * 250;
        }

        return newPrice;
    };

    const handleSave = async () => {
        if (selectedItems.size === 0) {
            toast.error('يرجى تحديد منتج واحد على الأقل لتحديث سعره');
            return;
        }

        if (adjustmentValue <= 0) {
            toast.error('يجب أن تكون قيمة التعديل أكبر من صفر');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/inventory/bulk-price', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    inventoryIds: Array.from(selectedItems),
                    adjustmentType,
                    adjustmentAction,
                    adjustmentValue,
                    applyRounding
                }),
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'فشلت عملية التحديث');

            toast.success(`تم تحديث أسعار ${data.updatedCount} منتج بنجاح`);

            // Re-fetch to see new prices locally
            router.refresh();

            // Reset state
            setSelectedItems(new Set());
            setSelectAll(false);
            setShowPreview(false);

        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">

            {/* Control Panel */}
            <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <span>⚙️</span> إعدادات تغيير السعر
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    {/* Filters */}
                    <div className="col-span-1 md:col-span-2 space-y-2">
                        <label className="text-sm font-medium text-foreground">البحث للتصفية</label>
                        <input
                            type="text"
                            placeholder="ابحث بالاسم أو الباركود..."
                            className="w-full p-2.5 border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <hr className="my-4 border-border" />

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">نوع التعديل</label>
                        <select
                            className="w-full p-2.5 border border-border rounded-lg text-sm bg-muted outline-none focus:ring-2 focus:ring-primary"
                            value={adjustmentAction}
                            onChange={(e) => setAdjustmentAction(e.target.value as 'INCREASE' | 'DECREASE')}
                        >
                            <option value="INCREASE">زيادة السعر (+)</option>
                            <option value="DECREASE">تخفيض السعر (-)</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">المعيار الرئيسي</label>
                        <select
                            className="w-full p-2.5 border border-border rounded-lg text-sm bg-muted outline-none focus:ring-2 focus:ring-primary"
                            value={adjustmentType}
                            onChange={(e) => setAdjustmentType(e.target.value as 'PERCENTAGE' | 'FIXED')}
                        >
                            <option value="PERCENTAGE">نسبة مئوية (%)</option>
                            <option value="FIXED">مبلغ ثابت (د.ع)</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">قيمة التعديل</label>
                        <div className="relative">
                            <input
                                type="number"
                                min="1"
                                className="w-full p-2.5 border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary pl-12 font-bold"
                                value={adjustmentValue}
                                onChange={(e) => setAdjustmentValue(Number(e.target.value))}
                                dir="ltr"
                            />
                            <span className="absolute left-3 top-2.5 text-muted-foreground font-bold">
                                {adjustmentType === 'PERCENTAGE' ? '%' : 'د.ع'}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2 flex flex-col justify-center pt-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                className="w-5 h-5 rounded border-border text-primary focus:ring-primary"
                                checked={applyRounding}
                                onChange={(e) => setApplyRounding(e.target.checked)}
                            />
                            <span className="text-sm font-medium text-foreground">تقريب للأعلى لأقرب 250 د.ع</span>
                        </label>
                    </div>
                </div>

                <div className="mt-8 flex gap-4 justify-end">
                    <button
                        className={`px-6 py-2 rounded-lg font-bold transition-colors ${showPreview ? 'bg-warning/10 text-warning border border-warning/30' : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'}`}
                        onClick={() => setShowPreview(!showPreview)}
                    >
                        {showPreview ? 'إلغاء المعاينة' : '👁️ معاينة الأسعار الجديدة'}
                    </button>

                    <button
                        className="px-6 py-2 bg-primary text-primary-foreground font-bold rounded-lg shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                        onClick={handleSave}
                        disabled={loading || selectedItems.size === 0}
                    >
                        {loading ? 'جاري الحفظ...' : `حفظ وتحديث (${selectedItems.size}) منتج`}
                    </button>
                </div>
            </div>

            {/* Products Table */}
            <div className="bg-transparent rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border bg-card/50 flex justify-between items-center">
                    <h3 className="font-bold text-foreground">قائمة المنتجات المطابقة ({filteredInventory.length})</h3>
                    <span className="text-sm bg-primary/10 text-primary px-3 py-1 rounded-full font-bold">تم تحديد: {selectedItems.size}</span>
                </div>

                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-right text-sm">
                        <thead className="bg-card/50 sticky top-0 z-10 border-b border-border shadow-sm">
                            <tr>
                                <th className="p-4 w-12 text-center">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                                        checked={selectAll}
                                        onChange={handleSelectAll}
                                        disabled={filteredInventory.length === 0}
                                    />
                                </th>
                                <th className="p-3 font-medium text-muted-foreground">اسم المنتج</th>
                                <th className="p-3 font-medium text-muted-foreground">الباركود</th>
                                <th className="p-3 font-medium text-muted-foreground">الكمية بالمخزن</th>
                                <th className="p-3 font-medium text-muted-foreground">سعر التكلفة</th>
                                <th className="p-3 font-bold text-foreground">السعر الحالي (القديم)</th>
                                {showPreview && (
                                    <th className="p-3 font-black text-primary bg-primary/5 rounded-tl-lg">السعر الجديد (معاينة)</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredInventory.map((item: any) => {
                                const isSelected = selectedItems.has(item.id);
                                const newPrice = calculateNewPrice(item.price);
                                const priceChanged = newPrice !== item.price;

                                return (
                                    <tr key={item.id} className={`border-b border-border transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'}`}>
                                        <td className="p-4 text-center">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                                                checked={isSelected}
                                                onChange={() => handleSelectItem(item.id)}
                                            />
                                        </td>
                                        <td className="p-3 font-medium text-foreground">{item.tradeName}</td>
                                        <td className="p-3 text-muted-foreground font-mono text-xs">{item.barcode}</td>
                                        <td className="p-3 text-muted-foreground">
                                            <span className={item.stock <= 0 ? 'text-destructive font-bold' : ''}>{item.stock}</span>
                                        </td>
                                        <td className="p-3 text-muted-foreground font-mono" dir="ltr">{item.cost.toLocaleString()}</td>
                                        <td className={`p-3 font-bold font-mono ${showPreview && isSelected && priceChanged ? 'text-muted-foreground line-through' : 'text-foreground'}`} dir="ltr">
                                            {item.price.toLocaleString()}
                                        </td>
                                        {showPreview && (
                                            <td className="p-3 bg-primary/5 font-black font-mono" dir="ltr">
                                                {isSelected ? (
                                                    <span className={priceChanged ? (adjustmentAction === 'INCREASE' ? 'text-success' : 'text-warning') : 'text-foreground'}>
                                                        {newPrice.toLocaleString()} {priceChanged && adjustmentAction === 'INCREASE' && '⬆️'} {priceChanged && adjustmentAction === 'DECREASE' && '⬇️'}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}

                            {filteredInventory.length === 0 && (
                                <tr>
                                    <td colSpan={showPreview ? 7 : 6} className="p-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="text-4xl">🔍</span>
                                            <p>لا توجد منتجات مطابقة لعملية البحث</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
