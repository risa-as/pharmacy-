"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { addBatch } from "@/app/lib/actions/inventory";
import ExpiryDateField, { checkExpiry } from "./expiry-date-field";
import { useConfirm } from "../confirm-dialog";

interface Supplier { id: string; name: string; }

interface AddBatchModalProps {
    inventoryId: string;
    drugName: string;
    /** Current per-strip selling price, used to catch packet-cost entry mistakes */
    currentPrice?: number | null;
    onClose: () => void;
}

function SupplierCombobox({ suppliers, value, onChange }: {
    suppliers: Supplier[];
    value: string;
    onChange: (id: string) => void;
}) {
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = suppliers.find(s => s.id === value);
    const filtered = suppliers.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setSearch("");
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const select = (id: string) => {
        onChange(id);
        setOpen(false);
        setSearch("");
    };

    return (
        <div ref={containerRef} className="relative">
            <div
                className="flex items-center gap-2 w-full rounded-lg border border-border bg-background px-3 py-2 cursor-pointer focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/20"
                onClick={() => { setOpen(true); inputRef.current?.focus(); }}
            >
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                    ref={inputRef}
                    type="text"
                    className="flex-1 bg-transparent outline-none text-sm text-right placeholder:text-muted-foreground"
                    placeholder={selected ? selected.name : "اكتب للبحث عن مورد..."}
                    value={open ? search : (selected?.name ?? "")}
                    onChange={e => { setSearch(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    dir="rtl"
                />
                {value && (
                    <button type="button" onClick={e => { e.stopPropagation(); select(""); }}
                        className="shrink-0 text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
                <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            </div>

            {open && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-muted-foreground text-center">لا توجد نتائج</p>
                    ) : (
                        filtered.map(s => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => select(s.id)}
                                className={`w-full text-right px-4 py-2.5 text-sm hover:bg-muted transition-colors block ${s.id === value ? "bg-primary/10 text-primary font-semibold" : "text-foreground"}`}
                            >
                                {s.name}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

export default function AddBatchModal({ inventoryId, drugName, currentPrice, onClose }: AddBatchModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [supplierId, setSupplierId] = useState("");
    const [mounted, setMounted] = useState(false);
    const [packetPrice, setPacketPrice] = useState(0);
    const [stripsPerPacket, setStripsPerPacket] = useState(1);
    const computedCost = stripsPerPacket > 0 ? packetPrice / stripsPerPacket : 0;
    const { confirm, dialog: confirmDialog } = useConfirm();

    const router = useRouter();

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        fetch("/api/suppliers")
            .then(r => r.ok ? r.json() : [])
            .then(setSuppliers)
            .catch(() => { });
    }, []);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const formData = new FormData(e.currentTarget);

        // الكمية صفر = لا يُقبل الحفظ
        const qty = parseInt(formData.get("quantity") as string, 10) || 0;
        if (qty <= 0) {
            setError("لا يمكن الحفظ: الكمية يجب أن تكون أكبر من صفر");
            return;
        }
        // سعر الباكيت أقل من 125 دينار = تحذير وتأكيد قبل الحفظ
        if (packetPrice < 125) {
            const ok = await confirm({
                title: "سعر الباكيت منخفض",
                message: `سعر الباكيت المدخل (${packetPrice.toLocaleString("en")} د.ع) أقل من 125 دينار.\nتأكد أنه سعر الباكيت الصحيح.`,
                variant: "warning",
            });
            if (!ok) return;
        }
        // عدد الأشرطة في الباكيت يساوي الكمية الكلية أو مرتفع جداً = غالباً أُدخل الإجمالي بالخطأ
        if (stripsPerPacket > 20 || (qty > 10 && stripsPerPacket >= qty)) {
            const ok = await confirm({
                title: "عدد الأشرطة يبدو غير صحيح",
                message:
                    `عدد الأشرطة في الباكيت (${stripsPerPacket}) يبدو غير صحيح.\n` +
                    `هذا الحقل يعني عدد الأشرطة داخل الباكيت الواحد، وليس إجمالي الأشرطة المستلمة (الكمية المدخلة: ${qty}).\n` +
                    `سعر التكلفة للشريط سيُحسب: ${packetPrice} ÷ ${stripsPerPacket} = ${computedCost.toLocaleString("en", { maximumFractionDigits: 2 })} د.ع`,
                variant: "warning",
            });
            if (!ok) return;
        }
        // التكلفة للشريط أعلى من سعر البيع الحالي = غالباً أُدخل سعر الباكيت بدون قسمة
        if (currentPrice != null && currentPrice > 0 && computedCost >= currentPrice) {
            const ok = await confirm({
                title: "التكلفة أعلى من سعر البيع",
                message:
                    `سعر التكلفة للشريط (${computedCost.toLocaleString("en", { maximumFractionDigits: 2 })} د.ع) ` +
                    `أعلى من أو يساوي سعر البيع الحالي للشريط (${currentPrice.toLocaleString("en")} د.ع).\n` +
                    `غالباً أُدخل سعر الباكيت دون تحديد عدد الأشرطة الصحيح.`,
                variant: "danger",
            });
            if (!ok) return;
        }
        // تصحيح سنة الصلاحية (27 → 2027) والتحذير من التواريخ المنتهية/البعيدة
        const expiry = checkExpiry(formData.get("expiryDate") as string);
        if (expiry.warning) {
            const ok = await confirm({
                title: "تحقق من تاريخ الانتهاء",
                message: expiry.warning,
                variant: expiry.severity ?? "warning",
            });
            if (!ok) return;
        }
        formData.set("expiryDate", expiry.value);

        setLoading(true);
        setError("");

        formData.set("inventoryId", inventoryId);
        formData.set("supplierId", supplierId);
        formData.set("costPrice", String(computedCost));

        try {
            const result = await addBatch(null, formData);

            if (result?.message) {
                setError(result.message);
                return;
            }

            onClose();
            router.refresh();
        } catch (submitError) {
            console.error("Add batch failed:", submitError);
            setError("حدث خطأ غير متوقع أثناء إضافة الدفعة.");
        } finally {
            setLoading(false);
        }
    };

    if (!mounted) return null;

    return (
        <>
            {confirmDialog}
            {createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" onClick={onClose}>
            <div
                className="bg-card rounded-xl p-6 w-full max-w-md shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-foreground">إضافة دفعة جديدة</h3>
                    <button type="button" onClick={onClose} className="p-2 hover:bg-muted rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <p className="text-sm text-muted-foreground mb-4">
                    للدواء: <span className="font-bold text-foreground">{drugName}</span>
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">المورد (اختياري)</label>
                        <SupplierCombobox suppliers={suppliers} value={supplierId} onChange={setSupplierId} />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">الكمية</label>
                        <input
                            type="number"
                            name="quantity"
                            required
                            min="1"
                            className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
                            placeholder="0"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            * لا يُقبل الحفظ إذا كانت الكمية صفر
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-foreground mb-2">سعر التكلفة (من الباكيت)</label>
                        <div className="grid grid-cols-2 gap-3 mb-2">
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">سعر الباكيت</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={packetPrice || ""}
                                    onChange={(e) => setPacketPrice(parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">عدد الأشرطة في الباكيت</label>
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={stripsPerPacket || ""}
                                    onChange={(e) => setStripsPerPacket(Math.max(1, parseInt(e.target.value) || 1))}
                                    placeholder="1"
                                    className="w-full rounded-lg border border-border bg-background px-4 py-2 focus:border-primary focus:ring-2 focus:ring-ring/20"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 mb-2">
                            <span className="text-xs text-muted-foreground">سعر التكلفة للشريط:</span>
                            <span className="text-sm font-bold text-primary mr-auto tabular-nums">
                                {packetPrice > 0
                                    ? `${packetPrice} ÷ ${stripsPerPacket} = ${computedCost.toLocaleString("en", { maximumFractionDigits: 2 })}`
                                    : "—"}
                            </span>
                        </div>
                        {packetPrice > 0 && packetPrice < 125 && (
                            <p className="text-xs font-bold text-warning flex items-center gap-1">
                                <span>⚠</span>
                                سعر الباكيت أقل من 125 دينار — سيظهر تأكيد عند الحفظ
                            </p>
                        )}
                        {stripsPerPacket > 20 && (
                            <p className="text-xs font-bold text-warning flex items-center gap-1">
                                <span>⚠</span>
                                هذا الحقل هو عدد الأشرطة داخل الباكيت الواحد وليس إجمالي الأشرطة — سيظهر تأكيد عند الحفظ
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-foreground mb-1">تاريخ انتهاء الصلاحية</label>
                        <ExpiryDateField name="expiryDate" required />
                    </div>

                    {error && <p className="text-sm text-destructive bg-destructive/10 p-2 rounded-lg">{error}</p>}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-lg font-bold disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" />
                            {loading ? "جاري الإضافة..." : "إضافة الدفعة"}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 bg-muted hover:bg-muted/80 text-muted-foreground rounded-lg font-bold"
                        >
                            إلغاء
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
            )}
        </>
    );
}
