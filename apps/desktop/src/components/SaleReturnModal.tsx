import { useState, useMemo } from "react";
import { X, Undo2, AlertCircle, Search, Hash, Pill } from "lucide-react";
import { showAlert, showConfirm } from "../lib/dialog";

interface SaleReturnModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
}

export default function SaleReturnModal({ isOpen, onClose, user }: SaleReturnModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [searchMode, setSearchMode] = useState<"invoice" | "drug">("invoice");
    const [searchQuery, setSearchQuery] = useState("");
    const [sale, setSale] = useState<any>(null);
    const [drugSearchResults, setDrugSearchResults] = useState<any[] | null>(null);
    const [notes, setNotes] = useState("");
    const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
    const [errorMsg, setErrorMsg] = useState("");

    const returnedItems = useMemo(() => {
        const counts: Record<string, number> = {};
        if (sale?.returns) {
            sale.returns.forEach((r: any) => {
                r.items.forEach((item: any) => {
                    counts[item.drugId] = (counts[item.drugId] || 0) + item.quantity;
                });
            });
        }
        return counts;
    }, [sale]);

    const originallyReturnedAmount = useMemo(() => {
        return sale?.returns?.reduce((sum: number, r: any) => sum + (r.total || 0), 0) || 0;
    }, [sale]);

    if (!isOpen) return null;

    const handleModeChange = (mode: "invoice" | "drug") => {
        setSearchMode(mode);
        setSearchQuery("");
        setSale(null);
        setDrugSearchResults(null);
        setErrorMsg("");
        setReturnQuantities({});
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsLoading(true);
        setErrorMsg("");
        setSale(null);
        setDrugSearchResults(null);
        setReturnQuantities({});
        try {
            if (searchMode === "invoice") {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('search-sale', searchQuery.trim());
                if (res.success && res.sale) {
                    setSale(res.sale);
                } else {
                    setErrorMsg(res.error || "الفاتورة غير موجودة");
                }
            } else {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('search-sales-by-drug', {
                    query: searchQuery.trim(),
                    branchId: user?.branchId || null,
                });
                if (res.success) {
                    if (res.sales.length === 0) {
                        setErrorMsg("لا توجد فواتير تحتوي على هذا الدواء في آخر 30 يوم");
                    } else {
                        setDrugSearchResults(res.sales);
                    }
                } else {
                    setErrorMsg(res.error || "حدث خطأ أثناء البحث");
                }
            }
        } catch (error: any) {
            setErrorMsg(error.message || "حدث خطأ أثناء البحث");
        } finally {
            setIsLoading(false);
        }
    };

    const handleQuantityChange = (drugId: string, value: string, maxQty: number) => {
        const qty = parseInt(value) || 0;
        if (qty < 0 || qty > maxQty) return;
        setReturnQuantities(prev => ({ ...prev, [drugId]: qty }));
    };

    const totalReturnAmount = sale?.items?.reduce((acc: number, item: any) => {
        const returnQty = returnQuantities[item.drugId] || 0;
        return acc + (returnQty * item.price);
    }, 0) || 0;

    const hasItemsToReturn = Object.values(returnQuantities).some(qty => qty > 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!hasItemsToReturn) {
            setErrorMsg("يرجى تحديد عنصر واحد على الأقل للإرجاع");
            return;
        }

        const ok = await showConfirm({
            variant: "warning",
            title: "تأكيد الإرجاع",
            message: `هل أنت متأكد من إرجاع بضاعة بقيمة ${totalReturnAmount.toLocaleString()} د.ع؟`,
            actionLabel: "تأكيد الإرجاع",
        });
        if (!ok) return;

        setIsLoading(true);
        setErrorMsg("");
        try {
            const itemsToReturn = Object.keys(returnQuantities)
                .filter(drugId => returnQuantities[drugId] > 0)
                .map(drugId => ({
                    drugId,
                    quantity: returnQuantities[drugId],
                    price: sale.items.find((i: any) => i.drugId === drugId)?.price || 0
                }));

            // @ts-ignore
            const shiftStatus = await window.ipcRenderer.invoke('get-shift-status', { userId: user.id });
            const safeId = shiftStatus?.safeId || null;

            // @ts-ignore
            const res = await window.ipcRenderer.invoke('return-sale', {
                saleId: sale.id,
                items: itemsToReturn,
                notes,
                safeId: safeId,
                branchId: user.branchId
            });

            if (res.success) {
                void showAlert({ variant: "success", title: "تم الإرجاع بنجاح", autoCloseMs: 2000 });
                setReturnQuantities({});
                setNotes("");
                setSale(null);
                setSearchQuery("");
                setDrugSearchResults(null);
                onClose();
            } else {
                setErrorMsg(res.error || "حدث خطأ أثناء الإرجاع");
            }
        } catch (error: any) {
            setErrorMsg(error.message || "حدث خطأ غير متوقع");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn" dir="rtl">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-scaleIn border border-gray-200 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-red-50 text-red-700 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100/50 rounded-xl flex items-center justify-center">
                            <Undo2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">إرجاع بضاعة (مرتجعات)</h2>
                            <p className="text-xs mt-1 text-red-600/80">ابحث عن الفاتورة برقمها أو باسم الدواء</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-red-100 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search Mode Toggle + Search Bar */}
                <div className="p-5 border-b border-gray-100 bg-gray-50/50 shrink-0 space-y-3">
                    {/* Mode toggle */}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => handleModeChange("invoice")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors border ${searchMode === "invoice" ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"}`}
                        >
                            <Hash className="w-4 h-4" />
                            بحث برقم الفاتورة
                        </button>
                        <button
                            type="button"
                            onClick={() => handleModeChange("drug")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors border ${searchMode === "drug" ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"}`}
                        >
                            <Pill className="w-4 h-4" />
                            بحث باسم الدواء / الباركود
                        </button>
                    </div>

                    {/* Search input */}
                    <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute right-3 top-3 w-5 h-5 text-gray-400" />
                            <input
                                autoFocus
                                type="text"
                                placeholder={searchMode === "invoice" ? "رقم الفاتورة (مثال: POS-123...)" : "اسم الدواء أو الباركود..."}
                                className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-500 outline-none transition-all font-mono"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading || !searchQuery.trim()}
                            className="px-6 py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
                        >
                            {isLoading && !sale ? 'جاري البحث...' : 'بحث'}
                        </button>
                    </form>
                    {errorMsg && (
                        <div className="mt-1 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            {errorMsg}
                        </div>
                    )}
                </div>

                {/* Drug search results list */}
                {drugSearchResults && !sale && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        <p className="text-xs text-gray-500 mb-2">اختر الفاتورة المطلوبة ({drugSearchResults.length} نتيجة)</p>
                        {drugSearchResults.map((s: any) => {
                            const matchingDrugs = s.items
                                .filter((it: any) => it.drug?.tradeName?.toLowerCase().includes(searchQuery.toLowerCase()) || it.drug?.barcode?.includes(searchQuery))
                                .map((it: any) => it.drug?.tradeName)
                                .filter(Boolean)
                                .join("، ");
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => { setSale(s); setDrugSearchResults(null); setReturnQuantities({}); }}
                                    className="w-full text-right p-3 rounded-xl border border-gray-200 hover:border-red-400 hover:bg-red-50 transition-colors bg-white"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="font-bold text-gray-800 text-sm">
                                                {s.invoiceNumber || `#${s.id.slice(0, 8)}`}
                                            </span>
                                            {s.patient?.name && (
                                                <span className="text-xs text-gray-500 mr-2">— {s.patient.name}</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {new Date(s.createdAt).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}
                                            {" "}
                                            {new Date(s.createdAt).toLocaleTimeString('ar-IQ', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className="text-xs text-red-600 font-medium">{matchingDrugs}</span>
                                        <span className="text-xs text-gray-400">— {(s.total || 0).toLocaleString()} د.ع</span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${s.payment?.method === 'CREDIT' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                            {s.payment?.method === 'CREDIT' ? 'آجل' : 'نقدي'}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Sale details + return form */}
                {sale ? (
                    <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                        <div className="p-5 overflow-y-auto flex-1">
                            <div className="flex justify-between items-center mb-4 text-sm bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <div>
                                    <span className="text-gray-500">طريقة الدفع:</span>
                                    <span className={`font-bold ml-1 mr-2 px-2 py-0.5 rounded ${sale.payment?.method === 'CREDIT' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                        {sale.payment?.method === 'CREDIT' ? 'آجل' : 'نقدي'}
                                    </span>
                                </div>
                                <div className="flex gap-4">
                                    <div>
                                        <span className="text-gray-500">إجمالي أساسي:</span>
                                        <span className="font-bold text-gray-800 ml-1">{(sale.total || 0).toLocaleString()} د.ع</span>
                                    </div>
                                    {originallyReturnedAmount > 0 && (
                                        <>
                                            <div className="border-r border-gray-300 mx-2"></div>
                                            <div>
                                                <span className="text-gray-500">مرتجع سابقاً:</span>
                                                <span className="font-bold text-red-600 ml-1">{originallyReturnedAmount.toLocaleString()} د.ع</span>
                                            </div>
                                            <div className="border-r border-gray-300 mx-2"></div>
                                            <div>
                                                <span className="text-gray-500">الصافي:</span>
                                                <span className="font-bold text-blue-600 ml-1">{(sale.total - originallyReturnedAmount).toLocaleString()} د.ع</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="border border-gray-200 rounded-xl overflow-hidden mb-5">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-100 text-gray-700 font-bold">
                                        <tr>
                                            <th className="px-4 py-3 text-right">المادة</th>
                                            <th className="px-4 py-3 text-center">السعر</th>
                                            <th className="px-4 py-3 text-center">المتوفر للإرجاع</th>
                                            <th className="px-4 py-3 text-center w-32">الكمية المرجعة</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {sale.items?.map((item: any) => {
                                            const alreadyReturned = returnedItems[item.drugId] || 0;
                                            const maxReturnable = item.quantity - alreadyReturned;
                                            if (item.quantity <= 0) return null;

                                            return (
                                                <tr key={item.id} className={`hover:bg-gray-50 ${maxReturnable === 0 ? 'opacity-50' : ''}`}>
                                                    <td className="px-4 py-3 font-medium text-gray-800">
                                                        {item.drug?.tradeName || 'غير معروف'}
                                                        {alreadyReturned > 0 && <span className="block text-xs text-orange-600 mt-1">(تم إرجاع {alreadyReturned} سابقاً)</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-gray-600">{item.price.toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-center font-bold text-gray-700">{maxReturnable}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max={maxReturnable}
                                                            disabled={maxReturnable === 0 || isLoading}
                                                            value={returnQuantities[item.drugId] || ''}
                                                            onChange={(e) => handleQuantityChange(item.drugId, e.target.value, maxReturnable)}
                                                            className="w-full text-center py-1 border-gray-300 rounded focus:border-red-500 focus:ring-red-500 disabled:bg-gray-100"
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mb-2">
                                <label className="block text-sm font-medium text-gray-700 mb-2">سبب الإرجاع (اختياري)</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    disabled={isLoading}
                                    className="w-full rounded-xl border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-sm"
                                    rows={2}
                                    placeholder="مثال: خطأ في الصرف، أو رغبة العميل..."
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-5 border-t border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-700">المبلغ المسترد:</span>
                                <span className="text-xl font-black text-red-600">{totalReturnAmount.toLocaleString()} د.ع</span>
                            </div>
                            <div className="flex gap-3">
                                <button type="button" onClick={() => { setSale(null); setDrugSearchResults(null); }} className="px-5 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors font-medium">
                                    رجوع
                                </button>
                                <button
                                    type="submit"
                                    disabled={!hasItemsToReturn || isLoading}
                                    className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
                                >
                                    <Undo2 className="w-4 h-4" />
                                    تأكيد الإرجاع
                                </button>
                            </div>
                        </div>
                    </form>
                ) : !drugSearchResults ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-gray-400">
                        <Search className="w-16 h-16 mb-4 opacity-20" />
                        <p className="text-lg">
                            {searchMode === "invoice" ? "يرجى البحث عن فاتورة لعرض تفاصيلها" : "ابحث باسم الدواء لعرض الفواتير المرتبطة به"}
                        </p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
