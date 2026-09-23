"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { addBatch } from "@/app/lib/actions/inventory";
import ExpiryDateField, { checkExpiry } from "./expiry-date-field";
import { useConfirm } from "../confirm-dialog";

/**
 * فارق التكلفة فوق سعر البيع الذي يُعتبر خطأ إدخال شبه مؤكد (دينار).
 * تجاوزه يعني غالباً أن سعر الباكيت أُدخل دون قسمته على عدد الأشرطة. *
 * ما دون هذا الفارق **حالة مشروعة** لا خطأ: أصناف تُباع بكلفتها أو بخسارة
 * طفيفة موجودة فعلاً (سعر شراء تغيّر ولم يلحقه سعر البيع، أو صنف يُباع خدمةً
 * للزبون). إظهار تأكيد لها في كل دفعة يُعوّد المستخدم على التخطي بلا قراءة،
 * فيضيع التحذير في الحالة التي تهمّ فعلاً.
 */
const COST_OVER_PRICE_GAP = 500;

interface Supplier { id: string; name: string; }

/** آخر كلفة مسجَّلة لهذا الدواء — سعر شريط دائماً (انظر /api/inventory/last-cost). */
interface LastCost {
    stripPrice: number;
    /** null حين تعبئة الدواء غير مسجَّلة — فلا يُعرض سعر باكيت مخترَع. */
    packetPrice: number | null;
    recordedAt: string;
    supplierName: string | null;
}

interface AddBatchModalProps {
    inventoryId: string;
    drugName: string;
    /** Current per-strip selling price, used to catch packet-cost entry mistakes */
    currentPrice?: number | null;
    /**
     * بيانات التعبئة وآخر كلفة، تمرّ من الجدول الذي يملكها أصلاً فتظهر
     * النافذة مكتملة فوراً. غيابها يُفعّل الجلب الاحتياطي — مطلوب لمستدعٍ
     * لا يملكها مثل الإدخال السريع بالباركود.
     */
    unitsPerPack?: number | null;
    unitsPerPackConfirmed?: boolean;
    lastStripCost?: number | null;
    lastCostAt?: string | null;
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

export default function AddBatchModal({
    inventoryId,
    drugName,
    currentPrice,
    unitsPerPack: unitsPerPackProp,
    unitsPerPackConfirmed: unitsConfirmedProp,
    lastStripCost: lastStripCostProp,
    lastCostAt: lastCostAtProp,
    onClose,
}: AddBatchModalProps) {
    /** وصلت البيانات مع الخصائص؟ إذن لا جلب ولا انتظار. */
    const hasPreloaded = unitsConfirmedProp !== undefined;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [supplierId, setSupplierId] = useState("");
    const [mounted, setMounted] = useState(false);
    /**
     * سعر الباكيت يُملأ تلقائياً من آخر دفعة: كلفة الشريط × عدد الأشرطة.
     * لا حاجة لتخزينه مستقلاً — الطرفان محفوظان فالضرب يردّ الرقم نفسه،
     * وأي تعديل يحفظه الصيدلاني يصير هو «آخر سعر باكيت» في المرة التالية.
     */
    const [packetPrice, setPacketPrice] = useState(
        unitsConfirmedProp && unitsPerPackProp && lastStripCostProp != null
            ? Math.round(lastStripCostProp * unitsPerPackProp * 100) / 100
            : 0,
    );
    /** لمس المستخدم خانة السعر؟ عندئذ يتوقف الاشتقاق التلقائي. */
    const packetTouched = useRef(false);
    // ميزة وحدة التسعير: عدد الأشرطة يبدأ **فارغاً** (null) لا بالقيمة 1.
    // القيمة 1 مشروعة وشائعة جداً — كثير من الأدوية باكيتها شريط واحد — لكن
    // وضعها افتراضياً يجعل «العلبة فيها شريط واحد» و«لم ينتبه الصيدلاني للخانة»
    // رقماً واحداً لا يُفرَّق بينهما، والحساب سعر الباكيت ÷ العدد، فيُحفظ سعر
    // الباكيت كاملاً في حقل سعر الشريط. هذا هو العطب الذي أفسد تكاليف
    // نيسان–حزيران. الفارغ يُجبر على اختيار صريح، ويقبل 1 كأي رقم آخر.
    const [stripsPerPacket, setStripsPerPacket] = useState<number | null>(
        unitsConfirmedProp && unitsPerPackProp ? unitsPerPackProp : null,
    );
    const [lastCost, setLastCost] = useState<LastCost | null>(
        hasPreloaded && lastStripCostProp != null && lastCostAtProp
            ? { stripPrice: lastStripCostProp, packetPrice: null, recordedAt: lastCostAtProp, supplierName: null }
            : null,
    );
    const [unitsPerPack, setUnitsPerPack] = useState<number | null>(unitsPerPackProp ?? null);
    /** هل أكّد صيدلاني هذا العدد بنفسه؟ الرقم المستنتَج موجود وغير مؤكَّد. */
    const [unitsConfirmed, setUnitsConfirmed] = useState(Boolean(unitsConfirmedProp));
    /**
     * هل وصل جواب الخادم؟ قبله لا نعرف شيئاً عن حالة الدواء: قيمة
     * unitsConfirmed الابتدائية false ليست إجابة بـ«غير مؤكّد» بل غياب
     * إجابة. الخلط بينهما كان يُومِض تحذير «تأكّد من العدد» ثانيةً على كل
     * دواء حتى المؤكّد منه، وتحذير يظهر ثم يختفي بلا سبب يُفقِد
     * التحذيرات كلّها مصداقيتها.
     */
    const [unitsLoaded, setUnitsLoaded] = useState(hasPreloaded);
    /**
     * لمس المستخدم خانة العدد قبل وصول الجواب؟ عندئذٍ لا تُدهَس
     * كتابته بالقيمة القادمة من الخادم — السريع في الإدخال يسبق الشبكة فعلاً.
     */
    const stripsTouched = useRef(false);
    const computedCost = stripsPerPacket && stripsPerPacket > 0 ? packetPrice / stripsPerPacket : 0;
    const { confirm, dialog: confirmDialog } = useConfirm();

    const router = useRouter();

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        fetch("/api/suppliers")
            .then(r => r.ok ? r.json() : [])
            .then(setSuppliers)
            .catch(() => { });
    }, []);

    // آخر كلفة مسجَّلة لهذا الدواء. لا تُملأ الحقول تلقائياً — تُعرض للمستخدم
    // ويضغط «استخدامه». التعبئة الصامتة كانت ستحوّل السعر المتكرر (وهو الحال
    // الغالب) إلى رقم لا يراجعه أحد، وهذا بالضبط ما أنتج أخطاء الكلفة سابقاً.
    useEffect(() => {
        if (hasPreloaded) return; // البيانات وصلت مع الخصائص — لا رحلة شبكة
        let cancelled = false;
        fetch(`/api/inventory/last-cost?inventoryId=${encodeURIComponent(inventoryId)}`)
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
                if (cancelled || !data) return;
                setLastCost(data.lastCost ?? null);
                setUnitsPerPack(data.unitsPerPack ?? null);
                setUnitsConfirmed(Boolean(data.unitsPerPackConfirmed));
                // يُعبَّأ العدد تلقائياً **فقط** إن كان مؤكَّداً من صيدلاني.
                // الرقم المستنتَج يُعرض كاقتراح بجانب الخانة لا داخلها، كي لا
                // يمرّ بالحفظ دون أن ينظر إليه أحد.
                if (data.unitsPerPackConfirmed && data.unitsPerPack && !stripsTouched.current) {
                    setStripsPerPacket(data.unitsPerPack);
                    const cost = data.lastCost?.stripPrice;
                    if (typeof cost === "number" && !packetTouched.current) {
                        setPacketPrice(Math.round(cost * data.unitsPerPack * 100) / 100);
                    }
                }
            })
            .catch(() => { })
            .finally(() => { if (!cancelled) setUnitsLoaded(true); });
        return () => { cancelled = true; };
    }, [inventoryId, hasPreloaded]);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const formData = new FormData(e.currentTarget);

        // الكمية صفر = لا يُقبل الحفظ
        const qty = parseInt(formData.get("quantity") as string, 10) || 0;
        if (qty <= 0) {
            setError("لا يمكن الحفظ: الكمية يجب أن تكون أكبر من صفر");
            return;
        }
        // عدد الأشرطة شرط للحفظ: هو المقسوم عليه، وبدونه لا تُعرف كلفة الشريط.
        // لا يُفترض 1 صامتاً — انظر تعليق stripsPerPacket أعلاه.
        if (!stripsPerPacket || stripsPerPacket <= 0) {
            setError("لا يمكن الحفظ: اكتب عدد الأشرطة في الباكيت الواحد (اعدُدها من العلبة).");
            return;
        }
        if (!Number.isFinite(computedCost) || computedCost <= 0) {
            setError("لا يمكن الحفظ: أدخل سعر الباكيت.");
            return;
        }
        // تغيير عدد مؤكَّد سابقاً ليس إدخالاً عادياً بل تصحيح بيانات يمسّ كل
        // الصيدليات، فيُطلب إقرار صريح بدل أن يمرّ ضمن حفظ دفعة روتيني.
        if (unitsConfirmed && unitsPerPack !== null && stripsPerPacket !== unitsPerPack) {
            const ok = await confirm({
                title: "تغيير عدد أشرطة مؤكَّد سابقاً",
                message:
                    `عدد الأشرطة المسجَّل لهذا الدواء ${unitsPerPack}، وأنت تجعله ${stripsPerPacket}.
` +
                    `هذا العدد مشترك بين كل الصيدليات وسيُعتمد لديها جميعاً.`,
                variant: "warning",
            });
            if (!ok) return;
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
        if (currentPrice != null && currentPrice > 0 && computedCost - currentPrice >= COST_OVER_PRICE_GAP) {
            const gap = computedCost - currentPrice;
            const fmtCost = computedCost.toLocaleString("en", { maximumFractionDigits: 2 });
            const fmtPrice = currentPrice.toLocaleString("en");
            const fmtGap = gap.toLocaleString("en", { maximumFractionDigits: 2 });
            const ok = await confirm({
                title: `التكلفة أعلى من سعر البيع بأكثر من ${COST_OVER_PRICE_GAP} دينار`,
                message:
                    `سعر التكلفة للشريط (${fmtCost} د.ع) أعلى من سعر البيع الحالي للشريط (${fmtPrice} د.ع) بفارق ${fmtGap} د.ع.
` +
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
        // المحفوظ سعر الشريط في الحالتين — Batch.costPrice وحدته الشريط.
        // ملاحظة مقصودة: stripsPerPacket لا يُرسَل ولا يُحفظ. تسجيله من هنا كان
        // سيملأ تعبئة الأدوية بأرقام لم يراجعها أحد؛ القرار أن تبقى فارغة حتى
        // تُراجَع صراحةً، وهذا الحقل يبقى آلةً حاسبةً لحظية لا مصدرَ بيانات.
        formData.set("costPrice", String(computedCost));
        // يُحفظ على الدواء مع تاريخ تأكيده، فلا يُسأل عنه مجدداً — هذه اللحظة
        // هي الوحيدة التي يكون فيها الصيدلاني ممسكاً بالعلبة.
        formData.set("unitsPerPack", String(stripsPerPacket));

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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={onClose}>
            <div
                className="bg-card rounded-xl p-4 sm:p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto"
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
                        <label className="block text-sm font-bold text-foreground mb-2">
                            سعر التكلفة <span className="text-xs font-normal text-muted-foreground">(يُحفظ سعر الشريط)</span>
                        </label>

                        {lastCost && (
                            <div className="flex flex-wrap items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2 mb-2">
                                <span className="text-xs text-muted-foreground">
                                    آخر كلفة مسجَّلة:{" "}
                                    <span className="font-bold text-foreground tabular-nums">
                                        {lastCost.stripPrice.toLocaleString("en", { maximumFractionDigits: 2 })} د.ع
                                    </span>{" "}
                                    للشريط
                                    {lastCost.supplierName ? ` — ${lastCost.supplierName}` : ""}
                                    {` · ${lastCost.recordedAt.slice(0, 10)}`}
                                </span>
                                {/* زرّ «استخدام هذا السعر» أُزيل: السعر يُملأ تلقائياً عند
                                    الفتح، ومطالبة الصيدلاني بضغطة إضافية ليسترجع رقماً محفوظاً
                                    عندنا عمل بلا مقابل. */}
                                {packetPrice > 0 && !packetTouched.current && (
                                    <span className="mr-auto rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                                        جُلِب تلقائياً — عدّله إن تغيّر السعر
                                    </span>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 mb-2">
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">سعر الباكيت</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={packetPrice || ""}
                                    onChange={(e) => {
                                        packetTouched.current = true;
                                        setPacketPrice(parseFloat(e.target.value) || 0);
                                    }}
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
                                    value={stripsPerPacket ?? ""}
                                    onChange={(e) => {
                                        stripsTouched.current = true;
                                        const v = parseInt(e.target.value, 10);
                                        const next = Number.isInteger(v) && v > 0 ? v : null;
                                        setStripsPerPacket(next);
                                        // العدد هو معامل الاشتقاق، فتغيّره يُعيد حساب سعر
                                        // الباكيت ما دام المستخدم لم يكتبه بيده.
                                        if (next && lastCost && !packetTouched.current) {
                                            setPacketPrice(Math.round(lastCost.stripPrice * next * 100) / 100);
                                        }
                                    }}
                                    placeholder="اعدُدها من العلبة"
                                    className={`w-full rounded-lg border bg-background px-4 py-2 focus:ring-2 focus:ring-ring/20 ${
                                        !unitsLoaded || unitsConfirmed
                                            ? "border-border focus:border-primary"
                                            : "border-warning/60 focus:border-warning"
                                    }`}
                                />
                            </div>
                        </div>

                        {/* الحقل المحفوظ فعلاً — يُعرض في الطريقتين بنفس الوسم كي
                            لا يبقى أحد في شكّ عن وحدة ما يُخزَّن. */}
                        <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 mb-2">
                            <span className="text-xs text-muted-foreground">سعر التكلفة للشريط (المحفوظ):</span>
                            <span className="text-sm font-bold text-primary mr-auto tabular-nums">
                                {computedCost > 0
                                    ? `${packetPrice} ÷ ${stripsPerPacket} = ${computedCost.toLocaleString("en", { maximumFractionDigits: 2 })}`
                                    : "—"}
                            </span>
                        </div>
                        {/* إشارة التحقق — تظهر ما دام العدد غير مؤكَّد من صيدلاني،
                            وتختفي نهائياً بعد أول حفظ لأن الحفظ يسجّل تاريخ التأكيد.
                            الرقم المستنتَج يُعرض هنا كاقتراح لا داخل الخانة، كي لا
                            يمرّ بالحفظ دون أن ينظر إليه أحد. */}
                        {unitsLoaded && !unitsConfirmed && (
                            <div className="mb-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2">
                                <p className="text-xs font-bold text-warning flex items-start gap-1">
                                    <span>⚠</span>
                                    يرجى التأكد من عدد أشرطة هذا الدواء — لم يُراجَع من قبل.
                                </p>
                                <p className="mt-1 pr-4 text-[11px] text-muted-foreground">
                                    {unitsPerPack !== null
                                        ? `الرقم المقترح من دفعاتك السابقة: ${unitsPerPack}. اعدُد أشرطة العلبة واكتب العدد الصحيح.`
                                        : "لا يوجد رقم مسجَّل لهذا الدواء. اعدُد أشرطة العلبة واكتب العدد."}
                                    {" "}يُحفظ مرة واحدة ولن يُطلب منك مجدداً.
                                </p>
                                {unitsPerPack !== null && stripsPerPacket !== unitsPerPack && (
                                    <button
                                        type="button"
                                        onClick={() => setStripsPerPacket(unitsPerPack)}
                                        className="mt-1.5 rounded-md border border-warning/50 px-2 py-0.5 text-[11px] font-bold text-warning hover:bg-warning/10"
                                    >
                                        استخدام الرقم المقترح ({unitsPerPack})
                                    </button>
                                )}
                            </div>
                        )}
                        {packetPrice > 0 && packetPrice < 125 && (
                            <p className="text-xs font-bold text-warning flex items-center gap-1">
                                <span>⚠</span>
                                سعر الباكيت أقل من 125 دينار — سيظهر تأكيد عند الحفظ
                            </p>
                        )}
                        {stripsPerPacket !== null && stripsPerPacket > 20 && (
                            <p className="text-xs font-bold text-warning flex items-center gap-1">
                                <span>⚠</span>
                                هذا الحقل هو عدد الأشرطة داخل الباكيت الواحد وليس إجمالي الأشرطة — سيظهر تأكيد عند الحفظ
                            </p>
                        )}
                        {/* دون الحد: خبر لا إنذار — الحالة مشروعة ولا توقف الحفظ. */}
                        {currentPrice != null && currentPrice > 0 && computedCost > 0 && computedCost >= currentPrice && (
                            computedCost - currentPrice >= COST_OVER_PRICE_GAP ? (
                                <p className="text-xs font-bold text-destructive flex items-center gap-1">
                                    <span>⚠</span>
                                    {`التكلفة أعلى من سعر البيع بفارق ${(computedCost - currentPrice).toLocaleString("en", { maximumFractionDigits: 2 })} د.ع — سيظهر تأكيد عند الحفظ`}
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    {`التكلفة أعلى من سعر البيع بفارق ${(computedCost - currentPrice).toLocaleString("en", { maximumFractionDigits: 2 })} د.ع — فارق طفيف، يُحفظ بلا تأكيد.`}
                                </p>
                            )
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
